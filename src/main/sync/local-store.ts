import type { Db } from '../db'
import type { DataKeyCipher } from '../key-crypto'
import type { SecretStore } from '../secrets'
import { emptyDoc, SYNC_KINDS, type SyncDoc, type SyncKind, type SyncRecord } from './document'

interface KindSpec {
  table: SyncKind
  /** Column(s) forming the record id. */
  idOf: (row: Record<string, unknown>) => string
  /** Timestamp column. */
  ts: string
  /** Device-local columns that are not synced. */
  local: string[]
  /** Credential-store account holding this record's secret, if any. */
  secretAccount?: (id: string) => string
}

const SPECS: Record<SyncKind, KindSpec> = {
  groups: { table: 'groups', idOf: (r) => String(r.id), ts: 'updated_at', local: [] },
  ssh_keys: { table: 'ssh_keys', idOf: (r) => String(r.id), ts: 'updated_at', local: ['private_enc'], secretAccount: (id) => `key:${id}:passphrase` },
  identities: { table: 'identities', idOf: (r) => String(r.id), ts: 'updated_at', local: [], secretAccount: (id) => `identity:${id}:password` },
  hosts: { table: 'hosts', idOf: (r) => String(r.id), ts: 'updated_at', local: ['last_connected_at'], secretAccount: (id) => `host:${id}:password` },
  snippets: { table: 'snippets', idOf: (r) => String(r.id), ts: 'updated_at', local: [] },
  forwards: { table: 'forwards', idOf: (r) => String(r.id), ts: 'updated_at', local: [] },
  integrations: { table: 'integrations', idOf: (r) => String(r.id), ts: 'updated_at', local: ['last_sync_at', 'last_error'], secretAccount: (id) => `integration:${id}:secret` },
  known_hosts: { table: 'known_hosts', idOf: (r) => `${r.host}|${r.port}|${r.algorithm}`, ts: 'added_at', local: ['last_seen_at'] }
}

/** Reads and writes the local database in sync-document form. */
export class SyncLocalStore {
  constructor(private readonly db: Db, private readonly secrets: SecretStore, private readonly cipher: DataKeyCipher) {}

  async export(): Promise<SyncDoc> {
    const doc = emptyDoc()
    for (const kind of SYNC_KINDS) {
      const spec = SPECS[kind]
      for (const raw of this.db.prepare(`SELECT * FROM ${spec.table}`).all() as Array<Record<string, unknown>>) {
        const id = spec.idOf(raw)
        const row = Object.fromEntries(Object.entries(raw).filter(([k]) => !spec.local.includes(k)))
        const rec: SyncRecord = { u: Number(raw[spec.ts] ?? 0), row }
        if (spec.secretAccount) {
          const s = await this.secrets.get(spec.secretAccount(id))
          if (s) rec.secret = s
        }
        if (kind === 'ssh_keys') rec.privateKey = await this.cipher.decrypt(raw.private_enc as Buffer)
        doc.records[kind][id] = rec
      }
    }
    for (const t of this.db.prepare('SELECT kind, id, deleted_at FROM tombstones').all() as Array<{ kind: string; id: string; deleted_at: number }>) {
      doc.tombstones[`${t.kind}:${t.id}`] = t.deleted_at
    }
    return doc
  }

