import { randomUUID } from 'node:crypto'
import type { Identity, Integration, KeyType, SshKey } from '@shared/vault'
import { tombstone, type Db } from './db'

interface KeyRow {
  id: string
  label: string
  type: KeyType
  bits: number | null
  public_key: string | null
  fingerprint: string | null
  encrypted: number
  has_passphrase: number
  private_enc: Buffer
  created_at: number
}
interface IdentityRow {
  id: string
  label: string
  username: string
  key_id: string | null
  has_password: number
  created_at: number
  updated_at: number
}
interface IntegrationRow {
  id: string
  kind: 'remnawave'
  name: string
  url: string
  auth_mode: 'token' | 'login'
  login: string
  group_id: string | null
  identity_id: string | null
  ssh_port: number
  ssh_user: string
  last_sync_at: number | null
  last_error: string | null
  has_secret: number
}

const toKey = (r: KeyRow): SshKey => ({
  id: r.id,
  label: r.label,
  type: r.type,
  bits: r.bits,
  publicKey: r.public_key,
  fingerprint: r.fingerprint,
  encrypted: r.encrypted === 1,
  hasPassphrase: r.has_passphrase === 1,
  createdAt: r.created_at
})
const toIdentity = (r: IdentityRow): Identity => ({
  id: r.id,
  label: r.label,
  username: r.username,
  keyId: r.key_id,
  hasPassword: r.has_password === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})
const toIntegration = (r: IntegrationRow): Integration => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  url: r.url,
  authMode: r.auth_mode,
  login: r.login,
  groupId: r.group_id,
  identityId: r.identity_id,
  sshPort: r.ssh_port,
  sshUser: r.ssh_user,
  lastSyncAt: r.last_sync_at,
  lastError: r.last_error,
  hasSecret: r.has_secret === 1
})

/** Persistence for keys, identities and integrations. */
export class CatalogRepo {
  constructor(private readonly db: Db, private readonly now: () => number = Date.now) {}

  // ---- keys ----
  listKeys(): SshKey[] {
    return (this.db.prepare('SELECT * FROM ssh_keys ORDER BY label COLLATE NOCASE').all() as KeyRow[]).map(toKey)
  }
  getKey(id: string): SshKey | null {
    const r = this.db.prepare('SELECT * FROM ssh_keys WHERE id = ?').get(id) as KeyRow | undefined
    return r ? toKey(r) : null
  }
  getKeyBlob(id: string): Buffer | null {
    const r = this.db.prepare('SELECT private_enc FROM ssh_keys WHERE id = ?').get(id) as { private_enc: Buffer } | undefined
    return r?.private_enc ?? null
  }
  findKeyByFingerprint(fp: string): SshKey | null {
    const r = this.db.prepare('SELECT * FROM ssh_keys WHERE fingerprint = ?').get(fp) as KeyRow | undefined
    return r ? toKey(r) : null
  }
  insertKey(k: Omit<SshKey, 'id' | 'createdAt' | 'hasPassphrase'>, blob: Buffer): SshKey {
    const id = randomUUID()
    this.db
      .prepare('INSERT INTO ssh_keys (id,label,type,bits,public_key,fingerprint,encrypted,has_passphrase,private_enc,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,?,?,?)')
      .run(id, k.label, k.type, k.bits, k.publicKey, k.fingerprint, k.encrypted ? 1 : 0, blob, this.now(), this.now())
    return this.getKey(id)!
  }
  renameKey(id: string, label: string): void {
    this.db.prepare('UPDATE ssh_keys SET label = ?, updated_at = ? WHERE id = ?').run(label, this.now(), id)
  }
  /** After the first successful unlock we learn the public half of an encrypted key. */
  completeKey(id: string, info: { type: KeyType; bits: number | null; publicKey: string | null; fingerprint: string | null }): void {
    this.db
      .prepare('UPDATE ssh_keys SET type = ?, bits = ?, public_key = ?, fingerprint = ?, updated_at = ? WHERE id = ? AND fingerprint IS NULL')
      .run(info.type, info.bits, info.publicKey, info.fingerprint, this.now(), id)
  }
  setKeyHasPassphrase(id: string, has: boolean): void {
    this.db.prepare('UPDATE ssh_keys SET has_passphrase = ?, updated_at = ? WHERE id = ?').run(has ? 1 : 0, this.now(), id)
  }
  deleteKey(id: string): void {
    this.db.transaction(() => {
      const t = this.now()
      this.db.prepare("UPDATE hosts SET key_id = NULL, auth = CASE WHEN auth = 'key' THEN 'password' ELSE auth END, updated_at = ? WHERE key_id = ?").run(t, id)
      this.db.prepare('UPDATE identities SET key_id = NULL, updated_at = ? WHERE key_id = ?').run(t, id)
      this.db.prepare('DELETE FROM ssh_keys WHERE id = ?').run(id)
      tombstone(this.db, 'ssh_keys', id, t)
    })()
  }

