import { useSessions } from '@/store/sessions'
import { IconBell, IconChevronDown, IconClose, IconFolder, IconMenu, IconPanelRight, IconPlus, IconPrompt, IconTerminal, IconVault } from './Icons'

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
      <div className="top-sessions">
        {s.workspaces.map((w) => {
          const active = s.view === 'term' && w.paneIds.includes(s.activeId ?? '')
          const focus = s.tabs.find((t) => t.id === w.focus)
          const status = focus?.status ?? 'idle'
          return (
            <div
              key={w.id}
              className={`top-tab term-tab st-${status} ${active ? 'active' : ''}`}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  s.closeWorkspace(w.id)
                } else if (e.button === 0) s.activateWorkspace(w.id)
              }}
              title={focus ? `${focus.params.username}@${focus.params.host}:${focus.params.port}` : w.title}
              role="tab"
              aria-selected={active}
            >
              <span className="tt-lead">
                <IconPrompt size={16} className="tt-prompt" />
                <button
                  className="tt-close"
                  aria-label="Закрыть вкладку"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => s.closeWorkspace(w.id)}
                >
                  <IconClose size={15} />
                </button>
              </span>
              <span className="tt-title">{w.title}</span>
              {w.paneIds.length > 1 && <span className="tt-count" title="Панелей во вкладке">{w.paneIds.length}</span>}
              {active && <IconTerminal size={17} className="tt-icon" />}
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
