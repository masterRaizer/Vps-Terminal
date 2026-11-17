import { DEFAULT_HOST_OPTIONS, type Integration, type IntegrationInput, type SyncResult } from '@shared/vault'
import type { CatalogRepo } from './catalog-repo'
import type { GeoIp } from './geoip'
import type { SecretStore } from './secrets'
import type { VaultRepo } from './vault-repo'

export const integrationSecretAccount = (id: string): string => `integration:${id}:secret`
export const MISSING_TAG = 'нет в панели'
const PANEL_TAG = 'remnawave'

export interface RemnawaveNode {
  uuid: string
  name: string
  address: string
  countryCode: string
  tags: string[]
  isDisabled: boolean
}

export function normalizePanelUrl(raw: string): string {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    throw new Error('Адрес панели: нужен полный URL, например https://panel.example.com')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Адрес панели: только http(s)')
  if (u.username || u.password) throw new Error('Адрес панели: без логина и пароля в URL')
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`
}

/** Minimal Remnawave REST client (contract @remnawave/backend-contract 3.x). */
export class RemnawaveClient {
  constructor(private readonly baseUrl: string, private readonly fetchImpl: typeof fetch = fetch) {}

  private async call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      // Required by the backend when it is reached directly rather than through its reverse proxy.
      'x-forwarded-proto': 'https',
      'x-forwarded-for': '127.0.0.1'
    }
    if (init.body) headers['Content-Type'] = 'application/json'
    if (init.token) headers['Authorization'] = `Bearer ${init.token}`
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(20000), redirect: 'error' })
    } catch (e) {
      throw new Error(`Панель недоступна: ${(e as Error).message}`)
    }
    const text = await res.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`Панель ответила не JSON (HTTP ${res.status}) — проверьте адрес`)
    }
    if (res.status === 401 || res.status === 403) throw new Error(`Панель отклонила доступ (HTTP ${res.status}) — проверьте токен или логин`)
    if (!res.ok) {
      const msg = (body as { message?: string })?.message
      throw new Error(`Панель: HTTP ${res.status}${msg ? ` — ${msg}` : ''}`)
    }
    return body as T
  }

  async login(username: string, password: string): Promise<string> {
    const r = await this.call<{ response?: { accessToken?: string } }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
    const token = r.response?.accessToken
    if (!token) throw new Error('Панель не вернула токен сессии')
    return token
  }

  async nodes(token: string): Promise<RemnawaveNode[]> {
    const r = await this.call<{ response?: unknown }>('/api/nodes', { token })
    if (!Array.isArray(r.response)) throw new Error('Неожиданный ответ /api/nodes')
    return r.response.flatMap((n): RemnawaveNode[] => {
      const o = n as Record<string, unknown>
      if (typeof o.uuid !== 'string' || typeof o.address !== 'string' || !o.address.trim()) return []
      return [
        {
          uuid: o.uuid,
          name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 120) : o.address,
          address: o.address.trim(),
          countryCode: typeof o.countryCode === 'string' ? o.countryCode.toUpperCase() : '',
          tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string').slice(0, 20) : [],
          isDisabled: o.isDisabled === true
        }
      ]
    })
  }
}

export function validateIntegrationInput(raw: unknown): IntegrationInput {
  if (typeof raw !== 'object' || raw === null) throw new Error('Неверные данные интеграции')
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 80) : ''
  const url = normalizePanelUrl(String(r.url ?? ''))
  const authMode = r.authMode === 'login' ? 'login' : 'token'
  const login = typeof r.login === 'string' ? r.login.trim().slice(0, 128) : ''
  if (authMode === 'login' && !login) throw new Error('Укажите логин панели')
  const sshPort = Number(r.sshPort ?? 22)
  if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) throw new Error('SSH-порт: 1–65535')
  const sshUser = typeof r.sshUser === 'string' && r.sshUser.trim() ? r.sshUser.trim().slice(0, 128) : 'root'
  const identityId = typeof r.identityId === 'string' && r.identityId ? r.identityId : null
  return { id: typeof r.id === 'string' ? r.id : undefined, name: name || new URL(url).hostname, url, authMode, login, identityId, sshPort, sshUser }
}

export class RemnawaveSync {
  constructor(
    private readonly catalog: CatalogRepo,
    private readonly hosts: VaultRepo,
    private readonly secrets: SecretStore,
    private readonly geo: GeoIp | null,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async save(raw: unknown, secret: unknown): Promise<Integration> {
    const input = validateIntegrationInput(raw)
    if (secret !== undefined && secret !== null && (typeof secret !== 'string' || secret.length > 8192)) throw new Error('Неверный токен')
    const it = this.catalog.saveIntegration(input)
    if (typeof secret === 'string' && secret) {
      await this.secrets.set(integrationSecretAccount(it.id), secret)
      this.catalog.setIntegrationHasSecret(it.id, true)
    }
    return this.catalog.getIntegration(it.id)!
  }

  async remove(id: string): Promise<void> {
    this.catalog.deleteIntegration(id)
    await this.secrets.delete(integrationSecretAccount(id))
  }

  async sync(id: string): Promise<SyncResult> {
    const it = this.catalog.getIntegration(id)
    if (!it) throw new Error('Интеграция не найдена')
    try {
      const res = await this.run(it)
      this.catalog.setIntegrationResult(id, null)
      return res
    } catch (e) {
      this.catalog.setIntegrationResult(id, (e as Error).message)
      throw e
    }
  }

  private async run(it: Integration): Promise<SyncResult> {
    const secret = await this.secrets.get(integrationSecretAccount(it.id))
    if (!secret) throw new Error(it.authMode === 'token' ? 'API-токен панели не сохранён' : 'Пароль панели не сохранён')
    const client = new RemnawaveClient(it.url, this.fetchImpl)
    const token = it.authMode === 'token' ? secret : await client.login(it.login, secret)
    const nodes = await client.nodes(token)

    // One group per panel; recreate it if the user deleted it.
    let groupId = it.groupId && this.hosts.listGroups().some((g) => g.id === it.groupId) ? it.groupId : null
    if (!groupId) {
      groupId = this.hosts.saveGroup({ name: it.name, parentId: null, color: '#7a3db8' }).id
      this.catalog.setIntegrationGroup(it.id, groupId)
    }

    const existing = new Map(this.hosts.hostsBySource(it.id).map((h) => [h.externalId, h]))
    const res: SyncResult = { created: 0, updated: 0, missing: 0, total: nodes.length }

    for (const n of nodes) {
      const panelCountry = /^[A-Z]{2}$/.test(n.countryCode) && n.countryCode !== 'XX' ? n.countryCode : null
      const country = panelCountry ?? (await this.geo?.countryOf(n.address).catch(() => null)) ?? null
      const countrySource = panelCountry ? ('panel' as const) : ('auto' as const)
      const panelTags = [PANEL_TAG, ...n.tags.map((t) => t.toLowerCase())]
      const h = existing.get(n.uuid)
      if (!h) {
        const created = this.hosts.saveHost({
          label: n.name,
          address: n.address,
          port: it.sshPort,
          username: it.sshUser,
          auth: 'password',
          keyId: null,
          groupId,
          color: null,
          tags: [...new Set(panelTags)],
          favorite: false,
          notes: '',
          options: { ...DEFAULT_HOST_OPTIONS },
          country,
          countrySource,
          identityId: it.identityId
        })
        this.hosts.setSource(created.id, it.id, n.uuid)
        res.created++
      } else {
        const tags = [...new Set([...h.tags.filter((t) => t !== MISSING_TAG), ...panelTags])]
        const { id, port, username, auth, keyId, groupId: g, color, favorite, notes, options } = h
        this.hosts.saveHost({
          id,
          label: n.name,
          address: n.address,
          port,
          username,
          auth,
          keyId,
          groupId: g,
          color,
          tags,
          favorite,
          notes,
          options,
          ...(h.countrySource === 'manual' ? {} : { country, countrySource }),
          identityId: h.identityId ?? it.identityId
        })
        existing.delete(n.uuid)
        res.updated++
      }
    }
    for (const h of existing.values()) {
      res.missing++
      if (h.tags.includes(MISSING_TAG)) continue
      const { id, label, address, port, username, auth, keyId, groupId: g, color, favorite, notes, options } = h
      this.hosts.saveHost({ id, label, address, port, username, auth, keyId, groupId: g, color, tags: [...h.tags, MISSING_TAG], favorite, notes, options })
    }
    return res
  }
}
