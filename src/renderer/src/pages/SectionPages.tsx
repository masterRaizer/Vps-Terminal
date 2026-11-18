import type { ReactNode } from 'react'
import { useSessions } from '@/store/sessions'
import { EmptyState, SplitButton, ToolButton } from '@/components/ui'
import { IconBraces, IconCertificate, IconClock, IconFingerprint, IconForward, IconGrid, IconHistory, IconKey, IconPlus, IconSearch } from '@/components/Icons'

function Placeholder({ toolbar, title, icon, heading, text }: { toolbar: ReactNode; title: string; icon: ReactNode; heading: string; text: string }) {
  return (
    <div className="page">
      <div className="toolbar toolbar-top">
        {toolbar}
        <span className="toolbar-spacer" />
        <ToolButton icon={<IconSearch size={18} />} title="Поиск" disabled />
        <ToolButton icon={<IconGrid size={18} />} title="Плитка" />
      </div>
      <div className="page-body">
        <section>
          <h2 className="section-title">{title}</h2>
          <EmptyState icon={icon} title={heading} text={text} />
        </section>
      </div>
    </div>
  )
}

const STATUS_LABEL = { connecting: 'Подключение', ready: 'Подключено', closed: 'Отключено', error: 'Ошибка' } as const

export function LogsPage() {
  const logs = useSessions((s) => s.logs)
  return (
    <div className="page">
      <div className="toolbar toolbar-top">
        <span className="toolbar-title">Журнал подключений этого запуска</span>
      </div>
      <div className="page-body">
        {logs.length === 0 ? (
          <EmptyState icon={<IconClock size={26} />} title="Записей нет" text="Здесь появятся подключения, отключения и ошибки." />
        ) : (
          <div className="log-list">
            {logs.map((l) => (
              <div key={l.id} className="log-row">
                <span className={`dot dot-${l.status}`} />
                <span className="log-time">{new Date(l.at).toLocaleTimeString()}</span>
                <span className="log-target">{l.target}</span>
                <span className="log-status">{STATUS_LABEL[l.status]}</span>
                {l.message && <span className="log-msg">{l.message}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
