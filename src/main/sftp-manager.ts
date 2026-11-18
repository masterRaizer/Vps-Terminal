import { randomUUID } from 'node:crypto'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { posix } from 'node:path'
import { Client, type FileEntryWithStats, type SFTPWrapper } from 'ssh2'
import type { FileEntry, Listing, TransferEvent } from '@shared/files'
import { keyAlgorithm, sha256Fingerprint } from './fingerprint'
import { defaultAgent, type HostKeyInfo } from './ssh-manager'
import { humanizeSshError } from './ssh-errors'

export interface SftpConnectRequest {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
  agent?: boolean
}

interface Session {
  client: Client
  sftp: SFTPWrapper
}

const S_IFMT = 0o170000
const typeOf = (mode: number): FileEntry['type'] => {
  const t = mode & S_IFMT
  return t === 0o040000 ? 'dir' : t === 0o100000 ? 'file' : t === 0o120000 ? 'link' : 'other'
}

const p = <T>(fn: (cb: (err: Error | null | undefined, v?: T) => void) => void): Promise<T> =>
  new Promise((resolve, reject) => fn((err, v) => (err ? reject(err) : resolve(v as T))))

/** Remote paths are POSIX; reject NUL bytes and non-absolute paths. */
function remotePath(path: unknown): string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('\0') || path.length > 4096) throw new Error('Неверный удалённый путь')
  return posix.normalize(path)
}

export class SftpManager {
  private sessions = new Map<string, Session>()
  private cancelled = new Set<string>()

  constructor(
    private readonly verifyHostKey: (info: Omit<HostKeyInfo, 'sessionId'> & { sessionId: string }) => Promise<boolean>,
    private readonly onTransfer: (ev: TransferEvent) => void,
    private readonly onClosed: (sftpId: string) => void
  ) {}

