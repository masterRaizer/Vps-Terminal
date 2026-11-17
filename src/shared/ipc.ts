/** IPC contract shared by main, preload and renderer. */

export interface ConnectRequest {
  host: string
  port: number
  username: string
  /** Sent once to main for the handshake; never stored by main or renderer. */
  password?: string
  cols: number
  rows: number
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
  appInfo: 'app:info'
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
    write(sessionId: string, data: string): void
    resize(sessionId: string, cols: number, rows: number): void
    disconnect(sessionId: string): void
    onData(cb: (sessionId: string, data: string) => void): () => void
    onStatus(cb: (ev: SessionEvent) => void): () => void
    onHostKeyPrompt(cb: (p: HostKeyPrompt) => void): () => void
    answerHostKey(requestId: string, accept: boolean): void
  }
}
