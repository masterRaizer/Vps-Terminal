import { useState } from 'react'
import type { ForwardKind, ForwardRuleInput } from '@shared/vault'
import { useVault, vaultCall } from '@/store/vault'
import { Drawer, Tile } from '../ui'
import { IconInput, MoreMenu, PickerRow } from '../form'
import { IconDots, IconForward, IconServer } from '../Icons'

const KINDS: Array<{ id: ForwardKind; label: string; hint: string }> = [
  { id: 'local', label: 'Локальный', hint: 'Порт на этом компьютере → адрес, доступный с сервера (ssh -L). Например, база данных за файрволом.' },
  { id: 'remote', label: 'Удалённый', hint: 'Порт на сервере → адрес, доступный с этого компьютера (ssh -R). Например, показать локальный сайт.' },
  { id: 'dynamic', label: 'SOCKS', hint: 'SOCKS5-прокси на этом компьютере, трафик выходит с сервера (ssh -D). Укажите его в браузере.' }
]

export function ForwardDrawer({ id }: { id?: string }) {
  const { forwards, hosts, tunnels, edit } = useVault()
  const rule = id ? forwards.find((f) => f.id === id) : undefined
  const [form, setForm] = useState<ForwardRuleInput>(
    () => rule ?? { label: '', hostId: hosts[0]?.id ?? '', kind: 'local', bindAddress: '127.0.0.1', bindPort: 8080, destHost: '127.0.0.1', destPort: 80, autoStart: false }
  )
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof ForwardRuleInput>(k: K, v: ForwardRuleInput[K]): void => setForm((f) => ({ ...f, [k]: v }))
  const num = (s: string): number => Number(s.replace(/\D/g, '').slice(0, 5)) || 0
  const status = id ? tunnels[id] : undefined
  const running = status?.state === 'active' || status?.state === 'starting'
  const exposed = form.kind !== 'remote' && !['127.0.0.1', 'localhost', '::1'].includes(form.bindAddress.trim())

  const save = async (start: boolean): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const saved = await vaultCall(window.api.forwards.save(form))
      edit({ kind: 'forward', id: saved.id })
      if (start) await window.api.forwards.start(saved.id)
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      title={rule ? 'Правило проброса' : 'Новое правило'}
      onClose={() => edit(null)}
      actions={
        rule && (
          <MoreMenu
            trigger={<IconDots size={20} />}
            items={[{ label: 'Удалить правило', danger: true, onClick: () => window.confirm('Удалить правило? Активный туннель будет остановлен.') && void vaultCall(window.api.forwards.delete(rule.id)).then(() => edit(null)) }]}
          />
        )
      }
      footer={
        <div className="foot-row">
          <button className="btn-soft grow" type="button" disabled={busy} onClick={() => void save(false)}>
            Сохранить
          </button>
          {running ? (
            <button className="btn-cta grow danger-cta" type="button" onClick={() => void window.api.forwards.stop(rule!.id)}>
              Остановить
            </button>
          ) : (
            <button className="btn-cta grow" type="button" disabled={busy || !form.hostId} onClick={() => void save(true)}>
              {busy ? 'Запуск…' : 'Запустить'}
            </button>
          )}
        </div>
      }
    >
      <div className="segmented">
        {KINDS.map((k) => (
          <button key={k.id} type="button" className={form.kind === k.id ? 'on' : ''} onClick={() => set('kind', k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      <p className="hint">{KINDS.find((k) => k.id === form.kind)!.hint}</p>

      <section className="drawer-group">
        <div className="addr-row">
          <Tile tone={form.kind === 'local' ? 'blue' : form.kind === 'remote' ? 'orange' : 'green'} size={48}>
            <IconForward size={24} />
          </Tile>
          <IconInput placeholder="Название (необязательно)" value={form.label} onChange={(e) => set('label', e.target.value)} />
        </div>
        <PickerRow
          icon={<IconServer size={18} />}
          placeholder="Через хост"
          value={form.hostId}
          display={form.hostId ? undefined : <span className="ph">Через какой хост</span>}
          options={hosts.map((h) => ({ value: h.id, label: h.label, hint: h.address }))}
          onPick={(v) => set('hostId', v)}
        />
      </section>

      <section className="drawer-group">
        <h3 className="group-title">{form.kind === 'remote' ? 'Порт на сервере' : 'Порт на этом компьютере'}</h3>
        <div className="field-pair">
          <IconInput placeholder="127.0.0.1" value={form.bindAddress} onChange={(e) => set('bindAddress', e.target.value)} />
          <IconInput placeholder="порт" value={String(form.bindPort || '')} onChange={(e) => set('bindPort', num(e.target.value))} />
        </div>
        {exposed && <p className="hint warn">Адрес не 127.0.0.1 — порт будет доступен другим компьютерам в сети.</p>}
        {form.kind !== 'dynamic' && (
          <>
            <h3 className="group-title">{form.kind === 'remote' ? 'Куда вести на этом компьютере' : 'Куда вести (с точки зрения сервера)'}</h3>
            <div className="field-pair">
              <IconInput placeholder="адрес" value={form.destHost} onChange={(e) => set('destHost', e.target.value)} />
              <IconInput placeholder="порт" value={String(form.destPort || '')} onChange={(e) => set('destPort', num(e.target.value))} />
            </div>
          </>
        )}
        <label className="check">
          <input type="checkbox" checked={form.autoStart} onChange={(e) => set('autoStart', e.target.checked)} /> Запускать при старте приложения
        </label>
      </section>
      {status?.state === 'error' && <div className="form-error">Туннель: {status.message}</div>}
      {error && <div className="form-error">{error}</div>}
    </Drawer>
  )
}
