import type { ForwardRule } from '@shared/vault'
import { useVault } from '@/store/vault'
import { Card, EmptyState, SplitButton } from '@/components/ui'
import { ForwardDrawer } from '@/components/drawers/ForwardDrawer'
import { IconForward, IconPlay, IconPlus } from '@/components/Icons'

export const describeRule = (r: ForwardRule, hostLabel: string): string =>
  r.kind === 'dynamic'
    ? `SOCKS ${r.bindAddress}:${r.bindPort} · через ${hostLabel}`
    : r.kind === 'local'
      ? `${r.bindAddress}:${r.bindPort} → ${r.destHost}:${r.destPort} · через ${hostLabel}`
      : `${hostLabel}:${r.bindPort} → ${r.destHost}:${r.destPort}`

export function ForwardingPage() {
  const v = useVault()
  const ed = v.editing
  return (
    <div className="page-with-drawer">
      <div className="page">
        <div className="toolbar toolbar-top">
          <SplitButton icon={<IconPlus size={18} />} label="Новое правило" onClick={() => v.edit({ kind: 'forward' })} disabled={!v.hosts.length} title={v.hosts.length ? undefined : 'Сначала добавьте хост'} />
        </div>
        <div className="page-body">
          <section>
            <h2 className="section-title">Правила проброса</h2>
            {v.forwards.length ? (
              <div className="card-grid">
                {v.forwards.map((r) => {
                  const host = v.hosts.find((h) => h.id === r.hostId)
                  const st = v.tunnels[r.id]
                  const on = st?.state === 'active' || st?.state === 'starting'
                  return (
                    <Card
                      key={r.id}
                      tone={r.kind === 'local' ? 'blue' : r.kind === 'remote' ? 'orange' : 'green'}
                      icon={<IconForward size={22} />}
                      title={r.label || (r.kind === 'dynamic' ? `SOCKS :${r.bindPort}` : `:${r.bindPort} → ${r.destHost}:${r.destPort}`)}
                      subtitle={st?.state === 'error' ? `Ошибка: ${st.message}` : describeRule(r, host?.label ?? '?')}
                      badge={<span className={`dot dot-${st?.state === 'active' ? 'ready' : st?.state === 'starting' ? 'connecting' : st?.state === 'error' ? 'error' : 'closed'}`} />}
                      selected={ed?.kind === 'forward' && ed.id === r.id}
                      onClick={() => v.edit({ kind: 'forward', id: r.id })}
                      trailing={
                        <span
                          role="button"
                          tabIndex={0}
                          className={`tunnel-toggle ${on ? 'on' : ''}`}
                          title={on ? 'Остановить' : 'Запустить'}
                          onClick={(e) => {
                            e.stopPropagation()
                            void (on ? window.api.forwards.stop(r.id) : window.api.forwards.start(r.id).catch(() => undefined))
                          }}
                        >
                          {st?.state === 'starting' ? '…' : on ? (st?.connections ? `${st.connections} соед.` : 'Вкл') : <IconPlay size={13} />}
                        </span>
                      }
                    />
                  )
                })}
              </div>
            ) : (
              <EmptyState icon={<IconForward size={26} />} title="Правил пока нет" text="Локальный, удалённый и SOCKS-проброс через ваши хосты. Туннели можно запускать вместе с приложением." />
            )}
          </section>
        </div>
      </div>
      {ed?.kind === 'forward' && <ForwardDrawer key={ed.id ?? 'new'} id={ed.id} />}
    </div>
  )
}
