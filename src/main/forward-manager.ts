import { createServer, connect as netConnect, isIP, type Server, type Socket } from 'node:net'
import { Client, type ClientChannel } from 'ssh2'
import type { ForwardRule, TunnelStatus } from '@shared/vault'
import { keyAlgorithm, sha256Fingerprint } from './fingerprint'
import { defaultAgent, type HostKeyInfo } from './ssh-manager'

export interface TunnelCredentials {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
  agent?: boolean
}

interface Tunnel {
  rule: ForwardRule
  client: Client
  server?: Server
  sockets: Set<Socket>
  status: TunnelStatus
}

/** Runs port-forward rules, one SSH connection per rule. */
export class ForwardManager {
  private tunnels = new Map<string, Tunnel>()

  constructor(
    private readonly verifyHostKey: (info: Omit<HostKeyInfo, 'sessionId'> & { sessionId: string }) => Promise<boolean>,
    private readonly onStatus: (s: TunnelStatus) => void
  ) {}

  statuses(): TunnelStatus[] {
    return [...this.tunnels.values()].map((t) => t.status)
  }

  isRunning(ruleId: string): boolean {
    const s = this.tunnels.get(ruleId)?.status.state
    return s === 'active' || s === 'starting'
  }

  private set(t: Tunnel, patch: Partial<TunnelStatus>): void {
    t.status = { ...t.status, ...patch }
    this.onStatus(t.status)
  }

  start(rule: ForwardRule, cred: TunnelCredentials): Promise<void> {
    this.stop(rule.id, true)
    const client = new Client()
    const t: Tunnel = { rule, client, sockets: new Set(), status: { ruleId: rule.id, state: 'starting', connections: 0 } }
    this.tunnels.set(rule.id, t)
    this.onStatus(t.status)

    return new Promise((resolve, reject) => {
      let settled = false
      const fail = (e: Error): void => {
        this.set(t, { state: 'error', message: e.message })
        this.teardown(t)
        if (!settled) {
          settled = true
          reject(e)
        }
      }
      const ok = (): void => {
        this.set(t, { state: 'active', message: undefined })
        if (!settled) {
          settled = true
          resolve()
        }
      }
      client.on('ready', () => {
        try {
          if (rule.kind === 'remote') this.startRemote(t, ok, fail)
          else this.startLocal(t, ok, fail)
        } catch (e) {
          fail(e as Error)
        }
      })
      client.on('error', (e) => fail(e))
      client.on('close', () => {
        if (this.tunnels.get(rule.id) === t && t.status.state !== 'stopped') fail(new Error('SSH-соединение туннеля закрыто'))
      })
      client.connect({
        host: cred.host,
        port: cred.port,
        username: cred.username,
        password: cred.password,
        privateKey: cred.privateKey,
        passphrase: cred.passphrase,
        agent: cred.agent ? defaultAgent() : undefined,
        readyTimeout: 20000,
        keepaliveInterval: 15000,
        hostVerifier: (key: Buffer, verify: (ok: boolean) => void) => {
          this.verifyHostKey({ sessionId: `fwd:${rule.id}`, host: cred.host, port: cred.port, algorithm: keyAlgorithm(key), fingerprint: sha256Fingerprint(key) }).then(verify, () => verify(false))
        }
      })
    })
  }

  private track(t: Tunnel, sock: Socket, other: ClientChannel | Socket): void {
    t.sockets.add(sock)
    this.set(t, { connections: t.status.connections + 1 })
    const done = (): void => {
      if (t.sockets.delete(sock)) this.set(t, { connections: Math.max(0, t.status.connections - 1) })
    }
    sock.on('close', done)
    sock.on('error', () => other.destroy())
    other.on('error', () => sock.destroy())
    sock.pipe(other).pipe(sock)
  }

