import { create } from 'zustand'
import { askText } from '@/components/InputDialog'
import type { SessionStatus } from '@shared/ipc'
import { DEFAULT_TERM_FONT, DEFAULT_TERM_THEME, TERM_FONTS, termThemeById } from '@/lib/termThemes'

export interface ConnectParams {
  host: string
  port: number
  username: string
}

export interface Tab {
  id: string
  title: string
  params: ConnectParams
  /** Saved host this tab was opened from; main resolves its secrets. */
  hostId?: string
  /** Whether reconnecting needs the user to type a password again. */
  needsPassword: boolean
  /** Per-host terminal theme override. */
  termTheme?: string | null
  /** Send ^H instead of DEL for Backspace. */
  backspaceCtrlH?: boolean
  sessionId?: string
  status: SessionStatus | 'idle'
  message?: string
  /** Bumped to ask the terminal view to (re)connect. */
  attempt: number
  /** One-shot password for the next connect; cleared as soon as it is sent to main. */
  pendingPassword?: string
  /** One-shot key passphrase for the next connect. */
  pendingPassphrase?: string
  rememberPassphrase?: boolean
}

export type Section = 'hosts' | 'keychain' | 'forwarding' | 'snippets' | 'knownhosts' | 'logs'
export type View = 'vault' | 'sftp' | 'term'
export type SideTab = 'quick' | 'snippets' | 'history' | 'themes'

export interface LogEntry {
  id: string
  at: number
  target: string
  status: SessionStatus
  message?: string
}

interface Prefs {
  termTheme: string
  termFont: string
  fontSize: number
  sidePanel: boolean
  navCollapsed: boolean
}

export interface SplitLayout {
  id: string
  dir: 'row' | 'col'
  tabIds: string[]
}

interface State extends Prefs {
  tabs: Tab[]
  layouts: SplitLayout[]
  activeId?: string
  view: View
  section: Section
  sideTab: SideTab
  logs: LogEntry[]
  /** Increments to ask the hosts page to focus its search/connect bar. */
  focusSearchTick: number

  openTab(params: ConnectParams, password: string): void
  /** Splits the active tab: a new session to the same host opens beside (row) or below (col). */
  split(dir: 'row' | 'col'): Promise<void>
  openHostTab(
    host: { id: string; label: string; address: string; port: number; username: string; options?: { termTheme: string | null; backspace: string } },
    needsPassword: boolean,
    password?: string
  ): void
  closeTab(id: string): void
  activate(id: string): void
  patchTab(id: string, patch: Partial<Tab>): void
  takePassword(id: string): string | undefined
  reconnect(id: string, password?: string): void
  retryWithPassphrase(id: string, passphrase: string, remember: boolean): void
  showVault(section?: Section): void
  showSftp(): void
  newConnection(): void
  setSideTab(t: SideTab): void
  toggleSidePanel(): void
  toggleNav(): void
  setTermTheme(id: string): void
  setFontSize(n: number): void
  setTermFont(id: string): void
  log(e: Omit<LogEntry, 'id' | 'at'>): void
}

const PREFS_KEY = 'vts.prefs'
const defaults: Prefs = { termTheme: DEFAULT_TERM_THEME, termFont: DEFAULT_TERM_FONT, fontSize: 14, sidePanel: true, navCollapsed: false }

