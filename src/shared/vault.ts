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
  /** ISO 3166 alpha-2 country, shown as a flag. */
  country: string | null
  /** Where the country came from: GeoIP lookup, set by hand, or a panel integration. */
  countrySource: CountrySource
  /** Reusable credentials; when set, they replace the host's own user/password/key. */
  identityId: string | null
  /** Key file name from an import (e.g. "id_ed25519"), used to bind keys imported later. */
  keyHint: string | null
  /** Integration that manages this host (e.g. a Remnawave panel), or null. */
  source: string | null
  /** Id of the object in that integration (Remnawave node UUID). */
  externalId: string | null
  /** True when a password for this host is stored in the OS credential store. */
  hasPassword: boolean
  createdAt: number
  updatedAt: number
  lastConnectedAt: number | null
}

export type CountrySource = 'auto' | 'manual' | 'panel'

export type HostInput = Omit<
  Host,
  'id' | 'createdAt' | 'updatedAt' | 'lastConnectedAt' | 'hasPassword' | 'country' | 'countrySource' | 'identityId' | 'keyHint' | 'source' | 'externalId'
> & {
  id?: string
  country?: string | null
  countrySource?: CountrySource
  identityId?: string | null
  keyHint?: string | null
}

export type KeyType = 'ed25519' | 'rsa' | 'ecdsa' | 'unknown'

/** Private key material never leaves main; this is what the UI sees. */
export interface SshKey {
  id: string
  label: string
  type: KeyType
  bits: number | null
  /** OpenSSH one-line public key, when known. */
  publicKey: string | null
  fingerprint: string | null
  /** Private key is protected by a passphrase. */
  encrypted: boolean
  /** Passphrase is remembered in the credential store. */
  hasPassphrase: boolean
  createdAt: number
}

export interface Identity {
  id: string
  label: string
  username: string
  keyId: string | null
  hasPassword: boolean
  createdAt: number
  updatedAt: number
}

export interface IdentityInput {
  id?: string
  label: string
  username: string
  keyId: string | null
}

export interface Integration {
  id: string
  kind: 'remnawave'
  name: string
  url: string
  authMode: 'token' | 'login'
  /** Panel login (authMode = login). */
  login: string
  /** Group that holds the synced nodes. */
  groupId: string | null
  /** Credentials applied to synced nodes. */
  identityId: string | null
  sshPort: number
  sshUser: string
  lastSyncAt: number | null
  lastError: string | null
  hasSecret: boolean
}

export interface IntegrationInput {
  id?: string
  name: string
  url: string
  authMode: 'token' | 'login'
  login: string
  identityId: string | null
  sshPort: number
  sshUser: string
}

export interface SyncResult {
  created: number
  updated: number
  missing: number
  total: number
}

export interface KeyImportResult {
  added: SshKey[]
  skipped: string[]
  /** Hosts that were bound to an imported key by file name. */
  bound: number
}
export type GroupInput = Pick<Group, 'name' | 'parentId' | 'color'> & { id?: string }

/** undefined = keep the stored password, null = forget it, string = replace it. */
export type PasswordChange = string | null | undefined

export interface VaultSnapshot {
  hosts: Host[]
  groups: Group[]
  keys: SshKey[]
  identities: Identity[]
  integrations: Integration[]
  /** False when the OS credential store is unavailable and secrets live only in memory. */
  secretsPersistent: boolean
}

export const HOST_COLORS = ['#0d4a80', '#e5541b', '#157a52', '#7a3db8', '#b8336a', '#a87a12', '#2f7f8f', '#4a5068'] as const
