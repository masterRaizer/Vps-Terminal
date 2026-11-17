import { useSessions } from '@/store/sessions'
import { IconPalette } from './Icons'

const STATUS_TEXT = {
  idle: 'Ожидание',
  connecting: 'Подключение…',
  ready: 'Подключено',
  closed: 'Отключено',
  error: 'Ошибка'
} as const

export function StatusBar() {
  const { tabs, activeId, theme, setTheme } = useSessions()
  const active = tabs.find((t) => t.id === activeId)
  const live = tabs.filter((t) => t.status === 'ready').length
  return (
    <footer className="statusbar">
      {active ? (
        <span className="sb-item">
          <span className={`dot dot-${active.status}`} />
          {STATUS_TEXT[active.status]} · {active.params.username}@{active.params.host}:{active.params.port}
        </span>
      ) : (
        <span className="sb-item muted">Нет активной сессии</span>
      )}
      <span className="sb-item muted">Сессий: {live}</span>
      <span className="sb-item muted">Туннели: 0</span>
      <span className="sb-spacer" />
      <button
        className="sb-item sb-btn"
        title="Сменить палитру"
        onClick={() => setTheme(theme === 'harbor' ? 'ember' : 'harbor')}
      >
        <IconPalette size={13} /> {theme === 'harbor' ? 'Harbor' : 'Ember'}
      </button>
      <span className="sb-item muted">UTF-8</span>
    </footer>
  )
}
