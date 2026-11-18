import { randomUUID } from 'node:crypto'
import { Client, type ClientChannel } from 'ssh2'
import type { ConnectRequest, SessionEvent } from '@shared/ipc'
import { keyAlgorithm, sha256Fingerprint } from './fingerprint'
import { humanizeSshError } from './ssh-errors'
import { guardHandshake } from './handshake'

export interface HostKeyInfo {
  sessionId: string
  host: string
  port: number
  algorithm: string
  fingerprint: string
}

export interface SshManagerEvents {
  onData(sessionId: string, data: string): void
  onStatus(ev: SessionEvent): void
  /** Resolve true to trust the server key, false to abort. */
  verifyHostKey(info: HostKeyInfo): Promise<boolean>
}

/** Windows OpenSSH agent pipe, or the Unix agent socket. */
export function defaultAgent(): string | undefined {
  return process.platform === 'win32' ? '\\\\.\\pipe\\openssh-ssh-agent' : process.env['SSH_AUTH_SOCK']
}

interface Session {
  client: Client
  stream?: ClientChannel
  decoder: TextDecoder
}

/**
 * Owns all ssh2 connections. Lives only in the main process.
 * Credentials are passed straight to ssh2 and not retained.
 */
export class SshManager {
  private sessions = new Map<string, Session>()

  constructor(
    private readonly events: SshManagerEvents,
    private readonly readyTimeout = 20000
  ) {}

  /** `privateKey`/`passphrase` are main-only: they never come from the renderer. */
  connect(req: ConnectRequest & { privateKey?: string; passphrase?: string }): string {
    const sessionId = randomUUID()
    const client = new Client()
    const session: Session = { client, decoder: new TextDecoder('utf-8') }
    this.sessions.set(sessionId, session)

    // ssh2 often reports one failure several times (error, another error, close): show the first only.
    let failed = false
    const emit = (status: SessionEvent['status'], message?: string): void => {
      if (failed) return
      if (status === 'error') failed = true
      this.events.onStatus({ sessionId, status, message })
    }

    client.on('ready', () => {
      client.shell(
        { term: 'xterm-256color', cols: req.cols, rows: req.rows },
        { env: req.env ?? {} },
        (err, stream) => {
          if (err) {
            emit('error', humanizeSshError(err))
            client.end()
            return
          }
          session.stream = stream
          emit('ready')
          stream.on('data', (chunk: Buffer) => {
            this.events.onData(sessionId, session.decoder.decode(chunk, { stream: true }))
          })
          stream.stderr.on('data', (chunk: Buffer) => {
            this.events.onData(sessionId, chunk.toString('utf-8'))
          })
          stream.on('close', () => client.end())
        }
      )
    })
    client.on('error', (err) => emit('error', humanizeSshError(err, `${req.host}:${req.port}`)))
    client.on('close', () => {
      if (this.sessions.delete(sessionId)) emit('closed')
    })

    emit('connecting')
    const guard = guardHandshake(client, this.readyTimeout, (key) =>
      this.events.verifyHostKey({ sessionId, host: req.host, port: req.port, algorithm: keyAlgorithm(key), fingerprint: sha256Fingerprint(key) })
    )
    try {
      client.connect({
        host: req.host,
        port: req.port,
        username: req.username,
        password: req.password,
        privateKey: req.privateKey,
        passphrase: req.passphrase,
        agent: req.agent || req.agentForward ? defaultAgent() : undefined,
        agentForward: Boolean(req.agentForward && defaultAgent()),
        tryKeyboard: Boolean(req.password),
        readyTimeout: guard.readyTimeout,
        keepaliveInterval: 15000,
        hostVerifier: guard.hostVerifier
      })
      // Answer keyboard-interactive password prompts with the same password.
      if (req.password) {
        const pwd = req.password
        client.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => {
          finish(prompts.map(() => pwd))
        })
      }
    } catch (e) {
      guard.cancel()
      emit('error', humanizeSshError(e))
      this.sessions.delete(sessionId)
    }
    return sessionId
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.stream?.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.stream?.setWindow(rows, cols, 0, 0)
  }

  disconnect(sessionId: string): void {
    this.sessions.get(sessionId)?.client.end()
  }

  disconnectAll(): void {
    for (const s of this.sessions.values()) s.client.end()
  }

  get size(): number {
    return this.sessions.size
  }
}
