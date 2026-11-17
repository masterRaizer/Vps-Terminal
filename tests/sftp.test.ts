import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TransferEvent } from '../src/shared/files'
import { safeLocalName, SftpManager } from '../src/main/sftp-manager'

const require = createRequire(import.meta.url)
const { startSftpServer } = require('./helpers/sftp-server.cjs')

let srv: { port: number; close(): void }
const root = mkdtempSync(join(tmpdir(), 'vts-sftp-root-'))
const localDir = mkdtempSync(join(tmpdir(), 'vts-sftp-local-'))
const events: TransferEvent[] = []
let closed: string[] = []
const mgr = new SftpManager(async () => true, (e) => events.push(e), (id) => closed.push(id))
let id = ''

const waitDone = async (tid: string): Promise<TransferEvent> => {
  for (let i = 0; i < 400; i++) {
    const last = events.filter((e) => e.id === tid).at(-1)
    if (last && last.status !== 'running') return last
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error('transfer timeout')
}

beforeAll(async () => {
  mkdirSync(join(root, 'home', 'app'), { recursive: true })
  writeFileSync(join(root, 'home', 'readme.txt'), 'hello sftp')
  writeFileSync(join(root, 'home', 'app', 'big.bin'), Buffer.alloc(300_000, 7))
  srv = await startSftpServer({ root, auth: (ctx: { method: string; password?: string }) => ctx.method === 'password' && ctx.password === 'pw' })
  const r = await mgr.open({ host: '127.0.0.1', port: srv.port, username: 'u', password: 'pw' })
  id = r.id
  expect(r.home).toBe('/home')
})
afterAll(() => {
  mgr.closeAll()
  srv.close()
})

describe('SftpManager', () => {
  it('lists with types, sizes and permissions', async () => {
    const l = await mgr.list(id, '/home')
    const names = Object.fromEntries(l.entries.map((e) => [e.name, e]))
    expect(names['app'].type).toBe('dir')
    expect(names['readme.txt']).toMatchObject({ type: 'file', size: 10 })
    expect(names['readme.txt'].mode).toBeTypeOf('number')
  })

  it('mkdir, rename, chmod, recursive delete', async () => {
    await mgr.mkdir(id, '/home/tmp')
    await mgr.mkdir(id, '/home/tmp/nested')
    await mgr.rename(id, '/home/readme.txt', '/home/tmp/nested/readme.txt')
    await mgr.chmod(id, '/home/tmp/nested/readme.txt', 0o600)
    expect(statSync(join(root, 'home', 'tmp', 'nested', 'readme.txt')).mode & 0o777).toBe(0o600)
    await mgr.remove(id, '/home/tmp')
    expect(existsSync(join(root, 'home', 'tmp'))).toBe(false)
    await expect(mgr.remove(id, '/')).rejects.toThrow()
    await expect(mgr.list(id, 'relative/path')).rejects.toThrow(/путь/)
  })

  it('uploads a folder tree and downloads it back with progress', async () => {
    const src = join(localDir, 'site')
    mkdirSync(join(src, 'css'), { recursive: true })
    writeFileSync(join(src, 'index.html'), '<h1>hi</h1>')
    writeFileSync(join(src, 'css', 'a.css'), 'body{}')
    const up = await waitDone(mgr.upload(id, [src], '/home'))
    expect(up).toMatchObject({ status: 'done', direction: 'upload' })
    expect(readFileSync(join(root, 'home', 'site', 'css', 'a.css'), 'utf-8')).toBe('body{}')

    const dl = join(localDir, 'dl')
    mkdirSync(dl)
    const down = await waitDone(mgr.download(id, ['/home/app', '/home/site/index.html'], dl))
    expect(down).toMatchObject({ status: 'done', total: 300_000 + 11, transferred: 300_000 + 11 })
    expect(statSync(join(dl, 'app', 'big.bin')).size).toBe(300_000)
    expect(readFileSync(join(dl, 'index.html'), 'utf-8')).toBe('<h1>hi</h1>')
  })

  it('makes remote names safe on Windows', () => {
    expect(safeLocalName('a:b?.txt')).toBe('a_b_.txt')
    expect(safeLocalName('CON')).toBe('_CON')
    expect(safeLocalName('trail. ')).toBe('trail_')
  })

  it('reports closed sessions', async () => {
    mgr.close(id)
    await new Promise((r) => setTimeout(r, 200))
    expect(closed).toContain(id)
    await expect(mgr.list(id, '/home')).rejects.toThrow(/закрыта/)
  })
})
