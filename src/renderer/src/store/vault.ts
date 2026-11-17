import { create } from 'zustand'
import type { Group, GroupInput, Host, HostInput, PasswordChange } from '@shared/vault'
import { errorText } from '@/lib/errors'

export type Editing =
  | { kind: 'host'; id?: string; groupId?: string | null }
  | { kind: 'group'; id?: string; parentId?: string | null }
  | { kind: 'quick'; host: string; port: number; username: string }
  | null

interface VaultState {
  hosts: Host[]
  groups: Group[]
  secretsPersistent: boolean
  loaded: boolean
  error?: string
  currentGroupId: string | null
  editing: Editing
  tagFilter: string | null
  load(): Promise<void>
  saveHost(input: HostInput, password: PasswordChange): Promise<Host>
  deleteHost(id: string): Promise<void>
  saveGroup(input: GroupInput): Promise<Group>
  deleteGroup(id: string): Promise<void>
  openGroup(id: string | null): void
  edit(e: Editing): void
  setTagFilter(t: string | null): void
}

async function wrap<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (e) {
    throw new Error(errorText(e))
  }
}

export const useVault = create<VaultState>((set, get) => ({
  hosts: [],
  groups: [],
  secretsPersistent: true,
  loaded: false,
  currentGroupId: null,
  editing: null,
  tagFilter: null,

  load: async () => {
    try {
      const s = await window.api.vault.snapshot()
      set({ hosts: s.hosts, groups: s.groups, secretsPersistent: s.secretsPersistent, loaded: true, error: undefined })
    } catch (e) {
      set({ loaded: true, error: errorText(e) })
    }
  },
  saveHost: async (input, password) => {
    const host = await wrap(window.api.vault.saveHost(input, password))
    await get().load()
    return host
  },
  deleteHost: async (id) => {
    await wrap(window.api.vault.deleteHost(id))
    set({ editing: null })
    await get().load()
  },
  saveGroup: async (input) => {
    const g = await wrap(window.api.vault.saveGroup(input))
    await get().load()
    return g
  },
  deleteGroup: async (id) => {
    const parent = get().groups.find((g) => g.id === id)?.parentId ?? null
    await wrap(window.api.vault.deleteGroup(id))
    set((s) => ({ editing: null, currentGroupId: s.currentGroupId === id ? parent : s.currentGroupId }))
    await get().load()
  },
  openGroup: (currentGroupId) => set({ currentGroupId }),
  edit: (editing) => set({ editing }),
  setTagFilter: (tagFilter) => set({ tagFilter })
}))

/** Hosts in a group and all of its subgroups. */
export function countHostsDeep(groupId: string, groups: Group[], hosts: Host[]): number {
  const ids = new Set([groupId])
  let grew = true
  while (grew) {
    grew = false
    for (const g of groups) if (g.parentId && ids.has(g.parentId) && !ids.has(g.id)) (ids.add(g.id), (grew = true))
  }
  return hosts.filter((h) => h.groupId && ids.has(h.groupId)).length
}

export function groupPath(id: string | null, groups: Group[]): Group[] {
  const path: Group[] = []
  let cur = id
  for (let i = 0; cur && i < 100; i++) {
    const g = groups.find((x) => x.id === cur)
    if (!g) break
    path.unshift(g)
    cur = g.parentId
  }
  return path
}
