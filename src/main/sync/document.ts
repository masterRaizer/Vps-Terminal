/** The plaintext that is encrypted and synced: records per kind with timestamps, plus deletions. */

export const SYNC_KINDS = ['groups', 'ssh_keys', 'identities', 'hosts', 'snippets', 'forwards', 'integrations', 'known_hosts'] as const
export type SyncKind = (typeof SYNC_KINDS)[number]

export interface SyncRecord {
  /** Last change, ms. */
  u: number
  /** DB row without device-local columns. */
  row: Record<string, unknown>
  /** Password / token / passphrase that lives in the OS credential store. */
  secret?: string
  /** Private key text (ssh_keys only). */
  privateKey?: string
}

export interface SyncDoc {
  schema: 1
  records: Record<SyncKind, Record<string, SyncRecord>>
  /** "kind:id" → deletion time */
  tombstones: Record<string, number>
}

export const emptyDoc = (): SyncDoc => ({ schema: 1, records: Object.fromEntries(SYNC_KINDS.map((k) => [k, {}])) as SyncDoc['records'], tombstones: {} })

/** Tombstones older than this are dropped; a device offline longer than that may resurrect a deletion. */
const TOMBSTONE_TTL = 180 * 24 * 3600 * 1000

/**
 * Per-record last-writer-wins merge. Deterministic: ties go to the remote copy so every device converges.
 * A deletion beats any record not changed after it.
 */
export function merge(local: SyncDoc, remote: SyncDoc, now = Date.now()): SyncDoc {
  const out = emptyDoc()
  for (const [k, t] of [...Object.entries(local.tombstones), ...Object.entries(remote.tombstones)]) {
    if (now - t < TOMBSTONE_TTL) out.tombstones[k] = Math.max(out.tombstones[k] ?? 0, t)
  }
  for (const kind of SYNC_KINDS) {
    const l = local.records[kind] ?? {}
    const r = remote.records[kind] ?? {}
    for (const id of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const a = l[id]
      const b = r[id]
      const win = !a ? b : !b ? a : a.u > b.u ? a : b
      const dead = out.tombstones[`${kind}:${id}`]
      if (dead !== undefined && dead >= win.u) continue
      out.records[kind][id] = win
      // A record changed after its deletion (edited on another device) is alive again.
      if (dead !== undefined) delete out.tombstones[`${kind}:${id}`]
    }
  }
  return out
}

/** Stable string for change detection. */
export function fingerprintDoc(doc: SyncDoc): string {
  const parts: string[] = []
  for (const kind of SYNC_KINDS) for (const id of Object.keys(doc.records[kind]).sort()) parts.push(`${kind}:${id}:${doc.records[kind][id].u}`)
  for (const k of Object.keys(doc.tombstones).sort()) parts.push(`t:${k}:${doc.tombstones[k]}`)
  return parts.join('|')
}
