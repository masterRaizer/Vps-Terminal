/** Vault data model shared by main and renderer. Secrets never appear here. */

export type AuthMethod = 'password' | 'key' | 'agent'

export interface Group {
  id: string
  name: string
  parentId: string | null
  color: string | null
  createdAt: number
  updatedAt: number
}

export type BackspaceMode = 'del' | 'ctrl-h'

/** Per-host session options. */
export interface HostOptions {
  /** What the Backspace key sends: DEL (^?, default) or ^H. */
  backspace: BackspaceMode
  /** Forward the local SSH agent to the server. */
  agentForward: boolean
  /** Environment variables requested for the shell (server must AcceptEnv them). */
  env: Record<string, string>
  /** Terminal theme override for this host; null = global theme. */
  termTheme: string | null
}

export const DEFAULT_HOST_OPTIONS: HostOptions = { backspace: 'del', agentForward: false, env: {}, termTheme: null }

export interface Host {
  id: string
  label: string
  address: string
  port: number
  username: string
  auth: AuthMethod
  keyId: string | null
  groupId: string | null
  color: string | null
  tags: string[]
  favorite: boolean
  notes: string
  options: HostOptions
  /** True when a password for this host is stored in the OS credential store. */
  hasPassword: boolean
  createdAt: number
  updatedAt: number
  lastConnectedAt: number | null
}

export type HostInput = Omit<Host, 'id' | 'createdAt' | 'updatedAt' | 'lastConnectedAt' | 'hasPassword'> & { id?: string }
export type GroupInput = Pick<Group, 'name' | 'parentId' | 'color'> & { id?: string }

/** undefined = keep the stored password, null = forget it, string = replace it. */
export type PasswordChange = string | null | undefined

export interface VaultSnapshot {
  hosts: Host[]
  groups: Group[]
  /** False when the OS credential store is unavailable and secrets live only in memory. */
  secretsPersistent: boolean
}

export const HOST_COLORS = ['#0d4a80', '#e5541b', '#157a52', '#7a3db8', '#b8336a', '#a87a12', '#2f7f8f', '#4a5068'] as const