  /** Local (-L) and dynamic SOCKS5 (-D) forwards listen on this machine. */
  private startLocal(t: Tunnel, ok: () => void, fail: (e: Error) => void): void {
    const { rule, client } = t
    const server = createServer((sock) => {
      if (rule.kind === 'dynamic') return this.socks(t, sock)
      client.forwardOut(sock.remoteAddress ?? '127.0.0.1', sock.remotePort ?? 0, rule.destHost, rule.destPort, (err, ch) => {
        if (err) return sock.destroy()
        this.track(t, sock, ch)
      })
    })
    t.server = server
    server.on('error', (e: NodeJS.ErrnoException) => fail(new Error(e.code === 'EADDRINUSE' ? `Порт ${rule.bindPort} уже занят другой программой` : e.message)))
    server.listen(rule.bindPort, rule.bindAddress, ok)
  }

  /** Remote (-R): the server listens and sends connections back to us. */
  private startRemote(t: Tunnel, ok: () => void, fail: (e: Error) => void): void {
    const { rule, client } = t
    client.on('tcp connection', (_info, accept) => {
      const ch = accept()
      const sock = netConnect(rule.destPort, rule.destHost)
      this.track(t, sock, ch)
    })
    client.forwardIn(rule.bindAddress, rule.bindPort, (err) => (err ? fail(new Error(`Сервер не разрешил удалённый проброс: ${err.message}`)) : ok()))
  }

  /** Minimal SOCKS5 (RFC 1928): no auth, CONNECT only. */
  private socks(t: Tunnel, sock: Socket): void {
    let buf = Buffer.alloc(0)
    let stage: 'greet' | 'request' = 'greet'
    const onData = (chunk: Buffer): void => {
      buf = Buffer.concat([buf, chunk])
      if (stage === 'greet') {
        if (buf.length < 2 || buf.length < 2 + buf[1]) return
        if (buf[0] !== 5) return void sock.destroy()
        const methods = buf.subarray(2, 2 + buf[1])
        buf = buf.subarray(2 + buf[1])
        if (!methods.includes(0)) {
          sock.end(Buffer.from([5, 0xff]))
          return
        }
        sock.write(Buffer.from([5, 0]))
        stage = 'request'
      }
      if (stage === 'request') {
        if (buf.length < 5) return
        const [ver, cmd, , atyp] = buf
        let host: string
        let off: number
        if (atyp === 1) {
          if (buf.length < 10) return
          host = [...buf.subarray(4, 8)].join('.')
          off = 8
        } else if (atyp === 3) {
          const len = buf[4]
          if (buf.length < 5 + len + 2) return
          host = buf.subarray(5, 5 + len).toString('utf-8')
          off = 5 + len
        } else if (atyp === 4) {
          if (buf.length < 22) return
          const parts: string[] = []
          for (let i = 0; i < 16; i += 2) parts.push(buf.readUInt16BE(4 + i).toString(16))
          host = parts.join(':')
          off = 20
        } else {
          sock.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0]))
          return
        }
        const port = buf.readUInt16BE(off)
        sock.removeListener('data', onData)
        sock.pause()
        if (ver !== 5 || cmd !== 1) {
          sock.end(Buffer.from([5, 7, 0, 1, 0, 0, 0, 0, 0, 0]))
          return
        }
        t.client.forwardOut('127.0.0.1', 0, host, port, (err, ch) => {
          if (err) {
            sock.end(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0]))
            return
          }
          sock.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]))
          const rest = buf.subarray(off + 2)
          if (rest.length) ch.write(rest)
          this.track(t, sock, ch)
          sock.resume()
        })
      }
    }
    sock.on('data', onData)
    sock.on('error', () => sock.destroy())
  }

  stop(ruleId: string, silent = false): void {
    const t = this.tunnels.get(ruleId)
    if (!t) return
    t.status = { ...t.status, state: 'stopped', connections: 0, message: undefined }
    this.teardown(t)
    this.tunnels.delete(ruleId)
    if (!silent) this.onStatus(t.status)
  }

  stopAll(): void {
    for (const id of [...this.tunnels.keys()]) this.stop(id)
  }

  private teardown(t: Tunnel): void {
    t.server?.close()
    for (const s of t.sockets) s.destroy()
    t.sockets.clear()
    t.client.end()
  }
}

export { isIP }
