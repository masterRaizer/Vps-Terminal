import type { ConnectRequest } from '@shared/ipc'

/** Validate untrusted renderer input before it reaches ssh2. */
export function validateConnectRequest(raw: unknown): ConnectRequest {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid request')
  const r = raw as Record<string, unknown>
  const host = typeof r.host === 'string' ? r.host.trim() : ''
  const username = typeof r.username === 'string' ? r.username.trim() : ''
  const port = Number(r.port ?? 22)
  const cols = Number(r.cols ?? 80)
  const rows = Number(r.rows ?? 24)
  if (!host || host.length > 255 || /\s/.test(host)) throw new Error('Invalid host')
  if (!username || username.length > 128) throw new Error('Invalid username')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port')
  if (r.password !== undefined && typeof r.password !== 'string') throw new Error('Invalid password')
  const clamp = (n: number, lo: number, hi: number): number =>
    Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : lo
  return {
    host,
    port,
    username,
    password: r.password as string | undefined,
    agent: r.agent === true,
    cols: clamp(cols, 10, 1000),
    rows: clamp(rows, 4, 500)
  }
}

/** Clamp terminal geometry coming from the renderer. */
export function validateGeometry(raw: Record<string, unknown>): { cols: number; rows: number } {
  const clamp = (n: unknown, lo: number, hi: number, d: number): number =>
    Number.isInteger(n) ? Math.min(hi, Math.max(lo, n as number)) : d
  return { cols: clamp(raw.cols, 10, 1000, 80), rows: clamp(raw.rows, 4, 500, 24) }
}
