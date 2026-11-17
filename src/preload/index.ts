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
    connectHost: (req) => ipcRenderer.invoke(IPC.sshConnectHost, req),
    write: (id, data) => ipcRenderer.send(IPC.sshWrite, id, data),
    resize: (id, cols, rows) => ipcRenderer.send(IPC.sshResize, id, cols, rows),
    disconnect: (id) => ipcRenderer.send(IPC.sshDisconnect, id),
    onData: (cb) => subscribe<[string, string]>(IPC.sshData, cb),
    onStatus: (cb) => subscribe<[SessionEvent]>(IPC.sshStatus, cb),
    onHostKeyPrompt: (cb) => subscribe<[HostKeyPrompt]>(IPC.hostKeyPrompt, cb),
    answerHostKey: (requestId, accept) => ipcRenderer.send(IPC.hostKeyAnswer, requestId, accept)
  },
  vault: {
    snapshot: () => ipcRenderer.invoke(IPC.vaultSnapshot),
    saveHost: (host, password) => ipcRenderer.invoke(IPC.vaultSaveHost, host, password),
    deleteHost: (id) => ipcRenderer.invoke(IPC.vaultDeleteHost, id),
    saveGroup: (group) => ipcRenderer.invoke(IPC.vaultSaveGroup, group),
    deleteGroup: (id) => ipcRenderer.invoke(IPC.vaultDeleteGroup, id),
    importHosts: () => ipcRenderer.invoke(IPC.vaultImportHosts)
  },
  keys: {
    importFiles: () => ipcRenderer.invoke(IPC.keysImportFiles),
    importFolder: () => ipcRenderer.invoke(IPC.keysImportFolder),
    importText: (label, text) => ipcRenderer.invoke(IPC.keysImportText, label, text),
    generate: (opts) => ipcRenderer.invoke(IPC.keysGenerate, opts),
    rename: (id, label) => ipcRenderer.invoke(IPC.keysRename, id, label),
    delete: (id) => ipcRenderer.invoke(IPC.keysDelete, id),
    forgetPassphrase: (id) => ipcRenderer.invoke(IPC.keysForgetPassphrase, id),
    publicKey: (id) => ipcRenderer.invoke(IPC.keysPublic, id)
  },
  identities: {
    save: (input, password) => ipcRenderer.invoke(IPC.identitySave, input, password),
    delete: (id) => ipcRenderer.invoke(IPC.identityDelete, id)
  },
  integrations: {
    save: (input, secret) => ipcRenderer.invoke(IPC.integrationSave, input, secret),
    delete: (id) => ipcRenderer.invoke(IPC.integrationDelete, id),
    sync: (id) => ipcRenderer.invoke(IPC.integrationSync, id)
  }
}

contextBridge.exposeInMainWorld('api', api)
