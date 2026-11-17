import { useEffect } from 'react'
import { useSessions } from '@/store/sessions'
import { useVault } from '@/store/vault'
import { PasswordPrompt } from './components/PasswordPrompt'
import { PassphrasePrompt } from './components/PassphrasePrompt'
import { InputDialog } from './components/InputDialog'
import { ChmodDialog } from './components/files/ChmodDialog'
import { TopBar } from './components/TopBar'
import { NavSidebar } from './components/NavSidebar'
import { TerminalView } from './components/TerminalView'
import { TermSidePanel } from './components/TermSidePanel'
import { HostKeyDialog } from './components/HostKeyDialog'
import { StatusBar } from './components/StatusBar'
import { HostsPage } from './pages/HostsPage'
import { ForwardingPage, KnownHostsPage, LogsPage, SnippetsPage } from './pages/SectionPages'
import { KeychainPage } from './pages/KeychainPage'
import { SftpPage } from './pages/SftpPage'

const PAGES = {
  hosts: HostsPage,
  keychain: KeychainPage,
  forwarding: ForwardingPage,
  snippets: SnippetsPage,
  knownhosts: KnownHostsPage,
  logs: LogsPage
}

export function App() {
  const { tabs, activeId, view, section, sidePanel, workspaces } = useSessions()
  const activeWs = workspaces.find((w) => activeId && w.paneIds.includes(activeId))
  const activeLayout = activeWs && activeWs.paneIds.length > 1 ? { dir: activeWs.dir, tabIds: activeWs.paneIds } : undefined
  const rectOf = (tabId: string): { left: string; top: string; width: string; height: string } | null => {
    if (view !== 'term') return null
    if (activeLayout?.tabIds.includes(tabId)) {
      const n = activeLayout.tabIds.length
      const i = activeLayout.tabIds.indexOf(tabId)
      const size = `${100 / n}%`
      const pos = `${(100 / n) * i}%`
      return activeLayout.dir === 'row' ? { left: pos, top: '0', width: size, height: '100%' } : { left: '0', top: pos, width: '100%', height: size }
    }
    return tabId === activeId ? { left: '0', top: '0', width: '100%', height: '100%' } : null
  }
  const Page = PAGES[section]
  useEffect(() => {
    void useVault.getState().load()
  }, [])
  return (
    <div className="app">
      <TopBar />
      <div className="content">
        {view === 'vault' && (
          <div className="vault">
            <NavSidebar />
            <Page />
          </div>
        )}
        <div className="sftp-host" style={{ display: view === 'sftp' ? 'flex' : 'none' }}>
          <SftpPage />
        </div>
        {/* Terminals stay mounted while other views are shown. */}
        <div className="term-area" style={{ display: view === 'term' ? 'flex' : 'none' }}>
          <div className="term-stack">
            {tabs.map((t) => (
              <TerminalView key={t.id} tab={t} active={view === 'term' && t.id === activeId} rect={rectOf(t.id)} inSplit={Boolean(activeLayout?.tabIds.includes(t.id))} />
            ))}
          </div>
          {sidePanel && <TermSidePanel />}
        </div>
      </div>
      <StatusBar />
      <HostKeyDialog />
      <PasswordPrompt />
      <PassphrasePrompt />
      <ChmodDialog />
      <InputDialog />
    </div>
  )
}
