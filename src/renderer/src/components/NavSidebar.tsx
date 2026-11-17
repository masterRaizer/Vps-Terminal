import type { ReactNode } from 'react'
import { useSessions, type Section } from '@/store/sessions'
import { IconBraces, IconClock, IconFingerprint, IconForward, IconHosts, IconKey } from './Icons'

const ITEMS: Array<{ id: Section; label: string; icon: ReactNode }> = [
  { id: 'hosts', label: 'Хосты', icon: <IconHosts /> },
  { id: 'keychain', label: 'Ключи', icon: <IconKey /> },
  { id: 'forwarding', label: 'Проброс портов', icon: <IconForward /> },
  { id: 'snippets', label: 'Сниппеты', icon: <IconBraces /> },
  { id: 'knownhosts', label: 'Известные хосты', icon: <IconFingerprint /> },
  { id: 'logs', label: 'Журнал', icon: <IconClock /> }
]

export function NavSidebar() {
  const { section, showVault, navCollapsed } = useSessions()
  return (
    <nav className={`nav ${navCollapsed ? 'collapsed' : ''}`}>
      {ITEMS.map((it) => (
        <button
          key={it.id}
          className={`nav-item ${section === it.id ? 'active' : ''}`}
          onClick={() => showVault(it.id)}
          title={it.label}
        >
          {it.icon}
          <span className="nav-label">{it.label}</span>
        </button>
      ))}
    </nav>
  )
}
