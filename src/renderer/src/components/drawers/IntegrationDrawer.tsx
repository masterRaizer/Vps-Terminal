import { useEffect, useRef, useState } from 'react'
import type { Integration, IntegrationInput } from '@shared/vault'
import { useVault, vaultCall } from '@/store/vault'
import { Drawer, Tile } from '../ui'
import { IconInput, MoreMenu, PickerRow } from '../form'
import { IconDots, IconLock, IconRefresh, IconServer, IconUser } from '../Icons'

const toForm = (it?: Integration): IntegrationInput =>
  it
    ? { id: it.id, name: it.name, url: it.url, authMode: it.authMode, login: it.login, identityId: it.identityId, sshPort: it.sshPort, sshUser: it.sshUser }
    : { name: '', url: 'https://', authMode: 'token', login: '', identityId: null, sshPort: 22, sshUser: 'root' }

export function IntegrationDrawer({ id }: { id?: string }) {
  const { integrations, identities, edit, openGroup } = useVault()
  const it = id ? integrations.find((i) => i.id === id) : undefined
  const [form, setForm] = useState<IntegrationInput>(() => toForm(it))
  // Stay mounted when a new integration gets its id; reset only when switching to another one.
  const formFor = useRef(id)
  useEffect(() => {
    if (formFor.current && id !== formFor.current) {
      setForm(toForm(useVault.getState().integrations.find((i) => i.id === id)))
      setMsg(undefined)
      setSecret('')
    }
    formFor.current = id
  }, [id])
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const set = <K extends keyof IntegrationInput>(k: K, v: IntegrationInput[K]): void => setForm((f) => ({ ...f, [k]: v }))

  const saveAndSync = async (sync: boolean): Promise<void> => {
    setBusy(true)
    setMsg(undefined)
    try {
      const saved = await vaultCall(window.api.integrations.save(form, secret || undefined))
      setSecret('')
      formFor.current = saved.id
      setForm((f) => ({ ...f, id: saved.id }))
      edit({ kind: 'integration', id: saved.id })
      if (sync) {
        const r = await vaultCall(window.api.integrations.sync(saved.id))
        setMsg({ ok: true, text: `Нод в панели: ${r.total}. Добавлено ${r.created}, обновлено ${r.updated}${r.missing ? `, пропало из панели ${r.missing}` : ''}.` })
      } else setMsg({ ok: true, text: 'Сохранено' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const needSecret = !it?.hasSecret && !secret
  return (
    <Drawer
      title={it ? 'Панель Remnawave' : 'Подключить Remnawave'}
      onClose={() => edit(null)}
      actions={
        it && (
          <MoreMenu
            trigger={<IconDots size={20} />}
            items={[
              ...(it.groupId ? [{ label: 'Открыть группу нод', onClick: () => (openGroup(it.groupId), edit(null)) }] : []),
              {
                label: 'Отключить панель',
                danger: true,
                onClick: () => window.confirm('Отключить панель? Хосты нод останутся, но перестанут синхронизироваться.') && void vaultCall(window.api.integrations.delete(it.id)).then(() => edit(null))
              }
            ]}
          />
        )
      }
      footer={
        <div className="foot-row">
          <button className="btn-soft grow" type="button" disabled={busy} onClick={() => void saveAndSync(false)}>
            Сохранить
          </button>
          <button className="btn-cta grow" type="button" disabled={busy || needSecret} onClick={() => void saveAndSync(true)}>
            <IconRefresh size={17} /> {busy ? 'Синхронизация…' : 'Синхронизировать'}
          </button>
        </div>
      }
    >
      <section className="drawer-group">
        <div className="addr-row">
          <Tile tone="#7a3db8" size={48}>
            <IconServer size={24} />
          </Tile>
          <IconInput placeholder="https://panel.example.com" value={form.url} onChange={(e) => set('url', e.target.value)} autoFocus={!it} />
        </div>
        <IconInput placeholder="Название группы (по умолчанию — домен панели)" value={form.name} onChange={(e) => set('name', e.target.value)} />
      </section>

      <section className="drawer-group">
        <h3 className="group-title">Доступ к API панели</h3>
        <div className="segmented two">
          <button type="button" className={form.authMode === 'token' ? 'on' : ''} onClick={() => set('authMode', 'token')}>
            API-токен
          </button>
          <button type="button" className={form.authMode === 'login' ? 'on' : ''} onClick={() => set('authMode', 'login')}>
            Логин в панель
          </button>
        </div>
        {form.authMode === 'login' && <IconInput icon={<IconUser size={18} />} placeholder="Логин администратора" value={form.login} onChange={(e) => set('login', e.target.value)} />}
        <IconInput
          icon={<IconLock size={18} />}
          type="password"
          autoComplete="off"
          placeholder={it?.hasSecret ? '•••••••• сохранён' : form.authMode === 'token' ? 'API-токен' : 'Пароль'}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
        <p className="hint">
          {form.authMode === 'token'
            ? 'Токен создаётся в панели: Настройки → API-токены. Хранится в диспетчере учётных данных Windows.'
            : 'Приложение входит в панель и берёт токен сессии на время синхронизации. Пароль хранится в диспетчере учётных данных.'}
        </p>
      </section>

      <section className="drawer-group">
        <h3 className="group-title">SSH к нодам</h3>
        <PickerRow
          icon={<IconUser size={18} />}
          placeholder="Профиль доступа"
          value={form.identityId ?? ''}
          display={form.identityId ? undefined : <span className="ph">Профиль доступа для всех нод</span>}
          options={[{ value: '', label: 'Без профиля' }, ...identities.map((i) => ({ value: i.id, label: i.label, hint: i.username }))]}
          onPick={(v) => set('identityId', v || null)}
        />
        <div className="field-pair">
          <IconInput icon={<IconUser size={18} />} placeholder="Пользователь" value={form.sshUser} onChange={(e) => set('sshUser', e.target.value)} />
          <IconInput placeholder="22" value={String(form.sshPort)} onChange={(e) => set('sshPort', Number(e.target.value.replace(/\D/g, '').slice(0, 5)) || 0)} />
        </div>
        <p className="hint">Ноды появятся в отдельной группе. Флаг берётся из страны ноды в панели, а если её нет — по IP из встроенной базы. Ваши правки хостов (порт, профиль, заметки) повторная синхронизация не трогает.</p>
      </section>

      {it && (
        <p className={`hint sync-state ${it.lastError ? 'warn' : ''}`}>
          {it.lastSyncAt ? `Последняя синхронизация: ${new Date(it.lastSyncAt).toLocaleString()}` : 'Ещё не синхронизировалась'}
          {it.lastError ? ` — ошибка: ${it.lastError}` : ''}
        </p>
      )}
      {msg && <div className={msg.ok ? 'notice inline' : 'form-error'}>{msg.text}</div>}
    </Drawer>
  )
}
