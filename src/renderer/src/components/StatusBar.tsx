import { useSessions } from '@/store/sessions'
import { useVault } from '@/store/vault'

const STATUS_TEXT = { idle: 'Ожидание', connecting: 'Подключение…', ready: 'Подключено', closed: 'Отключено', error: 'Ошибка' } as const

export function StatusBar() {
  const { tabs, activeId, view } = useSessions()
  const active = view === 'term' ? tabs.find((t) => t.id === activeId) : undefined
  const live = tabs.filter((t) => t.status === 'ready').length
  const tunnels = useVault((v) => Object.values(v.tunnels).filter((t) => t.state === 'active').length)
  const showForwards = (): void => useSessions.getState().showVault('forwarding')
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
      <button className="sb-item sb-btn" onClick={showForwards} title="Проброс портов">
        {tunnels > 0 && <span className="dot dot-ready" />}Туннели: {tunnels}
      </button>
      <span className="toolbar-spacer" />
      <span className="sb-item">Локальное хранилище</span>
      <span className="sb-item">UTF-8</span>
    </footer>
  )
}
