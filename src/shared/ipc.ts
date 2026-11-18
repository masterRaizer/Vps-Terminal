/** IPC contract shared by main, preload and renderer. */
import type { Listing, TransferEvent } from './files'
import type { ForwardRule, ForwardRuleInput, KnownHost, Snippet, SnippetRun, TunnelStatus } from './vault'
import type { Group, GroupInput, Host, HostInput, Identity, IdentityInput, Integration, IntegrationInput, KeyImportResult, PasswordChange, SshKey, SyncResult, VaultSnapshot } from './vault'

export interface ConnectRequest {
  host: string
  port: number
  username: string
  /** Sent once to main for the handshake; never stored by main or renderer. */
  password?: string
  /** Authenticate with the system SSH agent (Windows OpenSSH agent / SSH_AUTH_SOCK). */
  agent?: boolean
  /** Forward the agent to the server (requires an agent). */
  agentForward?: boolean
  /** Environment variables requested for the shell. */
  env?: Record<string, string>
  cols: number
  rows: number
}

export interface HostConnectRequest {
  hostId: string
  cols: number
  rows: number
  /** One-off password when none is stored for the host. Not persisted. */
  password?: string
  /** Passphrase for an encrypted key, typed by the user. */
  passphrase?: string
  rememberPassphrase?: boolean
}

export interface HostKeyPrompt {
  requestId: string
  sessionId: string
  host: string
  port: number
  algorithm: string
  /** SHA256 fingerprint, OpenSSH style: "SHA256:base64" */
  fingerprint: string
  /** new = never seen; changed = differs from the stored key (possible MITM). */
  kind: 'new' | 'changed'
  previous?: { algorithm: string; fingerprint: string; addedAt: number }
}

export type SessionStatus = 'connecting' | 'ready' | 'closed' | 'error'

export interface SessionEvent {
  sessionId: string
  status: SessionStatus
  message?: string
}

export const IPC = {
  sshConnect: 'ssh:connect',
  sshWrite: 'ssh:write',
  sshResize: 'ssh:resize',
  sshDisconnect: 'ssh:disconnect',
  sshData: 'ssh:data',
  sshStatus: 'ssh:status',
  hostKeyPrompt: 'ssh:hostkey-prompt',
  hostKeyAnswer: 'ssh:hostkey-answer',
  appInfo: 'app:info',
  sshConnectHost: 'ssh:connect-host',
  vaultSnapshot: 'vault:snapshot',
  vaultSaveHost: 'vault:save-host',
  vaultDeleteHost: 'vault:delete-host',
  vaultSaveGroup: 'vault:save-group',
  vaultDeleteGroup: 'vault:delete-group',
  vaultImportHosts: 'vault:import-hosts',
  keysImportFiles: 'keys:import-files',
  keysImportFolder: 'keys:import-folder',
  keysImportText: 'keys:import-text',
  keysGenerate: 'keys:generate',
  keysRename: 'keys:rename',
  keysDelete: 'keys:delete',
  keysForgetPassphrase: 'keys:forget-passphrase',
  keysPublic: 'keys:public',
  identitySave: 'identity:save',
  identityDelete: 'identity:delete',
  integrationSave: 'integration:save',
  integrationDelete: 'integration:delete',
  integrationSync: 'integration:sync',
  sftpOpen: 'sftp:open',
  sftpClose: 'sftp:close',
  sftpList: 'sftp:list',
  sftpMkdir: 'sftp:mkdir',
  sftpRename: 'sftp:rename',
  sftpChmod: 'sftp:chmod',
  sftpRemove: 'sftp:remove',
  sftpUpload: 'sftp:upload',
  sftpDownload: 'sftp:download',
  sftpCancel: 'sftp:cancel',
  sftpTransfer: 'sftp:transfer',
  sftpClosed: 'sftp:closed',
  localHome: 'local:home',
  localRoots: 'local:roots',
  localList: 'local:list',
  localMkdir: 'local:mkdir',
  localRename: 'local:rename',
  localTrash: 'local:trash',
  localOpen: 'local:open',
  snippetSave: 'snippet:save',
  snippetDelete: 'snippet:delete',
  snippetRecord: 'snippet:record',
  snippetRuns: 'snippet:runs',
  knownForget: 'known:forget',
  knownImport: 'known:import',
  forwardSave: 'forward:save',
  forwardDelete: 'forward:delete',
  forwardStart: 'forward:start',
  forwardStop: 'forward:stop',
  forwardStatuses: 'forward:statuses',
  forwardStatus: 'forward:status'
} as const

