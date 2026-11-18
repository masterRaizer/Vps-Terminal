import type { Db } from '../db'
import type { SecretStore } from '../secrets'
import { deriveKey, newSalt, open, parseEnvelope, seal, KDF } from './crypto'
import { emptyDoc, fingerprintDoc, merge, type SyncDoc } from './document'
import type { SyncLocalStore } from './local-store'

export interface SyncStatus {
  configured: boolean
  url: string | null
  syncing: boolean
  lastSyncAt: number | null
  lastError: string | null
  version: number
}

const TOKEN = 'sync:token'
const KEY = 'sync:key'

export function normalizeSyncUrl(raw: string): string {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    throw new Error('Адрес сервера: нужен полный URL, например https://sync.example.com')
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error('Сервер синхронизации — только https (http допустим лишь для localhost)')
  if (u.username || u.password || u.search || u.hash) throw new Error('Адрес сервера без логина, параметров и #')
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`
}

/** Pull → merge → apply → push, with optimistic versions on the server. */
export class SyncService {
  private timer: NodeJS.Timeout | null = null
  private running: Promise<void> | null = null
  private again = false
  private syncing = false

  constructor(
    private readonly db: Db,
    private readonly secrets: SecretStore,
    private readonly store: SyncLocalStore,
    private readonly onStatus: (s: SyncStatus) => void,
    private readonly onLocalChange: () => void,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private get(key: string): string | null {
    return (this.db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null
  }
  private set(key: string, value: string | null): void {
    if (value === null) this.db.prepare('DELETE FROM sync_state WHERE key = ?').run(key)
    else this.db.prepare('INSERT INTO sync_state (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
  }

  status(): SyncStatus {
    return {
      configured: Boolean(this.get('url')),
      url: this.get('url'),
      syncing: this.syncing,
      lastSyncAt: this.get('lastSyncAt') ? Number(this.get('lastSyncAt')) : null,
      lastError: this.get('lastError'),
      version: Number(this.get('version') ?? 0)
    }
  }

  private emit(): void {
    this.onStatus(this.status())
  }

  private async http(method: 'GET' | 'PUT', body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const url = this.get('url')
    const token = await this.secrets.get(TOKEN)
    if (!url || !token) throw new Error('Синхронизация не настроена')
    let res: Response
    try {
      res = await this.fetchImpl(`${url}/v1/vault`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
        redirect: 'error'
      })
    } catch (e) {
      throw new Error(`Сервер синхронизации недоступен: ${(e as Error).message}`)
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.status === 401) throw new Error('Сервер отклонил токен синхронизации')
    if (res.status === 413) throw new Error('Хранилище больше лимита сервера')
    if (res.status >= 500) throw new Error(`Ошибка сервера синхронизации (HTTP ${res.status})`)
    return { status: res.status, json }
  }

  /** Connects to a server. With an existing vault there, the master password must open it. */
  async configure(rawUrl: string, token: string, masterPassword: string): Promise<SyncStatus> {
    const url = normalizeSyncUrl(rawUrl)
    if (token.length < 16 || token.length > 512 || /\s/.test(token)) throw new Error('Токен: 16–512 символов без пробелов')
    const prevUrl = this.get('url')
    const prevToken = await this.secrets.get(TOKEN)
    this.set('url', url)
    await this.secrets.set(TOKEN, token)
    try {
      const { status, json } = await this.http('GET')
      let salt: Buffer
      let key: Buffer
      if (status === 200 && typeof json.blob === 'string') {
        const env = parseEnvelope(json.blob)
        salt = Buffer.from(env.kdf.salt, 'base64')
        key = await deriveKey(masterPassword, salt, env.kdf)
        open(json.blob, key) // throws on a wrong master password
      } else if (status === 404) {
        salt = newSalt()
        key = await deriveKey(masterPassword, salt)
      } else throw new Error(`Неожиданный ответ сервера (HTTP ${status})`)
      await this.secrets.set(KEY, key.toString('base64'))
      this.set('salt', salt.toString('base64'))
      this.set('version', '0')
      this.set('lastError', null)
    } catch (e) {
      // Roll back to the previous configuration.
      this.set('url', prevUrl)
      if (prevToken) await this.secrets.set(TOKEN, prevToken)
      else await this.secrets.delete(TOKEN)
      throw e
    }
    await this.syncNow()
    return this.status()
  }

  async disable(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    await this.secrets.delete(TOKEN)
    await this.secrets.delete(KEY)
    for (const k of ['url', 'salt', 'version', 'lastSyncAt', 'lastError', 'fingerprint']) this.set(k, null)
    this.emit()
  }

  /** Debounced sync after local edits. */
  schedule(delay = 2500): void {
    if (!this.get('url')) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.syncNow().catch(() => undefined), delay)
  }

  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = (async () => {
      do {
        this.again = false
        await this.cycle()
      } while (this.again)
    })().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async cycle(): Promise<void> {
    if (!this.get('url')) return
    this.syncing = true
    this.emit()
    try {
      const keyB64 = await this.secrets.get(KEY)
      const salt = this.get('salt')
      if (!keyB64 || !salt) throw new Error('Введите мастер-пароль синхронизации заново')
      const key = Buffer.from(keyB64, 'base64')
      for (let attempt = 0; attempt < 4; attempt++) {
        const { status, json } = await this.http('GET')
        let remote: SyncDoc = emptyDoc()
        let remoteVersion = 0
        if (status === 200 && typeof json.blob === 'string') {
          if (parseEnvelope(json.blob).kdf.salt !== salt) throw new Error('Мастер-пароль сменили на другом устройстве — введите его заново')
          remote = open<SyncDoc>(json.blob, key)
          remoteVersion = Number(json.version)
        } else if (status !== 404) throw new Error(`Неожиданный ответ сервера (HTTP ${status})`)

        const local = await this.store.export()
        const merged = merge(local, remote)
        const mergedFp = fingerprintDoc(merged)
        if (mergedFp !== fingerprintDoc(local)) {
          await this.store.apply(merged, local)
          this.onLocalChange()
        }
        if (status === 404 || mergedFp !== fingerprintDoc(remote)) {
          const put = await this.http('PUT', { baseVersion: remoteVersion, blob: seal(merged, key, Buffer.from(salt, 'base64'), KDF) })
          if (put.status === 409) continue // someone else pushed first: merge again
          if (put.status !== 200) throw new Error(`Сервер не принял изменения (HTTP ${put.status})`)
          remoteVersion = Number(put.json.version)
        }
        this.set('version', String(remoteVersion))
        this.set('lastSyncAt', String(Date.now()))
        this.set('lastError', null)
        return
      }
      throw new Error('Не удалось синхронизироваться: слишком много одновременных изменений')
    } catch (e) {
      this.set('lastError', (e as Error).message)
      throw e
    } finally {
      this.syncing = false
      this.emit()
    }
  }
}
