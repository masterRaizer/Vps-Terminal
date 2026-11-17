import { create } from 'zustand'
import type { SessionStatus } from '@shared/ipc'

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

export type ThemeName = 'harbor' | 'ember'

interface SessionsState {
  tabs: Tab[]
  activeId?: string
  theme: ThemeName
  openTab(params: ConnectParams, password: string): void
  closeTab(id: string): void
  activate(id: string): void
  patchTab(id: string, patch: Partial<Tab>): void
  takePassword(id: string): string | undefined
  reconnect(id: string, password: string): void
  setTheme(t: ThemeName): void
}

const savedTheme = ((): ThemeName => {
  try {
    return localStorage.getItem('theme') === 'ember' ? 'ember' : 'harbor'
  } catch {
    return 'harbor'
  }
})()

export const useSessions = create<SessionsState>((set, get) => ({
  tabs: [],
  activeId: undefined,
  theme: savedTheme,
  openTab: (params, password) => {
    const id = crypto.randomUUID()
    const tab: Tab = {
      id,
      title: `${params.username}@${params.host}`,
      params,
      status: 'idle',
      attempt: 1,
      pendingPassword: password
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: id }))
  },
  closeTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (tab?.sessionId) window.api.ssh.disconnect(tab.sessionId)
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      const activeId =
        s.activeId === id ? (tabs[Math.min(idx, tabs.length - 1)]?.id ?? undefined) : s.activeId
      return { tabs, activeId }
    })
  },
  activate: (id) => set({ activeId: id }),
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
  setTheme: (theme) => {
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* storage unavailable — theme just won't persist */
    }
    set({ theme })
  }
}))