  // ---- identities ----
  listIdentities(): Identity[] {
    return (this.db.prepare('SELECT * FROM identities ORDER BY label COLLATE NOCASE').all() as IdentityRow[]).map(toIdentity)
  }
  getIdentity(id: string): Identity | null {
    const r = this.db.prepare('SELECT * FROM identities WHERE id = ?').get(id) as IdentityRow | undefined
    return r ? toIdentity(r) : null
  }
  saveIdentity(i: { id?: string; label: string; username: string; keyId: string | null }): Identity {
    if (i.keyId && !this.getKey(i.keyId)) throw new Error('Ключ не найден')
    const t = this.now()
    if (i.id && this.getIdentity(i.id)) {
      this.db.prepare('UPDATE identities SET label=?, username=?, key_id=?, updated_at=? WHERE id=?').run(i.label, i.username, i.keyId, t, i.id)
      return this.getIdentity(i.id)!
    }
    const id = i.id ?? randomUUID()
    this.db.prepare('INSERT INTO identities (id,label,username,key_id,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id, i.label, i.username, i.keyId, t, t)
    return this.getIdentity(id)!
  }
  setIdentityHasPassword(id: string, has: boolean): void {
    this.db.prepare('UPDATE identities SET has_password = ?, updated_at = ? WHERE id = ?').run(has ? 1 : 0, this.now(), id)
  }
  deleteIdentity(id: string): void {
    const t = this.now()
    this.db.prepare('UPDATE hosts SET identity_id = NULL, updated_at = ? WHERE identity_id = ?').run(t, id)
    this.db.prepare('UPDATE integrations SET identity_id = NULL, updated_at = ? WHERE identity_id = ?').run(t, id)
    this.db.prepare('DELETE FROM identities WHERE id = ?').run(id)
    tombstone(this.db, 'identities', id, t)
  }

  // ---- integrations ----
  listIntegrations(): Integration[] {
    return (this.db.prepare('SELECT * FROM integrations ORDER BY name COLLATE NOCASE').all() as IntegrationRow[]).map(toIntegration)
  }
  getIntegration(id: string): Integration | null {
    const r = this.db.prepare('SELECT * FROM integrations WHERE id = ?').get(id) as IntegrationRow | undefined
    return r ? toIntegration(r) : null
  }
  saveIntegration(i: Omit<Integration, 'id' | 'kind' | 'groupId' | 'lastSyncAt' | 'lastError' | 'hasSecret'> & { id?: string }): Integration {
    if (i.identityId && !this.getIdentity(i.identityId)) throw new Error('Профиль доступа не найден')
    if (i.id && this.getIntegration(i.id)) {
      this.db
        .prepare('UPDATE integrations SET name=?, url=?, auth_mode=?, login=?, identity_id=?, ssh_port=?, ssh_user=?, updated_at=? WHERE id=?')
        .run(i.name, i.url, i.authMode, i.login, i.identityId, i.sshPort, i.sshUser, this.now(), i.id)
      return this.getIntegration(i.id)!
    }
    const id = i.id ?? randomUUID()
    this.db
      .prepare("INSERT INTO integrations (id,kind,name,url,auth_mode,login,identity_id,ssh_port,ssh_user,created_at,updated_at) VALUES (?,'remnawave',?,?,?,?,?,?,?,?,?)")
      .run(id, i.name, i.url, i.authMode, i.login, i.identityId, i.sshPort, i.sshUser, this.now(), this.now())
    return this.getIntegration(id)!
  }
  setIntegrationGroup(id: string, groupId: string): void {
    this.db.prepare('UPDATE integrations SET group_id = ?, updated_at = ? WHERE id = ?').run(groupId, this.now(), id)
  }
  setIntegrationResult(id: string, error: string | null): void {
    this.db.prepare('UPDATE integrations SET last_sync_at = ?, last_error = ? WHERE id = ?').run(this.now(), error, id)
  }
  setIntegrationHasSecret(id: string, has: boolean): void {
    this.db.prepare('UPDATE integrations SET has_secret = ?, updated_at = ? WHERE id = ?').run(has ? 1 : 0, this.now(), id)
  }
  deleteIntegration(id: string): void {
    this.db.transaction(() => {
      const t = this.now()
      this.db.prepare('UPDATE hosts SET source = NULL, external_id = NULL, updated_at = ? WHERE source = ?').run(t, id)
      this.db.prepare('DELETE FROM integrations WHERE id = ?').run(id)
      tombstone(this.db, 'integrations', id, t)
    })()
  }
}
