import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Server, utils } from 'ssh2'
import type { SessionEvent } from '@shared/ipc'
import { SshManager, type HostKeyInfo } from '../src/main/ssh-manager'
import { validateConnectRequest } from '../src/main/validate'

const hostKey = utils.generateKeyPairSync('ed25519').private

let server: Server
let port = 0
const resizes: Array<{ cols: number; rows: number }> = []

beforeAll(async () => {
  server = new Server({ hostKeys: [hostKey] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === 'tester' && ctx.password === 's3cret') ctx.accept()
      else ctx.reject(['password'])
    })
    client.on('session', (accept) => {
      const session = accept()
      session.on('pty', (acceptPty) => acceptPty?.())
      session.on('window-change', (acc, _rej, info) => {
        resizes.push({ cols: info.cols, rows: info.rows })
        acc?.()
      })
      session.on('shell', (acceptShell) => {
        const stream = acceptShell()
        stream.write('welcome\r\n')
        stream.on('data', (d: Buffer) => {
          const s = d.toString()
          if (s.includes('exit')) {
            stream.exit(0)
            stream.end()
          } else stream.write(`echo:${s}`)
        })
      })
    })
    client.on('error', () => {})
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as AddressInfo).port
})

afterAll(() => server?.close())

function harness(trust: boolean) {
  const data: string[] = []
  const statuses: SessionEvent[] = []
  const keys: HostKeyInfo[] = []
  const mgr = new SshManager({
    onData: (_id, d) => data.push(d),
    onStatus: (ev) => statuses.push(ev),
    verifyHostKey: async (info) => {
      keys.push(info)
      return trust
    }
  })
  const waitFor = async (pred: () => boolean, ms = 8000): Promise<void> => {
    const t0 = Date.now()
    while (!pred()) {
      if (Date.now() - t0 > ms) throw new Error('timeout')
      await new Promise((r) => setTimeout(r, 20))
    }
  }
  return { mgr, data, statuses, keys, waitFor }
}

describe('SshManager', () => {
  it('connects with password, streams shell IO, resizes and closes', async () => {
    const h = harness(true)
    const id = h.mgr.connect({ host: '127.0.0.1', port, username: 'tester', password: 's3cret', cols: 100, rows: 30 })
    await h.waitFor(() => h.statuses.some((s) => s.status === 'ready'))
    expect(h.keys[0].algorithm).toBe('ssh-ed25519')
    expect(h.keys[0].fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/)
    await h.waitFor(() => h.data.join('').includes('welcome'))

    h.mgr.write(id, 'ls')
    await h.waitFor(() => h.data.join('').includes('echo:ls'))

    h.mgr.resize(id, 120, 40)
    await h.waitFor(() => resizes.some((r) => r.cols === 120 && r.rows === 40))

    h.mgr.write(id, 'exit')
    await h.waitFor(() => h.statuses.some((s) => s.status === 'closed'))
    expect(h.mgr.size).toBe(0)
  })

  it('aborts when the host key is rejected', async () => {
    const h = harness(false)
    h.mgr.connect({ host: '127.0.0.1', port, username: 'tester', password: 's3cret', cols: 80, rows: 24 })
    await h.waitFor(() => h.statuses.some((s) => s.status === 'error' || s.status === 'closed'))
    await new Promise((r) => setTimeout(r, 200))
    expect(h.statuses.some((s) => s.status === 'ready')).toBe(false)
    expect(h.statuses.filter((s) => s.status === 'error')).toHaveLength(1)
    expect(h.statuses.find((s) => s.status === 'error')?.message).toMatch(/ключ сервера.*не подтверждён/)
  })

  it('reports an auth failure', async () => {
    const h = harness(true)
    h.mgr.connect({ host: '127.0.0.1', port, username: 'tester', password: 'wrong', cols: 80, rows: 24 })
    await h.waitFor(() => h.statuses.some((s) => s.status === 'error'))
    expect(h.statuses.find((s) => s.status === 'error')?.message).toMatch(/не принял ни ключ, ни пароль/)
  })
})

describe('validateConnectRequest', () => {
  it('normalises and clamps input', () => {
    const r = validateConnectRequest({ host: ' example.com ', username: 'root', port: 2222, cols: 5, rows: 9999 })
    expect(r).toMatchObject({ host: 'example.com', port: 2222, cols: 10, rows: 500 })
  })
  it.each([
    [{ host: '', username: 'a' }],
    [{ host: 'a b', username: 'a' }],
    [{ host: 'h', username: '' }],
    [{ host: 'h', username: 'a', port: 70000 }],
    [{ host: 'h', username: 'a', password: 42 }],
    [null]
  ])('rejects %j', (bad) => {
    expect(() => validateConnectRequest(bad)).toThrow()
  })
})

describe('silent server (TCP open, no SSH banner)', () => {
  it('reports one clear error and no extra "closed"', async () => {
    const { createServer } = await import('node:net')
    const sockets: import('node:net').Socket[] = []
    const mute = createServer((s) => sockets.push(s))
    await new Promise<void>((r) => mute.listen(0, '127.0.0.1', r))
    const statuses: SessionEvent[] = []
    const mgr = new SshManager({ onData: () => {}, onStatus: (e) => statuses.push(e), verifyHostKey: async () => true }, 400)
    mgr.connect({ host: '127.0.0.1', port: (mute.address() as AddressInfo).port, username: 'u', password: 'p', cols: 80, rows: 24 })
    await new Promise((r) => setTimeout(r, 1500))
    sockets.forEach((s) => s.destroy())
    await new Promise((r) => setTimeout(r, 300))
    mute.close()
    const errors = statuses.filter((s) => s.status === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/не ответил на SSH-рукопожатие/)
    expect(statuses.some((s) => s.status === 'closed')).toBe(false)
  })
})

describe('host key dialog vs. handshake timeout', () => {
  it('does not time out while the user is deciding on the host key', async () => {
    const statuses: SessionEvent[] = []
    const mgr = new SshManager(
      {
        onData: () => {},
        onStatus: (e) => statuses.push(e),
        // The user takes 3x the timeout to click "trust"
        verifyHostKey: () => new Promise((r) => setTimeout(() => r(true), 1200))
      },
      400
    )
    mgr.connect({ host: '127.0.0.1', port, username: 'tester', password: 's3cret', cols: 80, rows: 24 })
    const t0 = Date.now()
    while (!statuses.some((s) => s.status === 'ready' || s.status === 'error') && Date.now() - t0 < 8000) {
      await new Promise((r) => setTimeout(r, 20))
    }
    expect(statuses.filter((s) => s.status === 'error')).toEqual([])
    expect(statuses.some((s) => s.status === 'ready')).toBe(true)
    mgr.disconnectAll()
  })
})
