import { useSessions } from '@/store/sessions'
import { IconBell, IconChevronDown, IconClose, IconFolder, IconMenu, IconPanelRight, IconPlus, IconTerminal, IconVault } from './Icons'

const isWindows = navigator.userAgent.includes('Windows')

export function TopBar() {
  const s = useSessions()
  return (
    <header className={`topbar ${isWindows ? 'win' : ''}`}>
      <button className="icon-btn top-menu" title="Меню разделов" onClick={s.toggleNav}>
        <IconMenu size={20} />
      </button>
      <div className={`top-tab vault-tab ${s.view === 'vault' ? 'active' : ''}`}>
        <button className="vt-main" onClick={() => s.showVault()}>
          <IconVault size={18} /> Хранилище
        </button>
        <button className="vt-more" title="Выбор хранилища" disabled>
          <IconChevronDown size={16} />
        </button>
      </div>
      <button className={`top-tab ${s.view === 'sftp' ? 'active' : ''}`} onClick={s.showSftp}>
        <IconFolder size={17} /> SFTP
      </button>
      {s.tabs.length > 0 && <span className="top-sep" />}
      <div className="top-sessions">
        {s.tabs.map((t) => {
          const active = s.view === 'term' && t.id === s.activeId
          return (
            <div
              key={t.id}
              className={`top-tab term-tab st-${t.status} ${active ? 'active' : ''}`}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  s.closeTab(t.id)
                } else if (e.button === 0) s.activate(t.id)
              }}
              title={`${t.params.username}@${t.params.host}:${t.params.port}`}
              role="tab"
              aria-selected={active}
            >
              <button
                className="tt-close"
                aria-label="Закрыть сессию"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => s.closeTab(t.id)}
              >
                <IconClose size={15} />
              </button>
              <span className="tt-title">{t.title}</span>
              <IconTerminal size={17} className="tt-icon" />
            </div>
          )
        })}
      </div>
      <button className="icon-btn top-plus" title="Новое подключение" onClick={s.newConnection}>
        <IconPlus size={20} />
      </button>
      <span className="top-drag" />
      <button className="icon-btn" title="Уведомления">
        <IconBell size={19} />
      </button>
      {s.view === 'term' && (
        <button className={`icon-btn ${s.sidePanel ? 'on' : ''}`} title="Боковая панель" onClick={s.toggleSidePanel}>
          <IconPanelRight size={19} />
        </button>
      )}
    </header>
  )
}
