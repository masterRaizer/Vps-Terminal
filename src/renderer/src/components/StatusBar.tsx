import { useSessions } from '@/store/sessions'
import { useVault } from '@/store/vault'
import { useSync } from '@/store/sync'

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
      <SyncIndicator />
      <span className="sb-item">UTF-8</span>
    </footer>
  )
}

function SyncIndicator() {
  const st = useSync((s) => s.status)
  const label = !st?.configured
    ? 'Локальное хранилище'
    : st.syncing
      ? 'Синхронизация…'
      : st.lastError
        ? 'Ошибка синхронизации'
        : st.lastSyncAt
          ? `Синхронизировано ${new Date(st.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'Синхронизация включена'
  return (
    <button className="sb-item sb-btn" title={st?.lastError ?? st?.url ?? 'Настроить синхронизацию'} onClick={() => useSessions.getState().showVault('sync')}>
      {st?.configured && <span className={`dot ${st.lastError ? 'dot-error' : st.syncing ? 'dot-connecting' : 'dot-ready'}`} />}
      {label}
    </button>
  )
}
