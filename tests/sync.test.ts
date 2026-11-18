import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { genKeyPair } from './helpers/keys'
import { DEFAULT_HOST_OPTIONS } from '../src/shared/vault'
import { openDb } from '../src/main/db'
import { MemorySecretStore } from '../src/main/secrets'
import { VaultRepo } from '../src/main/vault-repo'
import { VaultService } from '../src/main/vault-service'
import { CatalogRepo } from '../src/main/catalog-repo'
import { DataKeyCipher } from '../src/main/key-crypto'
import { KeyService } from '../src/main/key-service'
import { ToolsRepo } from '../src/main/tools-repo'
import { SyncLocalStore } from '../src/main/sync/local-store'
import { SyncService, normalizeSyncUrl } from '../src/main/sync/service'
import { merge, emptyDoc } from '../src/main/sync/document'
// @ts-expect-error plain ESM module
import { createSyncServer } from '../sync-server/server.mjs'

const TOKEN = 'sync-test-token-0123456789'
const MASTER = 'correct horse battery'
const dataDir = mkdtempSync(join(tmpdir(), 'vts-sync2-'))
let url = ''
let server: import('node:http').Server

function device() {
  const db = openDb(':memory:')
  const secrets = new MemorySecretStore()
  const repo = new VaultRepo(db)
  const catalog = new CatalogRepo(db)
  const cipher = new DataKeyCipher(secrets)
  const keys = new KeyService(catalog, repo, cipher, secrets)
  const tools = new ToolsRepo(db)
  const vault = new VaultService(repo, secrets, { catalog, keys, tools })
  let changes = 0
  const sync = new SyncService(db, secrets, new SyncLocalStore(db, secrets, cipher), () => {}, () => changes++)
  return { db, secrets, repo, catalog, keys, tools, vault, sync, changes: () => changes }
}

const host = (label: string) => ({ label, address: '198.51.100.20', port: 22, username: 'root', auth: 'password', keyId: null, groupId: null, color: null, tags: [], favorite: false, notes: '', options: DEFAULT_HOST_OPTIONS })

beforeAll(async () => {
  server = createSyncServer({ tokenSha256: createHash('sha256').update(TOKEN).digest('hex'), dataDir })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

describe('sync between two devices', () => {
  const A = device()
  const B = device()
  let hostId = ''
  let snippetId = ''

  it('A uploads hosts, secrets, keys and snippets end-to-end encrypted', async () => {
    const pair = genKeyPair()
    const key = (await A.keys.addKey('id_ed25519', pair.private))!
    const g = A.vault.saveGroup({ name: 'Prod', parentId: null, color: null })
    const h = await A.vault.saveHost({ ...host('web-01'), groupId: g.id, auth: 'key', keyId: key.id }, 'host-secret-pw')
    hostId = h.id
    snippetId = A.tools.saveSnippet({ label: 'Аптайм', command: 'uptime', tags: [] }).id
    await A.sync.configure(url, TOKEN, MASTER)
    expect(A.sync.status()).toMatchObject({ configured: true, version: 1, lastError: null })
    const onDisk = readFileSync(join(dataDir, 'vault.json'), 'utf-8')
    for (const plain of ['web-01', 'host-secret-pw', 'OPENSSH', 'Аптайм', 'uptime']) expect(onDisk).not.toContain(plain)
  })

  it('B with a wrong master password cannot join', async () => {
    await expect(B.sync.configure(url, TOKEN, 'wrong password!!')).rejects.toThrow(/мастер-пароль/)
    expect(B.sync.status().configured).toBe(false)
  })

  it('B with the right one receives everything, including secrets', async () => {
    await B.sync.configure(url, TOKEN, MASTER)
    const h = B.repo.getHost(hostId)!
    expect(h).toMatchObject({ label: 'web-01', hasPassword: true, auth: 'key' })
    expect(B.repo.listGroups().map((g) => g.name)).toEqual(['Prod'])
    const c = await B.vault.resolveForConnect(hostId)
    expect(c.privateKey).toContain('OPENSSH PRIVATE KEY')
    expect(await B.secrets.get(`host:${hostId}:password`)).toBe('host-secret-pw')
    expect(B.tools.listSnippets().map((s) => s.label)).toEqual(['Аптайм'])
  })

  it('concurrent edits on both devices converge', async () => {
    await new Promise((r) => setTimeout(r, 5))
    await A.vault.saveHost({ ...host('web-01 renamed'), id: hostId, auth: 'password' }, undefined)
    B.tools.deleteSnippet(snippetId)
    B.tools.saveSnippet({ label: 'Диск', command: 'df -h', tags: [] })
    await B.sync.syncNow()
    await A.sync.syncNow() // A pulls B's changes, pushes its rename
    await B.sync.syncNow()
    for (const d of [A, B]) {
      expect(d.repo.getHost(hostId)!.label).toBe('web-01 renamed')
      expect(d.tools.listSnippets().map((s) => s.label)).toEqual(['Диск'])
    }
  })

  it('deleting a host on B removes it on A, with its tunnels', async () => {
    const f = A.tools.saveForward({ hostId, kind: 'local', bindPort: 15432, destHost: 'db', destPort: 5432 })
    await A.sync.syncNow()
    await B.sync.syncNow()
    expect(B.tools.getForward(f.id)).not.toBeNull()
    await B.vault.deleteHost(hostId)
    await B.sync.syncNow()
    await A.sync.syncNow()
    expect(A.repo.getHost(hostId)).toBeNull()
    expect(A.tools.getForward(f.id)).toBeNull()
    expect(await A.secrets.get(`host:${hostId}:password`)).toBeNull()
  })
})

describe('merge rules', () => {
  it('newer wins, deletion wins over older edits, later edit revives', () => {
    const a = emptyDoc()
    const b = emptyDoc()
    a.records.hosts.h1 = { u: 10, row: { id: 'h1', label: 'old' } }
    b.records.hosts.h1 = { u: 20, row: { id: 'h1', label: 'new' } }
    expect(merge(a, b, 100).records.hosts.h1.row.label).toBe('new')
    b.tombstones['hosts:h1'] = 25
    expect(merge(a, b, 100).records.hosts.h1).toBeUndefined()
    a.records.hosts.h1 = { u: 30, row: { id: 'h1', label: 'edited after delete' } }
    const m = merge(a, b, 100)
    expect(m.records.hosts.h1.row.label).toBe('edited after delete')
    expect(m.tombstones['hosts:h1']).toBeUndefined()
  })
  it('only https except localhost', () => {
    expect(normalizeSyncUrl('https://sync.devkillmix.com/')).toBe('https://sync.devkillmix.com')
    expect(() => normalizeSyncUrl('http://sync.devkillmix.com')).toThrow()
    expect(normalizeSyncUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787')
  })
})
