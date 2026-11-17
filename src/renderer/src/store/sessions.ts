import { create } from 'zustand'
import type { SessionStatus } from '@shared/ipc'
import { DEFAULT_TERM_THEME, termThemeById } from '@/lib/termThemes'

export interface ConnectParams {
  host: string
  port: number
  username: string
}

export interface Tab {
  id: string
  title: string
  params: ConnectParams
  sessionId?: string
  status: SessionStatus | 'idle'
  message?: string
  /** Bumped to ask the terminal view to (re)connect. */
  attempt: number
  /** One-shot password for the next connect; cleared as soon as it is sent to main. */
  pendingPassword?: string
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
  fontSize: number
  sidePanel: boolean
  navCollapsed: boolean
}

interface State extends Prefs {
  tabs: Tab[]
  activeId?: string
  view: View
  section: Section
  sideTab: SideTab
  logs: LogEntry[]
  /** Increments to ask the hosts page to focus its search/connect bar. */
  focusSearchTick: number

  openTab(params: ConnectParams, password: string): void
  closeTab(id: string): void
  activate(id: string): void
  patchTab(id: string, patch: Partial<Tab>): void
  takePassword(id: string): string | undefined
  reconnect(id: string, password: string): void
  showVault(section?: Section): void
  showSftp(): void
  newConnection(): void
  setSideTab(t: SideTab): void
  toggleSidePanel(): void
  toggleNav(): void
  setTermTheme(id: string): void
  setFontSize(n: number): void
  log(e: Omit<LogEntry, 'id' | 'at'>): void
}

const PREFS_KEY = 'vts.prefs'
const defaults: Prefs = { termTheme: DEFAULT_TERM_THEME, fontSize: 14, sidePanel: true, navCollapsed: false }

function loadPrefs(): Prefs {
  try {
    const p = { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') } as Prefs
    if (!termThemeById(p.termTheme)) p.termTheme = DEFAULT_TERM_THEME
    p.fontSize = Math.min(24, Math.max(10, Number(p.fontSize) || 14))
    return p
  } catch {
    return defaults
  }
}

function savePrefs(s: Prefs): void {
  try {
    const { termTheme, fontSize, sidePanel, navCollapsed } = s
    localStorage.setItem(PREFS_KEY, JSON.stringify({ termTheme, fontSize, sidePanel, navCollapsed }))
  } catch {
    /* storage unavailable — prefs just won't persist */
  }
}

export const useSessions = create<State>((set, get) => ({
  ...loadPrefs(),
  tabs: [],
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
      status: 'idle',
      attempt: 1,
      pendingPassword: password
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: id, view: 'term' }))
  },
  closeTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (tab?.sessionId) window.api.ssh.disconnect(tab.sessionId)
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      if (s.activeId !== id) return { tabs }
      const next = tabs[Math.min(idx, tabs.length - 1)]
      return { tabs, activeId: next?.id, view: s.view === 'term' && !next ? 'vault' : s.view }
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
  setFontSize: (n) => {
    set({ fontSize: Math.min(24, Math.max(10, n)) })
    savePrefs(get())
  },
  log: (e) =>
    set((s) => ({
      logs: [{ ...e, id: crypto.randomUUID(), at: Date.now() }, ...s.logs].slice(0, 500)
    }))
}))
