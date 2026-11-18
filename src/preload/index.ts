import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC, type HostKeyPrompt, type SessionEvent, type VpsApi } from '@shared/ipc'
import type { TransferEvent } from '@shared/files'
import type { TunnelStatus } from '@shared/vault'

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
  sftp: {
    open: (hostId, o) => ipcRenderer.invoke(IPC.sftpOpen, hostId, o ?? {}),
    close: (id) => ipcRenderer.send(IPC.sftpClose, id),
    list: (id, path) => ipcRenderer.invoke(IPC.sftpList, id, path),
    mkdir: (id, path) => ipcRenderer.invoke(IPC.sftpMkdir, id, path),
    rename: (id, a, b) => ipcRenderer.invoke(IPC.sftpRename, id, a, b),
    chmod: (id, path, mode) => ipcRenderer.invoke(IPC.sftpChmod, id, path, mode),
    remove: (id, path) => ipcRenderer.invoke(IPC.sftpRemove, id, path),
    upload: (id, locals, dir) => ipcRenderer.invoke(IPC.sftpUpload, id, locals, dir),
    download: (id, remotes, dir) => ipcRenderer.invoke(IPC.sftpDownload, id, remotes, dir),
    cancel: (tid) => ipcRenderer.send(IPC.sftpCancel, tid),
    onTransfer: (cb) => subscribe<[TransferEvent]>(IPC.sftpTransfer, cb),
    onClosed: (cb) => subscribe<[string]>(IPC.sftpClosed, cb)
  },
  local: {
    home: () => ipcRenderer.invoke(IPC.localHome),
    roots: () => ipcRenderer.invoke(IPC.localRoots),
    list: (path) => ipcRenderer.invoke(IPC.localList, path),
    mkdir: (path) => ipcRenderer.invoke(IPC.localMkdir, path),
    rename: (a, b) => ipcRenderer.invoke(IPC.localRename, a, b),
    trash: (path) => ipcRenderer.invoke(IPC.localTrash, path),
    open: (path) => ipcRenderer.invoke(IPC.localOpen, path),
    pathForFile: (file) => webUtils.getPathForFile(file)
  },
  snippets: {
    save: (sn) => ipcRenderer.invoke(IPC.snippetSave, sn),
    delete: (id) => ipcRenderer.invoke(IPC.snippetDelete, id),
    record: (sid, hid, cmd) => ipcRenderer.send(IPC.snippetRecord, sid, hid, cmd),
    runs: (hid) => ipcRenderer.invoke(IPC.snippetRuns, hid)
  },
  knownHosts: {
    forget: (host, port, alg) => ipcRenderer.invoke(IPC.knownForget, host, port, alg),
    import: () => ipcRenderer.invoke(IPC.knownImport)
  },
  forwards: {
    save: (r) => ipcRenderer.invoke(IPC.forwardSave, r),
    delete: (id) => ipcRenderer.invoke(IPC.forwardDelete, id),
    start: (id) => ipcRenderer.invoke(IPC.forwardStart, id),
    stop: (id) => ipcRenderer.invoke(IPC.forwardStop, id),
    statuses: () => ipcRenderer.invoke(IPC.forwardStatuses),
    onStatus: (cb) => subscribe<[TunnelStatus]>(IPC.forwardStatus, cb)
  },
  integrations: {
    save: (input, secret) => ipcRenderer.invoke(IPC.integrationSave, input, secret),
    delete: (id) => ipcRenderer.invoke(IPC.integrationDelete, id),
    sync: (id) => ipcRenderer.invoke(IPC.integrationSync, id)
  }
}

contextBridge.exposeInMainWorld('api', api)