export interface AppInfo {
  name: string
  version: string
  platform: string
}

/** API exposed on window.api by the preload script. */
export interface VpsApi {
  appInfo(): Promise<AppInfo>
  ssh: {
    connect(req: ConnectRequest): Promise<string>
    connectHost(req: HostConnectRequest): Promise<string>
    write(sessionId: string, data: string): void
    resize(sessionId: string, cols: number, rows: number): void
    disconnect(sessionId: string): void
    onData(cb: (sessionId: string, data: string) => void): () => void
    onStatus(cb: (ev: SessionEvent) => void): () => void
    onHostKeyPrompt(cb: (p: HostKeyPrompt) => void): () => void
    answerHostKey(requestId: string, accept: boolean): void
  }
  vault: {
    snapshot(): Promise<VaultSnapshot>
    saveHost(host: HostInput, password: PasswordChange): Promise<Host>
    deleteHost(id: string): Promise<void>
    saveGroup(group: GroupInput): Promise<Group>
    deleteGroup(id: string): Promise<void>
    /** Opens a file picker in main; resolves null when cancelled. */
    importHosts(): Promise<{ added: number; skipped: number; errors: string[] } | null>
  }
  keys: {
    /** File / folder pickers run in main; null when cancelled. */
    importFiles(): Promise<KeyImportResult | null>
    importFolder(): Promise<KeyImportResult | null>
    importText(label: string, privateKey: string): Promise<SshKey | null>
    generate(opts: { label: string; type: 'ed25519' | 'rsa'; bits?: number; passphrase?: string; rememberPassphrase?: boolean }): Promise<SshKey>
    rename(id: string, label: string): Promise<void>
    delete(id: string): Promise<void>
    forgetPassphrase(id: string): Promise<void>
    /** OpenSSH public key line (not secret). */
    publicKey(id: string): Promise<string>
  }
  identities: {
    save(input: IdentityInput, password: PasswordChange): Promise<Identity>
    delete(id: string): Promise<void>
  }
  sftp: {
    open(hostId: string, o?: { password?: string; passphrase?: string; rememberPassphrase?: boolean }): Promise<{ id: string; home: string }>
    close(id: string): void
    list(id: string, path: string): Promise<Listing>
    mkdir(id: string, path: string): Promise<void>
    rename(id: string, from: string, to: string): Promise<void>
    chmod(id: string, path: string, mode: number): Promise<void>
    remove(id: string, path: string): Promise<void>
    upload(id: string, localPaths: string[], remoteDir: string): Promise<string>
    download(id: string, remotePaths: string[], localDir: string): Promise<string>
    cancel(transferId: string): void
    onTransfer(cb: (ev: TransferEvent) => void): () => void
    onClosed(cb: (id: string) => void): () => void
  }
  local: {
    home(): Promise<string>
    roots(): Promise<string[]>
    list(path: string): Promise<Listing>
    mkdir(path: string): Promise<void>
    rename(from: string, to: string): Promise<void>
    /** Moves to the OS recycle bin. */
    trash(path: string): Promise<void>
    /** Opens with the default app. */
    open(path: string): Promise<void>
    /** Absolute path of a file dropped from the OS (Electron webUtils). */
    pathForFile(file: File): string
  }
  snippets: {
    save(s: { id?: string; label: string; command: string; tags: string[] }): Promise<Snippet>
    delete(id: string): Promise<void>
    /** Remembers that a snippet was sent to a host (history panel). */
    record(snippetId: string | null, hostId: string | null, command: string): void
    runs(hostId: string | null): Promise<SnippetRun[]>
  }
  knownHosts: {
    forget(host: string, port: number, algorithm?: string): Promise<void>
    /** Imports an OpenSSH known_hosts file chosen in a dialog; null when cancelled. */
    import(): Promise<{ added: number; skipped: number } | null>
  }
  forwards: {
    save(rule: ForwardRuleInput): Promise<ForwardRule>
    delete(id: string): Promise<void>
    start(id: string): Promise<void>
    stop(id: string): Promise<void>
    statuses(): Promise<TunnelStatus[]>
    onStatus(cb: (s: TunnelStatus) => void): () => void
  }
  integrations: {
    save(input: IntegrationInput, secret?: string): Promise<Integration>
    delete(id: string): Promise<void>
    sync(id: string): Promise<SyncResult>
  }
}