function loadPrefs(): Prefs {
  try {
    const p = { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') } as Prefs
    if (!termThemeById(p.termTheme)) p.termTheme = DEFAULT_TERM_THEME
    if (!TERM_FONTS.some((f) => f.id === p.termFont)) p.termFont = DEFAULT_TERM_FONT
    p.fontSize = Math.min(24, Math.max(10, Number(p.fontSize) || 14))
    return p
  } catch {
    return defaults
  }
}

function savePrefs(s: Prefs): void {
  try {
    const { termTheme, termFont, fontSize, sidePanel, navCollapsed } = s
    localStorage.setItem(PREFS_KEY, JSON.stringify({ termTheme, termFont, fontSize, sidePanel, navCollapsed }))
  } catch {
    /* storage unavailable — prefs just won't persist */
  }
}

export const useSessions = create<State>((set, get) => ({
  ...loadPrefs(),
  tabs: [],
  layouts: [],
  activeId: undefined,
  view: 'vault',
  section: 'hosts',
  sideTab: 'quick',
  logs: [],
  focusSearchTick: 0,

  openTab: (params, password) => {
    const id = crypto.randomUUID()
    const tab: Tab = {
      id,
      title: params.host,
      params,
      needsPassword: true,
      status: 'idle',
      attempt: 1,
      pendingPassword: password
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: id, view: 'term' }))
  },
  openHostTab: (host, needsPassword, password) => {
    const id = crypto.randomUUID()
    const tab: Tab = {
      id,
      title: host.label,
      params: { host: host.address, port: host.port, username: host.username },
      hostId: host.id,
      needsPassword,
      termTheme: host.options?.termTheme ?? null,
      backspaceCtrlH: host.options?.backspace === 'ctrl-h',
      status: 'idle',
      attempt: 1,
      pendingPassword: password
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: id, view: 'term' }))
  },
  split: async (dir) => {
    const src = get().tabs.find((t) => t.id === get().activeId)
    if (!src) return
    if (get().layouts.find((l) => l.tabIds.includes(src.id))?.tabIds.length === 4) return
    // The first session's password is never kept, so a new pane has to ask for it.
    let pendingPassword: string | undefined
    if (src.needsPassword) {
      const pw = await askText({ title: `Пароль для ${src.title}`, label: 'Новая панель открывает отдельную SSH-сессию.', password: true, okText: 'Открыть панель' })
      if (pw === null) return
      pendingPassword = pw
    }
    const s = get()
    const layout = s.layouts.find((l) => l.tabIds.includes(src.id))
    if (layout && layout.tabIds.length >= 4) return
    const id = crypto.randomUUID()
    const tab: Tab = {
      id,
      title: src.title,
      params: src.params,
      hostId: src.hostId,
      needsPassword: src.needsPassword,
      termTheme: src.termTheme,
      backspaceCtrlH: src.backspaceCtrlH,
      status: 'idle',
      attempt: 1,
      pendingPassword
    }
    const tabs = [...s.tabs]
    tabs.splice(tabs.findIndex((t) => t.id === src.id) + 1, 0, tab)
    const layouts = layout
      ? s.layouts.map((l) => (l === layout ? { ...l, dir, tabIds: [...l.tabIds.slice(0, l.tabIds.indexOf(src.id) + 1), id, ...l.tabIds.slice(l.tabIds.indexOf(src.id) + 1)] } : l))
      : [...s.layouts, { id: crypto.randomUUID(), dir, tabIds: [src.id, id] }]
    set({ tabs, layouts, activeId: id, view: 'term' })
  },
  closeTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (tab?.sessionId) window.api.ssh.disconnect(tab.sessionId)
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      const oldLayout = s.layouts.find((l) => l.tabIds.includes(id))
      const layouts = s.layouts.map((l) => ({ ...l, tabIds: l.tabIds.filter((t) => t !== id) })).filter((l) => l.tabIds.length > 1)
      if (s.activeId !== id) return { tabs, layouts }
      // Prefer a remaining pane of the same split, then the neighbouring tab.
      const paneMate = oldLayout?.tabIds.find((t) => t !== id)
      const next = paneMate ?? tabs[Math.min(idx, tabs.length - 1)]?.id
      return { tabs, layouts, activeId: next, view: s.view === 'term' && !next ? 'vault' : s.view }
    })
  },
  activate: (id) => set({ activeId: id, view: 'term' }),
  patchTab: (id, patch) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  takePassword: (id) => {
    const pwd = get().tabs.find((t) => t.id === id)?.pendingPassword
    get().patchTab(id, { pendingPassword: undefined })
    return pwd
  },
  reconnect: (id, password) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab) return
    if (tab.sessionId) window.api.ssh.disconnect(tab.sessionId)
    get().patchTab(id, {
      pendingPassword: password,
      attempt: tab.attempt + 1,
      sessionId: undefined,
      status: 'idle',
      message: undefined
    })
  },
  retryWithPassphrase: (id, passphrase, remember) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab) return
    get().patchTab(id, { pendingPassphrase: passphrase, rememberPassphrase: remember, attempt: tab.attempt + 1, sessionId: undefined, status: 'idle', message: undefined })
  },
  showVault: (section) => set((s) => ({ view: 'vault', section: section ?? s.section })),
  showSftp: () => set({ view: 'sftp' }),
  newConnection: () =>
    set((s) => ({ view: 'vault', section: 'hosts', focusSearchTick: s.focusSearchTick + 1 })),
  setSideTab: (sideTab) => {
    set({ sideTab, sidePanel: true })
    savePrefs(get())
  },
  toggleSidePanel: () => {
    set((s) => ({ sidePanel: !s.sidePanel }))
    savePrefs(get())
  },
  toggleNav: () => {
    set((s) => ({ navCollapsed: !s.navCollapsed }))
    savePrefs(get())
  },
  setTermTheme: (termTheme) => {
    set({ termTheme })
    savePrefs(get())
  },
  setTermFont: (termFont) => {
    set({ termFont })
    savePrefs(get())
  },
  setFontSize: (n) => {
    set({ fontSize: Math.min(24, Math.max(10, n)) })
    savePrefs(get())
  },
  log: (e) =>
    set((s) => ({
      logs: [{ ...e, id: crypto.randomUUID(), at: Date.now() }, ...s.logs].slice(0, 500)
    }))
}))
