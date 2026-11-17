import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Identity, IdentityInput, KeyImportResult, SshKey } from '@shared/vault'
import type { CatalogRepo } from './catalog-repo'
import type { DataKeyCipher } from './key-crypto'
import type { SecretStore } from './secrets'
import type { VaultRepo } from './vault-repo'
import { generateKey, inspectPrivateKey, inspectPublicKey, looksLikePrivateKey } from './ssh-keys'

export const keyPassphraseAccount = (id: string): string => `key:${id}:passphrase`
export const identityPasswordAccount = (id: string): string => `identity:${id}:password`

/** Thrown when a key needs a passphrase the user has to type. The renderer recognises the marker. */
export class NeedPassphraseError extends Error {
  constructor(keyId: string, label: string, wrong = false) {
    super(`[[${wrong ? 'BAD' : 'NEED'}_PASSPHRASE:${keyId}:${label}]] ${wrong ? 'Неверная парольная фраза' : 'Нужна парольная фраза'} для ключа «${label}»`)
  }
}

const SKIP = /^(known_hosts.*|authorized_keys.*|config|.*\.pub|.*\.txt|.*\.json|.*\.md)$/i

export class KeyService {
  constructor(
    private readonly catalog: CatalogRepo,
    private readonly hosts: VaultRepo,
    private readonly cipher: DataKeyCipher,
    private readonly secrets: SecretStore
  ) {}

  /** Adds one private key from text. Returns null when an identical key already exists. */
  async addKey(label: string, text: string, publicText?: string): Promise<SshKey | null> {
    const clean = label.trim().slice(0, 120) || 'key'
    const info = inspectPrivateKey(text, undefined, publicText)
    if (info.fingerprint && this.catalog.findKeyByFingerprint(info.fingerprint)) return null
    if (!info.fingerprint && this.catalog.listKeys().some((k) => k.label === clean && !k.fingerprint)) return null
    const key = this.catalog.insertKey({ label: clean, ...info }, await this.cipher.encrypt(text))
    this.hosts.bindKeyHint(clean, key.id)
    return key
  }

  async importFiles(paths: string[]): Promise<KeyImportResult> {
    const res: KeyImportResult = { added: [], skipped: [], bound: 0 }
    for (const p of paths.slice(0, 500)) {
      const name = basename(p)
      try {
        if (SKIP.test(name)) continue
        const st = await stat(p)
        if (!st.isFile() || st.size > 64 * 1024) {
          res.skipped.push(`${name}: не файл ключа`)
          continue
        }
        const text = await readFile(p, 'utf-8')
        if (!looksLikePrivateKey(text)) {
          res.skipped.push(`${name}: не приватный ключ`)
          continue
        }
        const pub = await readFile(`${p}.pub`, 'utf-8').catch(() => undefined)
        const before = this.boundCount(name)
        const key = await this.addKey(name.replace(/\.(pem|key|ppk)$/i, ''), text, pub)
        if (key) {
          res.added.push(key)
          res.bound += this.boundCount(name) - before
        } else res.skipped.push(`${name}: уже есть`)
      } catch (e) {
        res.skipped.push(`${name}: ${(e as Error).message}`)
      }
    }
    return res
  }

