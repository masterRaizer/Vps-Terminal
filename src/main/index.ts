import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import { IPC, type AppInfo, type ConnectRequest, type HostKeyPrompt } from '@shared/ipc'
import { SshManager } from './ssh-manager'
import { validateConnectRequest, validateGeometry } from './validate'
import { openDb } from './db'
import { createSecretStore } from './secrets'
import { VaultRepo } from './vault-repo'
import { VaultService } from './vault-service'
import { importHosts } from './import-hosts'
import { CatalogRepo } from './catalog-repo'
import { DataKeyCipher } from './key-crypto'
import { KeyService } from './key-service'
import { GeoIp } from './geoip'
import { RemnawaveSync } from './remnawave'
import { SftpManager } from './sftp-manager'
import { localHome, localList, localMkdir, localPath, localRename, localRoots } from './local-fs'

const APP_NAME = 'Vps Terminal SSH'
let mainWindow: BrowserWindow | null = null
let vault: VaultService
let keys: KeyService
let catalog: CatalogRepo
let remnawave: RemnawaveSync

const str = (v: unknown, name: string, max = 512): string => {
  if (typeof v !== 'string' || v.length > max) throw new Error(`Неверное поле: ${name}`)
  return v
}
const pendingHostKeys = new Map<string, (accept: boolean) => void>()

// Fingerprints the user trusted during this run (persistent known_hosts arrive in step 4).
const trustedThisRun = new Map<string, string>()

const askHostKey = (info: Omit<HostKeyPrompt, 'requestId'>): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const id = `${info.host}:${info.port}`
    if (trustedThisRun.get(id) === info.fingerprint) return resolve(true)
    if (!mainWindow) return resolve(false)
    const requestId = crypto.randomUUID()
    pendingHostKeys.set(requestId, (ok) => {
      if (ok) trustedThisRun.set(id, info.fingerprint)
      resolve(ok)
    })
    const prompt: HostKeyPrompt = { requestId, ...info }
    mainWindow.webContents.send(IPC.hostKeyPrompt, prompt)
  })

const ssh = new SshManager({
  onData: (sessionId, data) => mainWindow?.webContents.send(IPC.sshData, sessionId, data),
  onStatus: (ev) => mainWindow?.webContents.send(IPC.sshStatus, ev),
  verifyHostKey: askHostKey
})

