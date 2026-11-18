import type { Client } from 'ssh2'

/**
 * Handshake timeout that pauses while the host key is being verified.
 * ssh2's own readyTimeout keeps counting during hostVerifier, so a user who takes
 * longer than the timeout to answer the "trust this server?" dialog would lose a
 * perfectly good connection. Pass the returned options to client.connect().
 */
export function guardHandshake(
  client: Client,
  ms: number,
  verify: (key: Buffer) => Promise<boolean>
): { readyTimeout: 0; hostVerifier: (key: Buffer, cb: (ok: boolean) => void) => void; cancel: () => void } {
  let timer: NodeJS.Timeout | undefined
  const stop = (): void => clearTimeout(timer)
  const arm = (): void => {
    stop()
    timer = setTimeout(() => {
      client.emit('error', Object.assign(new Error('Timed out while waiting for handshake'), { level: 'client-timeout' }))
      client.destroy()
    }, ms)
  }
  client.once('ready', stop)
  client.once('close', stop)
  arm()
  return {
    readyTimeout: 0,
    cancel: stop,
    hostVerifier: (key, cb) => {
      stop()
      verify(key).then(
        (ok) => {
          if (ok) arm()
          cb(ok)
        },
        () => cb(false)
      )
    }
  }
}
