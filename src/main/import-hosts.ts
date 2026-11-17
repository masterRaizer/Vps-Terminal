import { DEFAULT_HOST_OPTIONS, type HostInput } from '@shared/vault'
import type { VaultService } from './vault-service'

export interface ImportResult {
  added: number
  skipped: number
  errors: string[]
}

/**
 * Imports a hosts.json: an array (or { hosts: [...] }) of
 * { label?, address|host|hostname, port?, username|user?, key?, group?, tags? }.
 * Secrets are never read from the file. Hosts that already exist (same address, port, user) are skipped.
 */
export async function importHosts(data: unknown, vault: VaultService): Promise<ImportResult> {
  const list = Array.isArray(data) ? data : Array.isArray((data as { hosts?: unknown })?.hosts) ? (data as { hosts: unknown[] }).hosts : null
  if (!list) throw new Error('Ожидается массив хостов или { "hosts": [...] }')
  if (list.length > 5000) throw new Error('Слишком много записей')

  const res: ImportResult = { added: 0, skipped: 0, errors: [] }
  const snap = vault.snapshot()
  const seen = new Set(snap.hosts.map((h) => `${h.address.toLowerCase()}:${h.port}:${h.username}`))
  const groupIds = new Map(snap.groups.filter((g) => !g.parentId).map((g) => [g.name.toLowerCase(), g.id]))

  for (const [i, raw] of list.entries()) {
    try {
      if (typeof raw !== 'object' || raw === null) throw new Error('не объект')
      const r = raw as Record<string, unknown>
      const address = String(r.address ?? r.host ?? r.hostname ?? '').trim()
      const username = String(r.username ?? r.user ?? 'root').trim()
      const port = r.port === undefined ? 22 : Number(r.port)
      const key = typeof r.key === 'string' ? r.key.trim().slice(0, 200) : ''
      const id = `${address.toLowerCase()}:${port}:${username}`
      if (seen.has(id)) {
        res.skipped++
        continue
      }
      let groupId: string | null = null
      if (typeof r.group === 'string' && r.group.trim()) {
        const name = r.group.trim()
        groupId = groupIds.get(name.toLowerCase()) ?? null
        if (!groupId) {
          groupId = vault.saveGroup({ name, parentId: null, color: null }).id
          groupIds.set(name.toLowerCase(), groupId)
        }
      }
      const input: HostInput = {
        label: typeof r.label === 'string' ? r.label : address,
        address,
        port,
        username,
        auth: key ? 'key' : 'password',
        keyId: null,
        groupId,
        color: null,
        tags: Array.isArray(r.tags) ? (r.tags.filter((t) => typeof t === 'string') as string[]) : [],
        favorite: false,
        notes: key ? `Ключ: ${key}` : '',
        options: { ...DEFAULT_HOST_OPTIONS }
      }
      await vault.saveHost(input, undefined)
      seen.add(id)
      res.added++
    } catch (e) {
      res.errors.push(`#${i + 1}: ${(e as Error).message}`)
    }
  }
  return res
}
