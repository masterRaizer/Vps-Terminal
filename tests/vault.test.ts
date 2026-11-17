import { beforeEach, describe, expect, it } from 'vitest'
import { openDb } from '../src/main/db'
import { MemorySecretStore, hostPasswordAccount } from '../src/main/secrets'
import { validateHostInput, VaultRepo } from '../src/main/vault-repo'
import { VaultService } from '../src/main/vault-service'

const baseHost = { options: { backspace: 'ctrl-h', agentForward: true, env: { LANG: 'C.UTF-8' }, termTheme: 'glacier' }, label: 'prod', address: '203.0.113.10', port: 22, username: 'root', auth: 'password', tags: ['web', 'web', ' eu '], favorite: true }

let secrets: MemorySecretStore
let svc: VaultService
let repo: VaultRepo

beforeEach(() => {
  repo = new VaultRepo(openDb(':memory:'))
  secrets = new MemorySecretStore()
  svc = new VaultService(repo, secrets)
})

describe('VaultService', () => {
  it('creates a host, stores the password only in the secret store', async () => {
    const h = await svc.saveHost(baseHost, 'hunter2')
    expect(h).toMatchObject({ label: 'prod', hasPassword: true, favorite: true, tags: ['web', 'eu'], groupId: null })
    expect(await secrets.get(hostPasswordAccount(h.id))).toBe('hunter2')
    expect(JSON.stringify(svc.snapshot())).not.toContain('hunter2')
    expect((await svc.resolveForConnect(h.id)).password).toBe('hunter2')
  })

  it('keeps, replaces and clears the password', async () => {
    const h = await svc.saveHost(baseHost, 'a')
    await svc.saveHost({ ...baseHost, id: h.id, label: 'renamed' }, undefined)
    expect(await secrets.get(hostPasswordAccount(h.id))).toBe('a')
    await svc.saveHost({ ...baseHost, id: h.id }, 'b')
    expect(await secrets.get(hostPasswordAccount(h.id))).toBe('b')
    const cleared = await svc.saveHost({ ...baseHost, id: h.id }, null)
    expect(cleared.hasPassword).toBe(false)
    expect(await secrets.get(hostPasswordAccount(h.id))).toBeNull()
  })

  it('deletes the secret with the host', async () => {
    const h = await svc.saveHost(baseHost, 'x')
    await svc.deleteHost(h.id)
    expect(svc.snapshot().hosts).toHaveLength(0)
    expect(await secrets.get(hostPasswordAccount(h.id))).toBeNull()
  })

  it('groups: nesting, cycle protection, delete moves children up', async () => {
    const root = svc.saveGroup({ name: 'Prod', parentId: null, color: null })
    const child = svc.saveGroup({ name: 'EU', parentId: root.id, color: '#E5541B' })
    expect(child.color).toBe('#e5541b')
    expect(() => svc.saveGroup({ id: root.id, name: 'Prod', parentId: child.id, color: null })).toThrow(/сама в себя/)
    const h = await svc.saveHost({ ...baseHost, groupId: child.id }, undefined)
    svc.deleteGroup(child.id)
    expect(repo.getHost(h.id)!.groupId).toBe(root.id)
    expect(svc.snapshot().groups.map((g) => g.name)).toEqual(['Prod'])
  })

  it('rejects a host in a missing group', async () => {
    await expect(svc.saveHost({ ...baseHost, groupId: 'nope' }, undefined)).rejects.toThrow(/Группа/)
  })

  it('records last connection time', async () => {
    const h = await svc.saveHost(baseHost, undefined)
    svc.markConnected(h.id)
    expect(repo.getHost(h.id)!.lastConnectedAt).toBeTypeOf('number')
  })
})

describe('validateHostInput', () => {
  it('defaults the label to the address', () => {
    expect(validateHostInput({ ...baseHost, label: '  ' }).label).toBe('203.0.113.10')
  })
  it.each([
    [{ ...baseHost, address: '' }],
    [{ ...baseHost, address: 'a b' }],
    [{ ...baseHost, port: 0 }],
    [{ ...baseHost, username: '' }],
    [{ ...baseHost, auth: 'telnet' }],
    [{ ...baseHost, color: 'red' }],
    [{ ...baseHost, tags: 'x' as unknown as string[], label: 1 }]
  ])('rejects %#', (bad) => {
    expect(() => validateHostInput(bad)).toThrow()
  })
})

describe('importHosts', () => {
  it('imports, maps keys and groups, skips duplicates and reports errors', async () => {
    const { importHosts } = await import('../src/main/import-hosts')
    const data = [
      { label: 'VPS A', address: '198.51.100.1', port: 22, username: 'root', key: 'id_ed25519' },
      { host: '198.51.100.2', user: 'admin', group: 'Lab', tags: ['eu'] },
      { address: '198.51.100.1', port: 22, username: 'root' },
      { address: '' },
      'junk'
    ]
    const r = await importHosts({ hosts: data }, svc)
    expect(r).toMatchObject({ added: 2, skipped: 1 })
    expect(r.errors).toHaveLength(2)
    const hosts = svc.snapshot().hosts
    const a = hosts.find((h) => h.label === 'VPS A')!
    expect(a).toMatchObject({ auth: 'key', notes: 'Ключ: id_ed25519', hasPassword: false })
    const b = hosts.find((h) => h.address === '198.51.100.2')!
    expect(svc.snapshot().groups.find((g) => g.id === b.groupId)?.name).toBe('Lab')
    expect((await importHosts(data, svc)).added).toBe(0)
  })
  it('rejects a non-list', async () => {
    const { importHosts } = await import('../src/main/import-hosts')
    await expect(importHosts({ foo: 1 }, svc)).rejects.toThrow()
  })
})

describe('memory fallback', () => {
  it('does not report a password lost on restart', async () => {
    const db = openDb(':memory:')
    const first = new VaultService(new VaultRepo(db), new MemorySecretStore())
    const h = await first.saveHost(baseHost, 'pw')
    const restarted = new VaultService(new VaultRepo(db), new MemorySecretStore())
    expect(restarted.snapshot().hosts.find((x) => x.id === h.id)!.hasPassword).toBe(false)
  })
})

describe('host options', () => {
  it('round-trips options and validates env names', async () => {
    const h = await svc.saveHost(baseHost, undefined)
    expect(h.options).toEqual({ backspace: 'ctrl-h', agentForward: true, env: { LANG: 'C.UTF-8' }, termTheme: 'glacier' })
    await expect(svc.saveHost({ ...baseHost, options: { env: { 'BAD NAME': 'x' } } }, undefined)).rejects.toThrow(/недопустимое имя/)
    const d = await svc.saveHost({ ...baseHost, options: undefined }, undefined)
    expect(d.options).toEqual({ backspace: 'del', agentForward: false, env: {}, termTheme: null })
  })
})
