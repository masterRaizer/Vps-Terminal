import { createRequire } from 'node:module'
import { connect, createServer, type AddressInfo, type Server } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ForwardRule, TunnelStatus } from '../src/shared/vault'
import { ForwardManager } from '../src/main/forward-manager'
import { parseKnownHosts, validateForward } from '../src/main/tools-repo'
import { fillSnippet, snippetVars, toShellInput } from '../src/shared/snippets'

const require = createRequire(import.meta.url)
const { startSftpServer } = require('./helpers/sftp-server.cjs')

let ssh: { port: number; close(): void }
let echo: Server
let echoPort = 0
const statuses: TunnelStatus[] = []
const mgr = new ForwardManager(async () => true, (s) => statuses.push(s))
const cred = () => ({ host: '127.0.0.1', port: ssh.port, username: 'u', password: 'pw' })

const freePort = (): Promise<number> =>
  new Promise((r) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as AddressInfo).port
      s.close(() => r(p))
    })
  })

/** Sends data through host:port and resolves with what comes back. */
function roundTrip(port: number, payload: Buffer, pre?: (s: import('node:net').Socket) => Promise<void>): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = connect(port, '127.0.0.1', async () => {
      if (pre) await pre(s)
      s.write(payload)
    })
    let got = ''
    s.on('data', (d) => {
      got += d.toString()
      if (got.includes(payload.toString())) {
        s.end()
        resolve(got)
      }
    })
    s.on('error', reject)
    setTimeout(() => reject(new Error(`timeout, got ${JSON.stringify(got)}`)), 5000)
  })
}

const rule = (r: Partial<ForwardRule>): ForwardRule => ({ id: 'r1', label: '', hostId: 'h', kind: 'local', bindAddress: '127.0.0.1', bindPort: 0, destHost: '127.0.0.1', destPort: echoPort, autoStart: false, createdAt: 0, ...r })

beforeAll(async () => {
  echo = createServer((s) => s.pipe(s))
  await new Promise<void>((r) => echo.listen(0, '127.0.0.1', r))
  echoPort = (echo.address() as AddressInfo).port
  ssh = await startSftpServer({ root: mkdtempSync(join(tmpdir(), 'vts-fwd-')), auth: (ctx: { method: string; password?: string }) => ctx.method === 'password' && ctx.password === 'pw' })
})
afterAll(() => {
  mgr.stopAll()
  ssh.close()
  echo.close()
})

describe('ForwardManager', () => {
  it('local forward (-L)', async () => {
    const port = await freePort()
    await mgr.start(rule({ id: 'L', bindPort: port }), cred())
    expect(await roundTrip(port, Buffer.from('ping-L'))).toBe('ping-L')
    expect(statuses.some((s) => s.ruleId === 'L' && s.state === 'active')).toBe(true)
    mgr.stop('L')
    expect(mgr.isRunning('L')).toBe(false)
  })

  it('dynamic SOCKS5 (-D) with a domain name', async () => {
    const port = await freePort()
    await mgr.start(rule({ id: 'D', kind: 'dynamic', bindPort: port, destHost: '', destPort: 0 }), cred())
    const handshake = (s: import('node:net').Socket): Promise<void> =>
      new Promise((ok) => {
        s.write(Buffer.from([5, 1, 0]))
        s.once('data', () => {
          const host = Buffer.from('localhost')
          const req = Buffer.concat([Buffer.from([5, 1, 0, 3, host.length]), host, Buffer.from([echoPort >> 8, echoPort & 255])])
          s.write(req)
          s.once('data', (rep) => {
            expect(rep[1]).toBe(0)
            ok()
          })
        })
      })
    expect((await roundTrip(port, Buffer.from('ping-D'), handshake)).endsWith('ping-D')).toBe(true)
    mgr.stop('D')
  })

  it('remote forward (-R)', async () => {
    const port = await freePort()
    await mgr.start(rule({ id: 'R', kind: 'remote', bindPort: port }), cred())
    expect(await roundTrip(port, Buffer.from('ping-R'))).toBe('ping-R')
    mgr.stop('R')
  })

  it('reports a busy local port', async () => {
    const port = await freePort()
    const blocker = createServer().listen(port, '127.0.0.1')
    await new Promise((r) => blocker.once('listening', r))
    await expect(mgr.start(rule({ id: 'B', bindPort: port }), cred())).rejects.toThrow(/занят/)
    blocker.close()
  })
})

describe('validation and parsing', () => {
  it('validates forward rules', () => {
    expect(validateForward({ hostId: 'h', kind: 'local', bindPort: 8080, destHost: 'db.internal', destPort: 5432 })).toMatchObject({ bindAddress: '127.0.0.1' })
    expect(() => validateForward({ hostId: 'h', kind: 'local', bindPort: 8080, destHost: 'bad host', destPort: 1 })).toThrow()
    expect(() => validateForward({ hostId: 'h', kind: 'dynamic', bindPort: 0 })).toThrow(/порт/)
    expect(validateForward({ hostId: 'h', kind: 'dynamic', bindPort: 1080, destHost: 'x', destPort: 5 })).toMatchObject({ destHost: '', destPort: 0 })
  })
  it('parses OpenSSH known_hosts', () => {
    const r = parseKnownHosts(
      [
        '# comment',
        'example.com,203.0.113.5 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl',
        '[git.example.com]:2222 ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ==',
        '|1|abc=|def= ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl',
        '@cert-authority *.example.com ssh-rsa AAAA'
      ].join('\n')
    )
    expect(r.entries.map((e) => `${e.host}:${e.port}`)).toEqual(['example.com:22', '203.0.113.5:22', 'git.example.com:2222'])
    expect(r.skipped).toBe(2)
  })
  it('snippet variables', () => {
    const cmd = 'docker logs {{container:web}} --tail {{lines}} && echo {{container}}'
    expect(snippetVars(cmd)).toEqual([
      { name: 'container', defaultValue: 'web' },
      { name: 'lines', defaultValue: '' }
    ])
    expect(fillSnippet(cmd, { lines: '50' })).toBe('docker logs web --tail 50 && echo web')
    expect(toShellInput('a\r\nb\n', true)).toBe('a\rb\r')
    expect(toShellInput('ls', false)).toBe('ls')
  })
})