  open(req: SftpConnectRequest): Promise<{ id: string; home: string }> {
    const id = randomUUID()
    const client = new Client()
    return new Promise((resolve, reject) => {
      let settled = false
      const fail = (e: Error): void => {
        if (!settled) {
          settled = true
          reject(e)
        }
        client.end()
      }
      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) return fail(new Error(`SFTP недоступен на сервере: ${err.message}`))
          this.sessions.set(id, { client, sftp })
          sftp.realpath('.', (e2, home) => {
            settled = true
            resolve({ id, home: e2 ? '/' : home })
          })
        })
      })
      client.on('error', (e) => fail(new Error(humanizeSshError(e, `${req.host}:${req.port}`))))
      client.on('close', () => {
        if (this.sessions.delete(id)) this.onClosed(id)
        if (!settled) fail(new Error('Соединение закрыто'))
      })
      client.connect({
        host: req.host,
        port: req.port,
        username: req.username,
        password: req.password,
        privateKey: req.privateKey,
        passphrase: req.passphrase,
        agent: req.agent ? defaultAgent() : undefined,
        tryKeyboard: Boolean(req.password),
        readyTimeout: 20000,
        keepaliveInterval: 15000,
        hostVerifier: (key: Buffer, verify: (ok: boolean) => void) => {
          this.verifyHostKey({ sessionId: id, host: req.host, port: req.port, algorithm: keyAlgorithm(key), fingerprint: sha256Fingerprint(key) }).then(verify, () => verify(false))
        }
      })
      if (req.password) {
        const pwd = req.password
        client.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => finish(prompts.map(() => pwd)))
      }
    })
  }

  close(id: string): void {
    this.sessions.get(id)?.client.end()
  }

  closeAll(): void {
    for (const s of this.sessions.values()) s.client.end()
  }

  private get(id: string): SFTPWrapper {
    const s = this.sessions.get(id)
    if (!s) throw new Error('SFTP-сессия закрыта')
    return s.sftp
  }

  async list(id: string, rawPath: unknown): Promise<Listing> {
    const sftp = this.get(id)
    const path = remotePath(rawPath)
    const items = await p<FileEntryWithStats[]>((cb) => sftp.readdir(path, cb))
    const entries: FileEntry[] = items
      .filter((i) => i.filename !== '.' && i.filename !== '..')
      .map((i) => ({ name: i.filename, type: typeOf(i.attrs.mode), size: i.attrs.size, mtime: i.attrs.mtime * 1000, mode: i.attrs.mode & 0o7777 }))
    // Resolve symlinks to directories so they can be opened.
    await Promise.all(
      entries
        .filter((e) => e.type === 'link')
        .map(async (e) => {
          const st = await p<{ mode: number }>((cb) => sftp.stat(posix.join(path, e.name), cb)).catch(() => null)
          if (st && typeOf(st.mode) === 'dir') e.type = 'dir'
        })
    )
    return { path, entries }
  }

  async mkdir(id: string, path: unknown): Promise<void> {
    const sftp = this.get(id)
    await p((cb) => sftp.mkdir(remotePath(path), cb))
  }

  async rename(id: string, from: unknown, to: unknown): Promise<void> {
    const sftp = this.get(id)
    await p((cb) => sftp.rename(remotePath(from), remotePath(to), cb))
  }

  async chmod(id: string, path: unknown, mode: unknown): Promise<void> {
    if (!Number.isInteger(mode) || (mode as number) < 0 || (mode as number) > 0o7777) throw new Error('Неверные права')
    const sftp = this.get(id)
    await p((cb) => sftp.chmod(remotePath(path), mode as number, cb))
  }

  /** Deletes a file or a directory tree. */
  async remove(id: string, rawPath: unknown): Promise<void> {
    const sftp = this.get(id)
    const path = remotePath(rawPath)
    if (path === '/' || path.split('/').filter(Boolean).length < 1) throw new Error('Корень удалять нельзя')
    const st = await p<{ mode: number }>((cb) => sftp.lstat(path, cb))
    if (typeOf(st.mode) !== 'dir') return p((cb) => sftp.unlink(path, cb))
    const { entries } = await this.list(id, path)
    for (const e of entries) await this.remove(id, posix.join(path, e.name))
    await p((cb) => sftp.rmdir(path, cb))
  }

  cancel(transferId: string): void {
    this.cancelled.add(transferId)
  }

  /** Uploads local files/folders into a remote directory. Returns the transfer id. */
  upload(id: string, localPaths: string[], rawDir: unknown): string {
    const sftp = this.get(id)
    const dir = remotePath(rawDir)
    const tid = randomUUID()
    void this.run(tid, id, 'upload', localPaths.map((l) => basename(l)).join(', '), async (progress) => {
      const plan: Array<{ local: string; remote: string; size: number; isDir: boolean }> = []
      const walk = async (local: string, remote: string): Promise<void> => {
        const st = await stat(local)
        if (st.isDirectory()) {
          plan.push({ local, remote, size: 0, isDir: true })
          for (const n of await readdir(local)) await walk(join(local, n), posix.join(remote, n))
        } else if (st.isFile()) plan.push({ local, remote, size: st.size, isDir: false })
      }
      for (const l of localPaths) await walk(l, posix.join(dir, basename(l)))
      const total = plan.reduce((a, b) => a + b.size, 0)
      let done = 0
      for (const item of plan) {
        if (this.cancelled.has(tid)) throw new Error('Отменено')
        if (item.isDir) {
          await p((cb) => sftp.mkdir(item.remote, cb)).catch(() => undefined)
          continue
        }
        const base = done
        await p((cb) => sftp.fastPut(item.local, item.remote, { step: (t) => progress(base + t, total) }, (e) => cb(e)))
        done += item.size
        progress(done, total)
      }
    })
    return tid
  }

  /** Downloads remote files/folders into a local directory. */
  download(id: string, rawPaths: unknown[], localDir: string): string {
    const sftp = this.get(id)
    const paths = rawPaths.map(remotePath)
    const tid = randomUUID()
    void this.run(tid, id, 'download', paths.map((r) => posix.basename(r)).join(', '), async (progress) => {
      const plan: Array<{ remote: string; local: string; size: number; isDir: boolean }> = []
      const walk = async (remote: string, local: string): Promise<void> => {
        const st = await p<{ mode: number; size: number }>((cb) => sftp.stat(remote, cb))
        if (typeOf(st.mode) === 'dir') {
          plan.push({ remote, local, size: 0, isDir: true })
          const { entries } = await this.list(id, remote)
          for (const e of entries) await walk(posix.join(remote, e.name), join(local, safeLocalName(e.name)))
        } else plan.push({ remote, local, size: st.size, isDir: false })
      }
      for (const r of paths) await walk(r, join(localDir, safeLocalName(posix.basename(r))))
      const total = plan.reduce((a, b) => a + b.size, 0)
      let done = 0
      for (const item of plan) {
        if (this.cancelled.has(tid)) throw new Error('Отменено')
        if (item.isDir) {
          await mkdir(item.local, { recursive: true })
          continue
        }
        const base = done
        await p((cb) => sftp.fastGet(item.remote, item.local, { step: (t) => progress(base + t, total) }, (e) => cb(e)))
        done += item.size
        progress(done, total)
      }
    })
    return tid
  }

  private async run(tid: string, sftpId: string, direction: TransferEvent['direction'], name: string, body: (progress: (done: number, total: number) => void) => Promise<void>): Promise<void> {
    let last = 0
    let total = 0
    let transferred = 0
    const emit = (status: TransferEvent['status'], message?: string): void => this.onTransfer({ id: tid, sftpId, direction, name, transferred, total, status, message })
    emit('running')
    try {
      await body((d, t) => {
        transferred = d
        total = t
        const now = Date.now()
        if (now - last > 120) {
          last = now
          emit('running')
        }
      })
      transferred = total
      emit('done')
    } catch (e) {
      emit(this.cancelled.has(tid) ? 'cancelled' : 'error', (e as Error).message)
    } finally {
      this.cancelled.delete(tid)
    }
  }
}

/** Remote names may contain characters Windows forbids. */
export function safeLocalName(name: string): string {
  const cleaned = name.replace(/[<>:"\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '_')
  return /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(cleaned) ? `_${cleaned}` : cleaned || '_'
}
