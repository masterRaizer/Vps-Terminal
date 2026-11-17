/** Parses "ssh user@host -p port", "user@host:port", "[v6]:port" shorthands. */
export function parseTarget(input: string): { username?: string; host: string; port?: number } {
  let rest = input.trim().replace(/^ssh\s+/i, '')
  let port: number | undefined
  const pFlag = /(?:^|\s)-p\s*(\d{1,5})/.exec(rest)
  if (pFlag) {
    port = Number(pFlag[1])
    rest = rest.replace(pFlag[0], '').trim()
  }
  rest = rest.split(/\s+/)[0] ?? ''
  let username: string | undefined
  const at = rest.lastIndexOf('@')
  if (at > 0) {
    username = rest.slice(0, at)
    rest = rest.slice(at + 1)
  }
  const v6 = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(rest)
  if (v6) return { username, host: v6[1], port: v6[2] ? Number(v6[2]) : port }
  const m = /^([^:]+):(\d{1,5})$/.exec(rest)
  if (m) return { username, host: m[1], port: Number(m[2]) }
  return { username, host: rest, port }
}