  /** Imports every private key in a folder (and one level of subfolders). */
  async importFolder(dir: string): Promise<KeyImportResult> {
    const files: string[] = []
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isFile()) files.push(join(dir, e.name))
      else if (e.isDirectory() && !e.name.startsWith('.')) {
        for (const s of await readdir(join(dir, e.name), { withFileTypes: true }).catch(() => [])) if (s.isFile()) files.push(join(dir, e.name, s.name))
      }
    }
    return this.importFiles(files)
  }

  async generate(opts: { label: string; type: 'ed25519' | 'rsa'; bits?: number; passphrase?: string; rememberPassphrase?: boolean }): Promise<SshKey> {
    if (opts.type === 'rsa' && ![2048, 3072, 4096].includes(opts.bits ?? 4096)) throw new Error('RSA: 2048, 3072 или 4096 бит')
    const pair = generateKey(opts.type, { bits: opts.bits, comment: opts.label, passphrase: opts.passphrase || undefined })
    const info = opts.passphrase ? inspectPrivateKey(pair.private, opts.passphrase) : inspectPrivateKey(pair.private)
    const key = this.catalog.insertKey({ label: opts.label.trim() || `${opts.type}-key`, ...info, encrypted: Boolean(opts.passphrase) }, await this.cipher.encrypt(pair.private))
    if (opts.passphrase && opts.rememberPassphrase) await this.rememberPassphrase(key.id, opts.passphrase)
    return this.catalog.getKey(key.id)!
  }

  async deleteKey(id: string): Promise<void> {
    this.catalog.deleteKey(id)
    await this.secrets.delete(keyPassphraseAccount(id))
  }

  async forgetPassphrase(id: string): Promise<void> {
    await this.secrets.delete(keyPassphraseAccount(id))
    this.catalog.setKeyHasPassphrase(id, false)
  }

  private async rememberPassphrase(id: string, passphrase: string): Promise<void> {
    await this.secrets.set(keyPassphraseAccount(id), passphrase)
    this.catalog.setKeyHasPassphrase(id, true)
  }

  /** Private key text plus passphrase for ssh2. Throws NeedPassphraseError when one is required. */
  async unlock(keyId: string, passphrase?: string, remember = false): Promise<{ privateKey: string; passphrase?: string }> {
    const key = this.catalog.getKey(keyId)
    const blob = this.catalog.getKeyBlob(keyId)
    if (!key || !blob) throw new Error('Ключ не найден')
    const privateKey = await this.cipher.decrypt(blob)
    if (!key.encrypted) return { privateKey }
    const pp = passphrase ?? (key.hasPassphrase ? ((await this.secrets.get(keyPassphraseAccount(keyId))) ?? undefined) : undefined)
    if (!pp) throw new NeedPassphraseError(keyId, key.label)
    let info
    try {
      info = inspectPrivateKey(privateKey, pp)
    } catch {
      throw new NeedPassphraseError(keyId, key.label, true)
    }
    this.catalog.completeKey(keyId, info)
    if (passphrase && remember) await this.rememberPassphrase(keyId, passphrase)
    return { privateKey, passphrase: pp }
  }

  publicKeyOf(id: string): string {
    const k = this.catalog.getKey(id)
    if (!k?.publicKey) throw new Error('Публичная часть ключа неизвестна — подключитесь им один раз, чтобы её вычислить')
    return k.publicKey
  }

  // ---- identities ----
  async saveIdentity(input: IdentityInput, password: string | null | undefined): Promise<Identity> {
    const label = (input.label ?? '').trim().slice(0, 120)
    const username = (input.username ?? '').trim()
    if (!username || username.length > 128) throw new Error('Пользователь: обязательное поле')
    const ident = this.catalog.saveIdentity({ id: input.id, label: label || username, username, keyId: input.keyId || null })
    if (password === null || password === '') {
      await this.secrets.delete(identityPasswordAccount(ident.id))
      this.catalog.setIdentityHasPassword(ident.id, false)
    } else if (typeof password === 'string') {
      if (password.length > 4096) throw new Error('Пароль слишком длинный')
      await this.secrets.set(identityPasswordAccount(ident.id), password)
      this.catalog.setIdentityHasPassword(ident.id, true)
    }
    return this.catalog.getIdentity(ident.id)!
  }

  async deleteIdentity(id: string): Promise<void> {
    this.catalog.deleteIdentity(id)
    await this.secrets.delete(identityPasswordAccount(id))
  }

  identityPassword(id: string): Promise<string | null> {
    return this.secrets.get(identityPasswordAccount(id))
  }

  private boundCount(name: string): number {
    const hint = name.replace(/\.(pem|key|ppk)$/i, '').toLowerCase()
    return this.hosts.listHosts().filter((h) => h.keyHint?.toLowerCase() === hint && h.keyId).length
  }
}

export { inspectPublicKey }
