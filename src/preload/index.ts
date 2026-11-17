import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type HostKeyPrompt, type SessionEvent, type VpsApi } from '@shared/ipc'

function subscribe<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: VpsApi = {
  appInfo: () => ipcRenderer.invoke(IPC.appInfo),
  ssh: {
    connect: (req) => ipcRenderer.invoke(IPC.sshConnect, req),
    write: (id, data) => ipcRenderer.send(IPC.sshWrite, id, data),
    resize: (id, cols, rows) => ipcRenderer.send(IPC.sshResize, id, cols, rows),
    disconnect: (id) => ipcRenderer.send(IPC.sshDisconnect, id),
    onData: (cb) => subscribe<[string, string]>(IPC.sshData, cb),
    onStatus: (cb) => subscribe<[SessionEvent]>(IPC.sshStatus, cb),
    onHostKeyPrompt: (cb) => subscribe<[HostKeyPrompt]>(IPC.hostKeyPrompt, cb),
    answerHostKey: (requestId, accept) => ipcRenderer.send(IPC.hostKeyAnswer, requestId, accept)
  }
}

contextBridge.exposeInMainWorld('api', api)