const sftp = new SftpManager(
  askHostKey,
  (ev) => mainWindow?.webContents.send(IPC.sftpTransfer, ev),
  (id) => mainWindow?.webContents.send(IPC.sftpClosed, id)
)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 860,
    minHeight: 520,
    title: APP_NAME,
    backgroundColor: '#151a2b',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'win32' ? 'hidden' : 'default',
    titleBarOverlay:
      process.platform === 'win32' ? { color: '#151a2b', symbolColor: '#c5cad8', height: 52 } : false,
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
  ipcMain.handle(IPC.sshConnectHost, async (_e, raw: unknown) => {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    if (typeof r.hostId !== 'string') throw new Error('Неверный id хоста')
    if (r.password !== undefined && typeof r.password !== 'string') throw new Error('Неверный пароль')
    if (r.passphrase !== undefined && typeof r.passphrase !== 'string') throw new Error('Неверная парольная фраза')
    const c = await vault.resolveForConnect(r.hostId, {
      password: r.password as string | undefined,
      passphrase: r.passphrase as string | undefined,
      rememberPassphrase: r.rememberPassphrase === true
    })
    vault.markConnected(c.host.id)
    return ssh.connect({
      host: c.host.address,
      port: c.host.port,
      username: c.username,
      password: c.password ?? undefined,
      privateKey: c.privateKey,
      passphrase: c.passphrase,
      agent: c.agent,
      agentForward: c.host.options.agentForward,
      env: c.host.options.env,
      ...validateGeometry(r)
    })
  })

  ipcMain.handle(IPC.sftpOpen, async (_e, hostId: unknown, raw: unknown) => {
    const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const c = await vault.resolveForConnect(str(hostId, 'id', 64), {
      password: typeof o.password === 'string' ? o.password : undefined,
      passphrase: typeof o.passphrase === 'string' ? o.passphrase : undefined,
      rememberPassphrase: o.rememberPassphrase === true
    })
    return sftp.open({ host: c.host.address, port: c.host.port, username: c.username, password: c.password ?? undefined, privateKey: c.privateKey, passphrase: c.passphrase, agent: c.agent })
  })
  ipcMain.on(IPC.sftpClose, (_e, id: unknown) => typeof id === 'string' && sftp.close(id))
  ipcMain.handle(IPC.sftpList, (_e, id: unknown, path: unknown) => sftp.list(str(id, 'id', 64), path))
  ipcMain.handle(IPC.sftpMkdir, (_e, id: unknown, path: unknown) => sftp.mkdir(str(id, 'id', 64), path))
  ipcMain.handle(IPC.sftpRename, (_e, id: unknown, a: unknown, b: unknown) => sftp.rename(str(id, 'id', 64), a, b))
  ipcMain.handle(IPC.sftpChmod, (_e, id: unknown, path: unknown, mode: unknown) => sftp.chmod(str(id, 'id', 64), path, mode))
  ipcMain.handle(IPC.sftpRemove, (_e, id: unknown, path: unknown) => sftp.remove(str(id, 'id', 64), path))
  ipcMain.handle(IPC.sftpUpload, (_e, id: unknown, locals: unknown, dir: unknown) => {
    if (!Array.isArray(locals) || locals.length > 1000) throw new Error('Неверный список файлов')
    return sftp.upload(str(id, 'id', 64), locals.map(localPath), dir)
  })
  ipcMain.handle(IPC.sftpDownload, (_e, id: unknown, remotes: unknown, dir: unknown) => {
    if (!Array.isArray(remotes) || remotes.length > 1000) throw new Error('Неверный список файлов')
    return sftp.download(str(id, 'id', 64), remotes, localPath(dir))
  })
  ipcMain.on(IPC.sftpCancel, (_e, tid: unknown) => typeof tid === 'string' && sftp.cancel(tid))
  ipcMain.handle(IPC.localHome, () => localHome())
  ipcMain.handle(IPC.localRoots, () => localRoots())
  ipcMain.handle(IPC.localList, (_e, path: unknown) => localList(path))
  ipcMain.handle(IPC.localMkdir, (_e, path: unknown) => localMkdir(path))
  ipcMain.handle(IPC.localRename, (_e, a: unknown, b: unknown) => localRename(a, b))
  ipcMain.handle(IPC.localTrash, (_e, path: unknown) => shell.trashItem(localPath(path)))
  ipcMain.handle(IPC.localOpen, async (_e, path: unknown) => {
    const target = localPath(path)
    // Opening is for documents; never launch programs or scripts from the file manager.
    if (/\.(exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|scr|lnk|hta|cpl|reg|jar|appref-ms)$/i.test(target)) {
      throw new Error('Исполняемые файлы из файлового менеджера не запускаются')
    }
    const err = await shell.openPath(target)
    if (err) throw new Error(err)
  })

  ipcMain.handle(IPC.vaultSnapshot, () => vault.snapshot())
  ipcMain.handle(IPC.vaultSaveHost, (_e, host: unknown, password: unknown) => vault.saveHost(host, password))
  ipcMain.handle(IPC.vaultDeleteHost, (_e, id: unknown) => vault.deleteHost(id))
  ipcMain.handle(IPC.vaultSaveGroup, (_e, group: unknown) => vault.saveGroup(group))
  ipcMain.handle(IPC.vaultDeleteGroup, (_e, id: unknown) => vault.deleteGroup(id))
  ipcMain.handle(IPC.vaultImportHosts, async () => {
    if (!mainWindow) return null
    const pick = await dialog.showOpenDialog(mainWindow, {
      title: 'Импорт хостов',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (pick.canceled || !pick.filePaths[0]) return null
    const file = pick.filePaths[0]
    if ((await stat(file)).size > 5 * 1024 * 1024) throw new Error('Файл больше 5 МБ')
    let data: unknown
    try {
      data = JSON.parse((await readFile(file, 'utf-8')).replace(/^\uFEFF/, ''))
    } catch {
      throw new Error('Файл не является корректным JSON')
    }
    const res = await importHosts(data, vault)
    await vault.backfillCountries()
    return res
  })

  ipcMain.handle(IPC.keysImportFiles, async () => {
    if (!mainWindow) return null
    const pick = await dialog.showOpenDialog(mainWindow, { title: 'Импорт ключей', properties: ['openFile', 'multiSelections', 'showHiddenFiles'] })
    return pick.canceled ? null : keys.importFiles(pick.filePaths)
  })
  ipcMain.handle(IPC.keysImportFolder, async () => {
    if (!mainWindow) return null
    const pick = await dialog.showOpenDialog(mainWindow, { title: 'Папка с ключами', properties: ['openDirectory', 'showHiddenFiles'] })
    return pick.canceled || !pick.filePaths[0] ? null : keys.importFolder(pick.filePaths[0])
  })
  ipcMain.handle(IPC.keysImportText, (_e, label: unknown, text: unknown) => keys.addKey(str(label, 'название', 120), str(text, 'ключ', 64 * 1024)))
  ipcMain.handle(IPC.keysGenerate, (_e, raw: unknown) => {
    const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    return keys.generate({
      label: str(o.label ?? '', 'название', 120),
      type: o.type === 'rsa' ? 'rsa' : 'ed25519',
      bits: o.bits === undefined ? undefined : Number(o.bits),
      passphrase: o.passphrase ? str(o.passphrase, 'фраза', 1024) : undefined,
      rememberPassphrase: o.rememberPassphrase === true
    })
  })
  ipcMain.handle(IPC.keysRename, (_e, id: unknown, label: unknown) => {
    const l = str(label, 'название', 120).trim()
    if (!l) throw new Error('Название не может быть пустым')
    catalog.renameKey(str(id, 'id', 64), l)
  })
  ipcMain.handle(IPC.keysDelete, (_e, id: unknown) => keys.deleteKey(str(id, 'id', 64)))
  ipcMain.handle(IPC.keysForgetPassphrase, (_e, id: unknown) => keys.forgetPassphrase(str(id, 'id', 64)))
  ipcMain.handle(IPC.keysPublic, (_e, id: unknown) => keys.publicKeyOf(str(id, 'id', 64)))
  ipcMain.handle(IPC.identitySave, (_e, input: unknown, password: unknown) => {
    if (password !== undefined && password !== null && typeof password !== 'string') throw new Error('Неверный пароль')
    const i = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
    return keys.saveIdentity(
      {
        id: typeof i.id === 'string' ? i.id : undefined,
        label: typeof i.label === 'string' ? i.label : '',
        username: typeof i.username === 'string' ? i.username : '',
        keyId: typeof i.keyId === 'string' && i.keyId ? i.keyId : null
      },
      password as string | null | undefined
    )
  })
  ipcMain.handle(IPC.identityDelete, (_e, id: unknown) => keys.deleteIdentity(str(id, 'id', 64)))
  ipcMain.handle(IPC.integrationSave, (_e, input: unknown, secret: unknown) => remnawave.save(input, secret))
  ipcMain.handle(IPC.integrationDelete, (_e, id: unknown) => remnawave.remove(str(id, 'id', 64)))
  ipcMain.handle(IPC.integrationSync, (_e, id: unknown) => remnawave.sync(str(id, 'id', 64)))

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
// Isolated profile for automated tests of the unpackaged app.
if (!app.isPackaged && process.env['VTS_USER_DATA']) app.setPath('userData', process.env['VTS_USER_DATA'])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
  })

  void app.whenReady().then(async () => {
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
    const db = openDb(join(app.getPath('userData'), 'vault.db'))
    const secrets = createSecretStore()
    const repo = new VaultRepo(db)
    catalog = new CatalogRepo(db)
    const geoDir = app.isPackaged
      ? join(process.resourcesPath, 'geoip')
      : [join(app.getAppPath(), 'resources', 'geoip'), join(__dirname, '..', '..', 'resources', 'geoip')].find((d) => existsSync(join(d, 'country-v4.bin'))) ?? ''
    const geo = new GeoIp(geoDir)
    keys = new KeyService(catalog, repo, new DataKeyCipher(secrets), secrets)
    vault = new VaultService(repo, secrets, { catalog, keys, geo })
    remnawave = new RemnawaveSync(catalog, repo, secrets, geo)
    await vault.backfillCountries().catch((e) => console.warn('GeoIP backfill failed:', e))
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  ssh.disconnectAll()
  sftp.closeAll()
  if (process.platform !== 'darwin') app.quit()
})
