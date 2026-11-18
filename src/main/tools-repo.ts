import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import type { ForwardRule, ForwardRuleInput, KnownHost, Snippet, SnippetInput, SnippetRun } from '@shared/vault'
import type { Db } from './db'

const tagsOf = (json: string): string[] => {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((t) => typeof t === 'string') : []
  } catch {
    return []
  }
}

const HOST_RE = /^[A-Za-z0-9.-]{1,253}$/

export function validateSnippet(raw: unknown): SnippetInput {
  if (typeof raw !== 'object' || raw === null) throw new Error('Неверный сниппет')
  const r = raw as Record<string, unknown>
  const command = typeof r.command === 'string' ? r.command : ''
  if (!command.trim()) throw new Error('Команда не может быть пустой')
  if (command.length > 64 * 1024) throw new Error('Команда слишком длинная')
  const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 120) : command.trim().split('\n')[0].slice(0, 60)
  const tags = Array.isArray(r.tags) ? [...new Set(r.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean))].slice(0, 20) : []
  return { id: typeof r.id === 'string' ? r.id : undefined, label, command, tags }
}

export function validateForward(raw: unknown): ForwardRuleInput {
  if (typeof raw !== 'object' || raw === null) throw new Error('Неверное правило')
  const r = raw as Record<string, unknown>
  const kind = r.kind === 'remote' || r.kind === 'dynamic' ? r.kind : 'local'
  const port = (v: unknown, name: string): number => {
    const n = Number(v)
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${name}: порт 1–65535`)
    return n
  }
  const bindAddress = typeof r.bindAddress === 'string' && r.bindAddress.trim() ? r.bindAddress.trim() : '127.0.0.1'
  if (!isIP(bindAddress) && bindAddress !== 'localhost') throw new Error('Адрес прослушивания: IP-адрес (обычно 127.0.0.1)')
  const destHost = typeof r.destHost === 'string' ? r.destHost.trim() : ''
  if (kind !== 'dynamic' && (!destHost || !(isIP(destHost) || HOST_RE.test(destHost)))) throw new Error('Укажите адрес назначения')
  if (typeof r.hostId !== 'string' || !r.hostId) throw new Error('Выберите хост для туннеля')
  return {
    id: typeof r.id === 'string' ? r.id : undefined,
    label: typeof r.label === 'string' ? r.label.trim().slice(0, 120) : '',
    hostId: r.hostId,
    kind,
    bindAddress,
    bindPort: port(r.bindPort, 'Локальный порт'),
    destHost: kind === 'dynamic' ? '' : destHost,
    destPort: kind === 'dynamic' ? 0 : port(r.destPort, 'Порт назначения'),
    autoStart: r.autoStart === true
  }
}

interface ForwardRow {
  id: string
  label: string
  host_id: string
  kind: ForwardRule['kind']
  bind_address: string
  bind_port: number
  dest_host: string
  dest_port: number
  auto_start: number
  created_at: number
}

const toForward = (r: ForwardRow): ForwardRule => ({
  id: r.id,
  label: r.label,
  hostId: r.host_id,
  kind: r.kind,
  bindAddress: r.bind_address,
  bindPort: r.bind_port,
  destHost: r.dest_host,
  destPort: r.dest_port,
  autoStart: r.auto_start === 1,
  createdAt: r.created_at
})

export type HostKeyCheck = { status: 'known' } | { status: 'new' } | { status: 'changed'; previous: KnownHost }

/** Snippets, snippet runs, known hosts and port-forward rules. */
export class ToolsRepo {
  constructor(private readonly db: Db, private readonly now: () => number = Date.now) {}

  // ---- snippets ----
  listSnippets(): Snippet[] {
    return (this.db.prepare('SELECT * FROM snippets ORDER BY label COLLATE NOCASE').all() as Array<{ id: string; label: string; command: string; tags: string; created_at: number; updated_at: number }>).map((r) => ({
      id: r.id,
      label: r.label,
      command: r.command,
      tags: tagsOf(r.tags),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }))
  }
  getSnippet(id: string): Snippet | null {
    return this.listSnippets().find((s) => s.id === id) ?? null
  }
  saveSnippet(raw: unknown): Snippet {
    const s = validateSnippet(raw)
    const t = this.now()
    if (s.id && this.getSnippet(s.id)) {
      this.db.prepare('UPDATE snippets SET label=?, command=?, tags=?, updated_at=? WHERE id=?').run(s.label, s.command, JSON.stringify(s.tags), t, s.id)
      return this.getSnippet(s.id)!
    }
    const id = s.id ?? randomUUID()
    this.db.prepare('INSERT INTO snippets (id,label,command,tags,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id, s.label, s.command, JSON.stringify(s.tags), t, t)
    return this.getSnippet(id)!
  }
  deleteSnippet(id: string): void {
    this.db.prepare('DELETE FROM snippets WHERE id = ?').run(id)
  }
  recordRun(snippetId: string | null, hostId: string | null, command: string): void {
    this.db.prepare('INSERT INTO snippet_runs (id,snippet_id,host_id,command,at) VALUES (?,?,?,?,?)').run(randomUUID(), snippetId, hostId, command.slice(0, 64 * 1024), this.now())
    // Keep the history bounded.
    this.db.prepare('DELETE FROM snippet_runs WHERE id IN (SELECT id FROM snippet_runs ORDER BY at DESC LIMIT -1 OFFSET 2000)').run()
  }
  runs(hostId: string | null, limit = 100): SnippetRun[] {
    const rows = (hostId
      ? this.db.prepare('SELECT * FROM snippet_runs WHERE host_id = ? ORDER BY at DESC LIMIT ?').all(hostId, limit)
      : this.db.prepare('SELECT * FROM snippet_runs ORDER BY at DESC LIMIT ?').all(limit)) as Array<{ id: string; snippet_id: string | null; host_id: string | null; command: string; at: number }>
    return rows.map((r) => ({ id: r.id, snippetId: r.snippet_id, hostId: r.host_id, command: r.command, at: r.at }))
  }

  // ---- known hosts ----
  listKnownHosts(): KnownHost[] {
    return (this.db.prepare('SELECT * FROM known_hosts ORDER BY host, port').all() as Array<{ host: string; port: number; algorithm: string; fingerprint: string; added_at: number; last_seen_at: number | null }>).map((r) => ({
      host: r.host,
      port: r.port,
      algorithm: r.algorithm,
      fingerprint: r.fingerprint,
      addedAt: r.added_at,
      lastSeenAt: r.last_seen_at
    }))
  }
  /** Trust on first use: a key is known when host+port has a matching fingerprint. */
  checkHostKey(host: string, port: number, algorithm: string, fingerprint: string): HostKeyCheck {
    const h = host.toLowerCase()
    const rows = this.listKnownHosts().filter((k) => k.host === h && k.port === port)
    if (rows.some((k) => k.fingerprint === fingerprint)) {
      this.db.prepare('UPDATE known_hosts SET last_seen_at = ? WHERE host = ? AND port = ? AND fingerprint = ?').run(this.now(), h, port, fingerprint)
      return { status: 'known' }
    }
    // A server may offer another algorithm we have no record for: that is new, not changed.
    const sameAlg = rows.find((k) => k.algorithm === algorithm)
    return sameAlg ? { status: 'changed', previous: sameAlg } : { status: 'new' }
  }
  trustHostKey(host: string, port: number, algorithm: string, fingerprint: string): void {
    this.db
      .prepare('INSERT INTO known_hosts (host,port,algorithm,fingerprint,added_at,last_seen_at) VALUES (?,?,?,?,?,?) ON CONFLICT(host,port,algorithm) DO UPDATE SET fingerprint=excluded.fingerprint, added_at=excluded.added_at, last_seen_at=excluded.last_seen_at')
      .run(host.toLowerCase(), port, algorithm, fingerprint, this.now(), this.now())
  }
  forgetHostKey(host: string, port: number, algorithm?: string): void {
    if (algorithm) this.db.prepare('DELETE FROM known_hosts WHERE host = ? AND port = ? AND algorithm = ?').run(host.toLowerCase(), port, algorithm)
    else this.db.prepare('DELETE FROM known_hosts WHERE host = ? AND port = ?').run(host.toLowerCase(), port)
  }

  // ---- forwards ----
  listForwards(): ForwardRule[] {
    return (this.db.prepare('SELECT * FROM forwards ORDER BY label COLLATE NOCASE, bind_port').all() as ForwardRow[]).map(toForward)
  }
  getForward(id: string): ForwardRule | null {
    const r = this.db.prepare('SELECT * FROM forwards WHERE id = ?').get(id) as ForwardRow | undefined
    return r ? toForward(r) : null
  }
  saveForward(raw: unknown): ForwardRule {
    const f = validateForward(raw)
    if (!this.db.prepare('SELECT 1 FROM hosts WHERE id = ?').get(f.hostId)) throw new Error('Хост не найден')
    const clash = this.listForwards().find((x) => x.id !== f.id && x.kind !== 'remote' && f.kind !== 'remote' && x.bindPort === f.bindPort && x.bindAddress === f.bindAddress)
    if (clash) throw new Error(`Порт ${f.bindPort} уже занят правилом «${clash.label || clash.bindPort}»`)
    const vals = [f.label, f.hostId, f.kind, f.bindAddress, f.bindPort, f.destHost, f.destPort, f.autoStart ? 1 : 0]
    if (f.id && this.getForward(f.id)) {
      this.db.prepare('UPDATE forwards SET label=?, host_id=?, kind=?, bind_address=?, bind_port=?, dest_host=?, dest_port=?, auto_start=? WHERE id=?').run(...vals, f.id)
      return this.getForward(f.id)!
    }
    const id = f.id ?? randomUUID()
    this.db.prepare('INSERT INTO forwards (label,host_id,kind,bind_address,bind_port,dest_host,dest_port,auto_start,id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(...vals, id, this.now())
    return this.getForward(id)!
  }
  deleteForward(id: string): void {
    this.db.prepare('DELETE FROM forwards WHERE id = ?').run(id)
  }
}

/** Parses an OpenSSH known_hosts file. Hashed (|1|…) and @revoked/@cert-authority lines are skipped. */
export function parseKnownHosts(text: string): { entries: Array<{ host: string; port: number; algorithm: string; keyB64: string }>; skipped: number } {
  const entries: Array<{ host: string; port: number; algorithm: string; keyB64: string }> = []
  let skipped = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    if (parts[0].startsWith('@') || parts.length < 3) {
      skipped++
      continue
    }
    const [hosts, algorithm, keyB64] = parts
    if (!/^[A-Za-z0-9+/=]+$/.test(keyB64)) {
      skipped++
      continue
    }
    for (const h of hosts.split(',')) {
      if (h.startsWith('|')) {
        skipped++
        continue
      }
      const m = /^\[([^\]]+)\]:(\d+)$/.exec(h)
      entries.push(m ? { host: m[1], port: Number(m[2]), algorithm, keyB64 } : { host: h, port: 22, algorithm, keyB64 })
    }
  }
  return { entries, skipped }
}
