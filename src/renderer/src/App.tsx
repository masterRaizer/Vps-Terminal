import { useEffect } from 'react'
import { useSessions } from '@/store/sessions'
import { Logo } from './components/Logo'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { TerminalView } from './components/TerminalView'
import { HostKeyDialog } from './components/HostKeyDialog'
import { StatusBar } from './components/StatusBar'
import { IconPrompt } from './components/Icons'

export function App() {
  const { tabs, activeId, theme } = useSessions()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <div className="app">
      <header className="titlebar">
        <Logo size={20} />
        <span className="brand">
          Vps Terminal <span className="brand-ssh">SSH</span>
        </span>
      </header>
      <Sidebar />
      <main className="workspace">
        <TabBar />
        <div className="term-stack">
          {tabs.map((t) => (
            <TerminalView key={t.id} tab={t} active={t.id === activeId} />
          ))}
          {tabs.length === 0 && (
            <div className="welcome">
              <Logo size={64} />
              <h1>Vps Terminal SSH</h1>
              <p>Введите адрес слева, чтобы открыть первую сессию.</p>
              <ul className="hints">
                <li>
                  <IconPrompt size={14} /> <kbd>Ctrl Shift C</kbd> / <kbd>Ctrl Shift V</kbd> — копировать /
                  вставить
                </li>
                <li>
                  <IconPrompt size={14} /> <kbd>Ctrl Shift F</kbd> — поиск по выводу
                </li>
                <li>
                  <IconPrompt size={14} /> ПКМ — копировать выделение или вставить
                </li>
              </ul>
            </div>
          )}
        </div>
      </main>
      <StatusBar />
      <HostKeyDialog />
    </div>
  )
}
