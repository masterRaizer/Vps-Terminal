import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDb } from '../src/main/db'
import { MemorySecretStore } from '../src/main/secrets'
import { VaultRepo } from '../src/main/vault-repo'
import { CatalogRepo } from '../src/main/catalog-repo'
import { GeoIp } from '../src/main/geoip'
import { MISSING_TAG, normalizePanelUrl, RemnawaveSync } from '../src/main/remnawave'

const geo = new GeoIp(join(__dirname, '..', 'resources', 'geoip'))
let nodes: unknown[]
const calls: Array<{ url: string; auth?: string; body?: string }> = []

const fakeFetch = (async (url: string, init: RequestInit) => {
  const headers = init.headers as Record<string, string>
  calls.push({ url, auth: headers.Authorization, body: init.body as string | undefined })
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
  if (url.endsWith('/api/auth/login')) {
    const b = JSON.parse(String(init.body))
    return b.password === 'panel-pass' ? json(200, { response: { accessToken: 'jwt-123' } }) : json(401, { message: 'bad' })
  }
  if (url.endsWith('/api/nodes')) {
    if (headers.Authorization !== 'Bearer tok' && headers.Authorization !== 'Bearer jwt-123') return json(401, {})
    return json(200, { response: nodes })
  }
  return json(404, { message: 'nope' })
}) as unknown as typeof fetch

let repo: VaultRepo
let catalog: CatalogRepo
let secrets: MemorySecretStore
let sync: RemnawaveSync

beforeEach(() => {
  const db = openDb(':memory:')
  repo = new VaultRepo(db)
  catalog = new CatalogRepo(db)
  secrets = new MemorySecretStore()
  sync = new RemnawaveSync(catalog, repo, secrets, geo, fakeFetch)
  calls.length = 0
  nodes = [
    { uuid: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'NL-1', address: '198.51.100.10', countryCode: 'nl', tags: ['Fast'], isDisabled: false },
    { uuid: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'Google DNS node', address: '8.8.8.8', countryCode: 'XX', tags: [], isDisabled: false },
    { bogus: true }
  ]
})

describe('Remnawave sync', () => {
  it('creates a group with nodes, flags from panel or GeoIP, token auth', async () => {
    const it0 = await sync.save({ name: 'Моя панель', url: 'https://panel.example.com/', authMode: 'token', sshPort: 2222 }, 'tok')
    expect(it0.url).toBe('https://panel.example.com')
    const r = await sync.sync(it0.id)
    expect(r).toEqual({ created: 2, updated: 0, missing: 0, total: 2 })
    const g = repo.listGroups().find((x) => x.name === 'Моя панель')!
    const hosts = repo.hostsBySource(it0.id)
    expect(hosts.every((h) => h.groupId === g.id && h.port === 2222)).toBe(true)
    const nl = hosts.find((h) => h.label === 'NL-1')!
    expect(nl).toMatchObject({ country: 'NL', countrySource: 'panel', tags: ['remnawave', 'fast'] })
    expect(hosts.find((h) => h.address === '8.8.8.8')).toMatchObject({ country: 'US', countrySource: 'auto' })
    expect(calls[0].auth).toBe('Bearer tok')
    expect(catalog.getIntegration(it0.id)!.lastError).toBeNull()
  })

  it('re-sync updates, keeps user edits and marks removed nodes', async () => {
    const it0 = await sync.save({ name: 'P', url: 'https://p.example', authMode: 'token' }, 'tok')
    await sync.sync(it0.id)
    const nl = repo.hostsBySource(it0.id).find((h) => h.label === 'NL-1')!
    repo.saveHost({ ...nl, port: 2200, country: 'DE', countrySource: 'manual' })
    nodes = [{ ...(nodes[0] as object), name: 'NL-1 renamed' }]
    const r = await sync.sync(it0.id)
    expect(r).toMatchObject({ created: 0, updated: 1, missing: 1 })
    const after = repo.getHost(nl.id)!
    expect(after).toMatchObject({ label: 'NL-1 renamed', port: 2200, country: 'DE', countrySource: 'manual' })
    expect(repo.hostsBySource(it0.id).find((h) => h.address === '8.8.8.8')!.tags).toContain(MISSING_TAG)
  })

  it('login mode gets a session token; errors are recorded', async () => {
    const it0 = await sync.save({ name: 'L', url: 'http://10.0.0.2:3000', authMode: 'login', login: 'admin' }, 'panel-pass')
    await sync.sync(it0.id)
    expect(calls.map((c) => c.url)).toEqual(['http://10.0.0.2:3000/api/auth/login', 'http://10.0.0.2:3000/api/nodes'])
    expect(calls[1].auth).toBe('Bearer jwt-123')
    await sync.save({ ...it0, id: it0.id }, 'wrong')
    await expect(sync.sync(it0.id)).rejects.toThrow(/отклонила доступ/)
    expect(catalog.getIntegration(it0.id)!.lastError).toMatch(/отклонила/)
  })

  it('validates panel URLs', () => {
    expect(() => normalizePanelUrl('panel.example.com')).toThrow()
    expect(() => normalizePanelUrl('ftp://x')).toThrow()
    expect(() => normalizePanelUrl('https://u:p@x.com')).toThrow()
  })
})
