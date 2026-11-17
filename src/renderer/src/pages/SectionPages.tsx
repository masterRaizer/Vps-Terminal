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

export const KeychainPage = () => (
  <Placeholder
    toolbar={
      <>
        <SplitButton icon={<IconPlus size={18} />} label="Новый ключ" disabled title="Шаг 3" />
        <ToolButton icon={<IconCertificate size={18} />} label="Сертификат" disabled />
      </>
    }
    title="Ключи"
    icon={<IconKey size={26} />}
    heading="Ключей пока нет"
    text="Импорт OpenSSH/PEM/PPK, генерация ed25519 и RSA, профили с логином и паролем — шаг 3."
  />
)

export const ForwardingPage = () => (
  <Placeholder
    toolbar={<SplitButton icon={<IconPlus size={18} />} label="Новое правило" disabled title="Шаг 4" />}
    title="Правила проброса"
    icon={<IconForward size={26} />}
    heading="Туннелей нет"
    text="Локальный, удалённый и динамический (SOCKS) проброс портов со списком активных туннелей — шаг 4."
  />
)

export const SnippetsPage = () => (
  <Placeholder
    toolbar={
      <>
        <SplitButton icon={<IconPlus size={18} />} label="Новый сниппет" disabled title="Шаг 4" />
        <ToolButton icon={<IconHistory size={18} />} label="История команд" disabled />
      </>
    }
    title="Сниппеты"
    icon={<IconBraces size={26} />}
    heading="Сниппетов пока нет"
    text="Библиотека команд с переменными и вставкой в активную сессию — шаг 4."
  />
)

export const KnownHostsPage = () => (
  <Placeholder
    toolbar={<ToolButton icon={<IconPlus size={18} />} label="Импорт known_hosts" disabled />}
    title="Известные хосты"
    icon={<IconFingerprint size={26} />}
    heading="Список пуст"
    text="Доверенные отпечатки серверов (TOFU) и предупреждение при смене ключа — шаг 4. Сейчас отпечаток подтверждается при каждом подключении."
  />
)

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