  /** Makes the database match `merged`. Returns how many records changed locally. */
  async apply(merged: SyncDoc, local: SyncDoc): Promise<number> {
    const upserts: Array<{ kind: SyncKind; id: string; rec: SyncRecord; enc?: Buffer }> = []
    const deletes: Array<{ kind: SyncKind; id: string }> = []
    for (const kind of SYNC_KINDS) {
      for (const [id, rec] of Object.entries(merged.records[kind])) {
        const mine = local.records[kind][id]
        if (!mine || mine.u !== rec.u) upserts.push({ kind, id, rec, enc: kind === 'ssh_keys' ? await this.cipher.encrypt(rec.privateKey ?? '') : undefined })
      }
      for (const id of Object.keys(local.records[kind])) if (!merged.records[kind][id]) deletes.push({ kind, id })
    }
    const cols = (table: string): Set<string> => new Set((this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name))
    const known = Object.fromEntries(SYNC_KINDS.map((k) => [k, cols(SPECS[k].table)])) as Record<SyncKind, Set<string>>

    this.db.pragma('foreign_keys = OFF')
    try {
      this.db.transaction(() => {
        for (const { kind, id } of deletes) {
          if (kind === 'known_hosts') {
            const [host, port, algorithm] = id.split('|')
            this.db.prepare('DELETE FROM known_hosts WHERE host = ? AND port = ? AND algorithm = ?').run(host, Number(port), algorithm)
          } else this.db.prepare(`DELETE FROM ${SPECS[kind].table} WHERE id = ?`).run(id)
        }
        for (const { kind, rec, enc } of upserts) {
          // Only columns this schema knows (a newer device may send more).
          const row: Record<string, unknown> = Object.fromEntries(Object.entries(rec.row).filter(([k]) => known[kind].has(k)))
          if (kind === 'ssh_keys') row.private_enc = enc
          if (SPECS[kind].secretAccount) row[kind === 'integrations' ? 'has_secret' : kind === 'ssh_keys' ? 'has_passphrase' : 'has_password'] = rec.secret ? 1 : 0
          const names = Object.keys(row)
          this.db.prepare(`INSERT OR REPLACE INTO ${SPECS[kind].table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...names.map((n) => row[n] as never))
        }
        this.db.prepare('DELETE FROM tombstones').run()
        const ins = this.db.prepare('INSERT INTO tombstones (kind,id,deleted_at) VALUES (?,?,?)')
        for (const [key, t] of Object.entries(merged.tombstones)) {
          const i = key.indexOf(':')
          ins.run(key.slice(0, i), key.slice(i + 1), t)
        }
        this.repairReferences()
      })()
    } finally {
      this.db.pragma('foreign_keys = ON')
    }
    for (const { kind, id, rec } of upserts) {
      const acc = SPECS[kind].secretAccount?.(id)
      if (!acc) continue
      if (rec.secret) await this.secrets.set(acc, rec.secret)
      else await this.secrets.delete(acc)
    }
    for (const { kind, id } of deletes) {
      const acc = SPECS[kind].secretAccount?.(id)
      if (acc) await this.secrets.delete(acc)
    }
    return upserts.length + deletes.length
  }

  /** Records may arrive before/after what they point to; drop references that now dangle. */
  private repairReferences(): void {
    const q = (sql: string): void => void this.db.prepare(sql).run()
    q('UPDATE groups SET parent_id = NULL WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM groups)')
    q('UPDATE hosts SET group_id = NULL WHERE group_id IS NOT NULL AND group_id NOT IN (SELECT id FROM groups)')
    q("UPDATE hosts SET key_id = NULL, auth = CASE WHEN auth = 'key' THEN 'password' ELSE auth END WHERE key_id IS NOT NULL AND key_id NOT IN (SELECT id FROM ssh_keys)")
    q('UPDATE hosts SET identity_id = NULL WHERE identity_id IS NOT NULL AND identity_id NOT IN (SELECT id FROM identities)')
    q('UPDATE identities SET key_id = NULL WHERE key_id IS NOT NULL AND key_id NOT IN (SELECT id FROM ssh_keys)')
    q('UPDATE integrations SET group_id = NULL WHERE group_id IS NOT NULL AND group_id NOT IN (SELECT id FROM groups)')
    q('UPDATE integrations SET identity_id = NULL WHERE identity_id IS NOT NULL AND identity_id NOT IN (SELECT id FROM identities)')
    q('DELETE FROM forwards WHERE host_id NOT IN (SELECT id FROM hosts)')
  }
}
