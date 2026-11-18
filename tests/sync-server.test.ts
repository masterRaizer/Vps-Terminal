import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM module without types
import { createSyncServer } from '../sync-server/server.mjs'

const TOKEN = 'test-token-0123456789abcdef'
const dataDir = mkdtempSync(join(tmpdir(), 'vts-sync-'))
let base = ''
let server: import('node:http').Server

beforeAll(async () => {
  server = createSyncServer({ tokenSha256: createHash('sha256').update(TOKEN).digest('hex'), dataDir, maxBlobBytes: 1024 * 1024, keepBackups: 3 })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

const call = (method: string, body?: unknown, token = TOKEN) =>
  fetch(`${base}/v1/vault`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

describe('sync server', () => {
  it('health check is public, vault is not', async () => {
    expect((await fetch(`${base}/healthz`)).status).toBe(200)
    expect((await call('GET', undefined, 'wrong-token-but-long-enough')).status).toBe(401)
    expect((await fetch(`${base}/v1/vault`)).status).toBe(401)
  })

  it('starts empty, accepts version 1, rejects stale writes with the current copy', async () => {
    const empty = await call('GET')
    expect(empty.status).toBe(404)
    const put1 = await call('PUT', { baseVersion: 0, blob: 'AAA' })
    expect(put1.status).toBe(200)
    expect(await put1.json()).toMatchObject({ version: 1 })
    const stale = await call('PUT', { baseVersion: 0, blob: 'BBB' })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ version: 1, blob: 'AAA' })
    const get = await (await call('GET')).json()
    expect(get).toMatchObject({ version: 1, blob: 'AAA' })
  })

  it('serialises concurrent writers: exactly one wins per version', async () => {
    const results = await Promise.all([call('PUT', { baseVersion: 1, blob: 'X' }), call('PUT', { baseVersion: 1, blob: 'Y' })])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  })

  it('keeps a bounded backup history', async () => {
    for (let v = 2; v < 7; v++) await call('PUT', { baseVersion: v, blob: `v${v}` })
    expect(readdirSync(join(dataDir, 'history'))).toHaveLength(3)
  })

  it('validates input and size', async () => {
    expect((await call('PUT', { blob: 'x' })).status).toBe(400)
    expect((await call('PUT', { baseVersion: 99, blob: 'x'.repeat(2 * 1024 * 1024) })).status).toBe(413)
    expect((await call('DELETE')).status).toBe(405)
  })
})
