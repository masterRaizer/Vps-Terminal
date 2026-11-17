import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { utils } from 'ssh2'
import { DEFAULT_HOST_OPTIONS } from '../src/shared/vault'
import { openDb } from '../src/main/db'
import { MemorySecretStore } from '../src/main/secrets'
import { VaultRepo } from '../src/main/vault-repo'
import { VaultService } from '../src/main/vault-service'
import { CatalogRepo } from '../src/main/catalog-repo'
import { DataKeyCipher } from '../src/main/key-crypto'
import { KeyService } from '../src/main/key-service'

let repo: VaultRepo
let catalog: CatalogRepo
let keys: KeyService
let vault: VaultService
let secrets: MemorySecretStore

const host = (extra = {}) => ({ label: 'n1', address: '198.51.100.7', port: 22, username: 'root', auth: 'key', keyId: null, groupId: null, color: null, tags: [], favorite: false, notes: '', options: DEFAULT_HOST_OPTIONS, ...extra })

beforeEach(() => {
  const db = openDb(':memory:')
  repo = new VaultRepo(db)
  catalog = new CatalogRepo(db)
  secrets = new MemorySecretStore()
  keys = new KeyService(catalog, repo, new DataKeyCipher(secrets), secrets)
  vault = new VaultService(repo, secrets, { catalog, keys })
})

describe('KeyService', () => {
  it('imports a plain ed25519 key, encrypts it at rest, dedupes by fingerprint', async () => {
    const pair = utils.generateKeyPairSync('ed25519', { comment: 'me@pc' })
    const k = await keys.addKey('id_ed25519', pair.private)
    expect(k).toMatchObject({ type: 'ed25519', encrypted: false })
    expect(k!.fingerprint).toMatch(/^SHA256:/)
    expect(k!.publicKey).toBe(pair.public.trim())
    const blob = catalog.getKeyBlob(k!.id)!
    expect(blob.toString('utf-8')).not.toContain('OPENSSH PRIVATE KEY')
    expect((await keys.unlock(k!.id)).privateKey).toBe(pair.private)
    expect(await keys.addKey('copy', pair.private)).toBeNull()
  })

  it('handles a passphrase-protected key: needs, rejects wrong, remembers right', async () => {
    const pair = utils.generateKeyPairSync('ed25519', { passphrase: 's3cret', cipher: 'aes256-ctr', rounds: 16 })
    const k = (await keys.addKey('locked', pair.private))!
    expect(k).toMatchObject({ encrypted: true, fingerprint: null })
    await expect(keys.unlock(k.id)).rejects.toThrow(/\[\[NEED_PASSPHRASE:/)
    await expect(keys.unlock(k.id, 'nope')).rejects.toThrow(/\[\[BAD_PASSPHRASE:/)
    const u = await keys.unlock(k.id, 's3cret', true)
    expect(u.passphrase).toBe('s3cret')
    const after = catalog.getKey(k.id)!
    expect(after.hasPassphrase).toBe(true)
    expect(after.fingerprint).toMatch(/^SHA256:/)
    expect((await keys.unlock(k.id)).passphrase).toBe('s3cret')
  })

  it('generates RSA with the requested size and refuses odd sizes', async () => {
    const k = await keys.generate({ label: 'deploy', type: 'rsa', bits: 2048 })
    expect(k).toMatchObject({ type: 'rsa', bits: 2048, encrypted: false })
    await expect(keys.generate({ label: 'x', type: 'rsa', bits: 1024 })).rejects.toThrow()
  })

  it('imports a folder and binds hosts by key file name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vts-keys-'))
    const a = utils.generateKeyPairSync('ed25519')
    writeFileSync(join(dir, 'id_ed25519'), a.private)
    writeFileSync(join(dir, 'id_ed25519.pub'), a.public)
    writeFileSync(join(dir, 'known_hosts'), 'junk')
    writeFileSync(join(dir, 'notes.txt'), 'hello')
    writeFileSync(join(dir, 'garbage'), 'not a key')
    mkdirSync(join(dir, 'work'))
    writeFileSync(join(dir, 'work', 'deploy.pem'), utils.generateKeyPairSync('ed25519').private)
    const h = await vault.saveHost(host({ keyHint: 'id_ed25519' }), undefined)
    const r = await keys.importFolder(dir)
    expect(r.added.map((k) => k.label).sort()).toEqual(['deploy', 'id_ed25519'])
    expect(r.bound).toBe(1)
    expect(r.skipped.some((s) => s.startsWith('garbage'))).toBe(true)
    expect(repo.getHost(h.id)!.keyId).toBe(r.added.find((k) => k.label === 'id_ed25519')!.id)
    const c = await vault.resolveForConnect(h.id)
    expect(c.privateKey).toBe(a.private)
  })

  it('identities supply user, password and key', async () => {
    const k = (await keys.addKey('ops', utils.generateKeyPairSync('ed25519').private))!
    const ident = await keys.saveIdentity({ label: 'ops', username: 'deploy', keyId: k.id }, 'pw')
    const h = await vault.saveHost(host({ auth: 'password', identityId: ident.id }), undefined)
    const c = await vault.resolveForConnect(h.id)
    expect(c).toMatchObject({ username: 'deploy', password: 'pw', agent: false })
    expect(c.privateKey).toContain('OPENSSH PRIVATE KEY')
    await keys.deleteIdentity(ident.id)
    expect(repo.getHost(h.id)!.identityId).toBeNull()
  })

  it('explains a missing key for imported hosts', async () => {
    const h = await vault.saveHost(host({ keyHint: 'id_rsa' }), undefined)
    await expect(vault.resolveForConnect(h.id)).rejects.toThrow(/id_rsa.*не импортирован/)
  })

  it('deleting a key detaches hosts', async () => {
    const k = (await keys.addKey('k', utils.generateKeyPairSync('ed25519').private))!
    const h = await vault.saveHost(host({ keyId: k.id }), undefined)
    await keys.deleteKey(k.id)
    expect(repo.getHost(h.id)).toMatchObject({ keyId: null, auth: 'password' })
  })
})
