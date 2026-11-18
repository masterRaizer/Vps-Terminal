import { useState } from 'react'
import { useVault, vaultCall } from '@/store/vault'
import { Card, EmptyState, ToolButton } from '@/components/ui'
import { IconClose, IconDownload, IconFingerprint, IconSearch } from '@/components/Icons'

export function KnownHostsPage() {
  const v = useVault()
  const [q, setQ] = useState('')
  const [notice, setNotice] = useState<string>()
  const query = q.trim().toLowerCase()
  const list = v.knownHosts.filter((k) => !query || `${k.host}:${k.port} ${k.algorithm} ${k.fingerprint}`.toLowerCase().includes(query))
  const nameOf = (host: string, port: number): string | undefined => v.hosts.find((h) => h.address.toLowerCase() === host && h.port === port)?.label

  return (
    <div className="page">
      <div className="toolbar toolbar-top">
        <ToolButton
          icon={<IconDownload size={18} />}
          label="Импорт known_hosts"
          onClick={async () => {
            try {
              const r = await vaultCall(window.api.knownHosts.import())
              if (r) setNotice(`Добавлено: ${r.added}${r.skipped ? `, пропущено: ${r.skipped} (хешированные имена и @-записи)` : ''}`)
            } catch (e) {
              setNotice((e as Error).message)
            }
          }}
        />
        <span className="toolbar-spacer" />
        <label className="pane-filter wide">
          <IconSearch size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Хост или отпечаток" />
        </label>
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button className="icon-btn" onClick={() => setNotice(undefined)} aria-label="Скрыть">
            ×
          </button>
        </div>
      )}
      <div className="page-body">
        <section>
          <h2 className="section-title">Известные хосты</h2>
          {list.length ? (
            <div className="card-grid one-col">
              {list.map((k) => (
                <Card
                  key={`${k.host}:${k.port}:${k.algorithm}`}
                  tone="slate"
                  icon={<IconFingerprint size={22} />}
                  title={`${nameOf(k.host, k.port) ? `${nameOf(k.host, k.port)} · ` : ''}${k.host}${k.port !== 22 ? `:${k.port}` : ''}`}
                  subtitle={`${k.algorithm} ${k.fingerprint} · ${k.lastSeenAt ? `виден ${new Date(k.lastSeenAt).toLocaleDateString()}` : `добавлен ${new Date(k.addedAt).toLocaleDateString()}`}`}
                  trailing={
                    <span
                      role="button"
                      tabIndex={0}
                      className="icon-btn"
                      title="Забыть ключ"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm(`Забыть ключ ${k.algorithm} для ${k.host}:${k.port}? При следующем подключении его спросят заново.`)) void vaultCall(window.api.knownHosts.forget(k.host, k.port, k.algorithm))
                      }}
                    >
                      <IconClose size={16} />
                    </span>
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={<IconFingerprint size={26} />} title={query ? 'Ничего не найдено' : 'Список пуст'} text="Ключи серверов запоминаются при первом подключении. Если ключ сменится, приложение предупредит и не подключится без вашего решения." />
          )}
        </section>
      </div>
    </div>
  )
}
