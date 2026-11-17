/** IPC contract shared by main, preload and renderer. */
import type { Group, GroupInput, Host, HostInput, PasswordChange, VaultSnapshot } from './vault'

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
}

export interface HostKeyPrompt {
  requestId: string
  sessionId: string
  host: string
  port: number
  algorithm: string
  /** SHA256 fingerprint, OpenSSH style: "SHA256:base64" */
  fingerprint: string
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
  vaultImportHosts: 'vault:import-hosts'
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
}
