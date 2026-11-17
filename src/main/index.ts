import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { IPC, type AppInfo, type ConnectRequest, type HostKeyPrompt } from '@shared/ipc'
import { SshManager } from './ssh-manager'
import { validateConnectRequest } from './validate'

const APP_NAME = 'Vps Terminal SSH'
let mainWindow: BrowserWindow | null = null
const pendingHostKeys = new Map<string, (accept: boolean) => void>()

const ssh = new SshManager({
  onData: (sessionId, data) => mainWindow?.webContents.send(IPC.sshData, sessionId, data),
  onStatus: (ev) => mainWindow?.webContents.send(IPC.sshStatus, ev),
  verifyHostKey: (info) =>
    new Promise<boolean>((resolve) => {
      if (!mainWindow) return resolve(false)
      const requestId = crypto.randomUUID()
      pendingHostKeys.set(requestId, resolve)
      const prompt: HostKeyPrompt = { requestId, ...info }
      mainWindow.webContents.send(IPC.hostKeyPrompt, prompt)
    })
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 860,
    minHeight: 520,
    title: APP_NAME,
    backgroundColor: '#0b0e14',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'win32' ? 'hidden' : 'default',
    titleBarOverlay:
      process.platform === 'win32' ? { color: '#0b0e14', symbolColor: '#9aa4b8', height: 36 } : false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Never open new Electron windows; send http(s) links to the OS browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())

  mainWindow.on('closed', () => {
    mainWindow = null
    for (const resolve of pendingHostKeys.values()) resolve(false)
    pendingHostKeys.clear()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    name: APP_NAME,
    version: app.getVersion(),
    platform: process.platform
  }))

  ipcMain.handle(IPC.sshConnect, (_e, raw: unknown) => {
    const req: ConnectRequest = validateConnectRequest(raw)
    return ssh.connect(req)
  })
  ipcMain.on(IPC.sshWrite, (_e, id: unknown, data: unknown) => {
    if (typeof id === 'string' && typeof data === 'string') ssh.write(id, data)
  })
  ipcMain.on(IPC.sshResize, (_e, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof id === 'string' && Number.isInteger(cols) && Number.isInteger(rows)) {
      ssh.resize(id, cols as number, rows as number)
    }
  })
  ipcMain.on(IPC.sshDisconnect, (_e, id: unknown) => {
    if (typeof id === 'string') ssh.disconnect(id)
  })
  ipcMain.on(IPC.hostKeyAnswer, (_e, requestId: unknown, accept: unknown) => {
    if (typeof requestId !== 'string') return
    const resolve = pendingHostKeys.get(requestId)
    pendingHostKeys.delete(requestId)
    resolve?.(accept === true)
  })
}

app.setAppUserModelId('com.vpsterminal.ssh')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
  })

  void app.whenReady().then(() => {
    // Strict CSP for the packaged renderer (dev server needs HMR, so only in prod).
    if (app.isPackaged) {
      session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
        cb({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'"
            ]
          }
        })
      })
    }
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  ssh.disconnectAll()
  if (process.platform !== 'darwin') app.quit()
})
