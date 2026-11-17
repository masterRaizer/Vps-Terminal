import { useSessions } from '@/store/sessions'
import { TopBar } from './components/TopBar'
import { NavSidebar } from './components/NavSidebar'
import { TerminalView } from './components/TerminalView'
import { TermSidePanel } from './components/TermSidePanel'
import { HostKeyDialog } from './components/HostKeyDialog'
import { StatusBar } from './components/StatusBar'
import { HostsPage } from './pages/HostsPage'
import { ForwardingPage, KeychainPage, KnownHostsPage, LogsPage, SnippetsPage } from './pages/SectionPages'
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
  const { tabs, activeId, view, section, sidePanel } = useSessions()
  const Page = PAGES[section]
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
        {view === 'sftp' && <SftpPage />}
        {/* Terminals stay mounted while other views are shown. */}
        <div className="term-area" style={{ display: view === 'term' ? 'flex' : 'none' }}>
          <div className="term-stack">
            {tabs.map((t) => (
              <TerminalView key={t.id} tab={t} active={view === 'term' && t.id === activeId} />
            ))}
          </div>
          {sidePanel && <TermSidePanel />}
        </div>
      </div>
      <StatusBar />
      <HostKeyDialog />
    </div>
  )
}
