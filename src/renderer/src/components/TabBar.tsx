import { useSessions } from '@/store/sessions'
import { IconClose, IconPrompt } from './Icons'

export function TabBar() {
  const { tabs, activeId, activate, closeTab } = useSessions()
  return (
    <div className="tabbar" role="tablist">
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tab"
          aria-selected={t.id === activeId}
          className={`tab ${t.id === activeId ? 'active' : ''}`}
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault()
              closeTab(t.id)
            } else activate(t.id)
          }}
          title={`${t.params.username}@${t.params.host}:${t.params.port}`}
        >
          <span className={`dot dot-${t.status}`} />
          <span className="tab-title">{t.title}</span>
          <button
            className="tab-close"
            aria-label="Закрыть вкладку"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => closeTab(t.id)}
          >
            <IconClose size={12} />
          </button>
        </div>
      ))}
      {tabs.length === 0 && (
        <div className="tab ghost">
          <IconPrompt size={14} /> Нет открытых сессий
        </div>
      )}
    </div>
  )
}
