import { useSessions } from '@/store/sessions'

const STATUS_TEXT = { idle: 'Ожидание', connecting: 'Подключение…', ready: 'Подключено', closed: 'Отключено', error: 'Ошибка' } as const

export function StatusBar() {
  const { tabs, activeId, view } = useSessions()
  const active = view === 'term' ? tabs.find((t) => t.id === activeId) : undefined
  const live = tabs.filter((t) => t.status === 'ready').length
  return (
    <footer className="statusbar">
      {active ? (
        <span className="sb-item">
          <span className={`dot dot-${active.status}`} />
          {STATUS_TEXT[active.status]} · {active.params.username}@{active.params.host}:{active.params.port}
        </span>
      ) : (
        <span className="sb-item">Сессий: {live}</span>
      )}
      <span className="sb-item">Туннели: 0</span>
      <span className="toolbar-spacer" />
      <span className="sb-item">Локальное хранилище</span>
      <span className="sb-item">UTF-8</span>
    </footer>
  )
}
