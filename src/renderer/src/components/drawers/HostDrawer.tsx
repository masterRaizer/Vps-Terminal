import { useMemo, useState, type ChangeEvent } from 'react'
import { HOST_COLORS, type AuthMethod, type Host, type HostInput, type PasswordChange } from '@shared/vault'
import { useVault, groupPath } from '@/store/vault'
import { connectHost } from '@/lib/connectHost'
import { Drawer, Field } from '../ui'
import { IconEye, IconEyeOff, IconLock, IconPlug, IconStar, IconTrash, IconUser } from '../Icons'

const AUTH: Array<{ id: AuthMethod; label: string; disabled?: boolean; title?: string }> = [
  { id: 'password', label: 'Пароль' },
  { id: 'agent', label: 'SSH-агент' },
  { id: 'key', label: 'Ключ', disabled: true, title: 'Ключи — шаг 3' }
]

function emptyHost(groupId: string | null): HostInput {
  return { label: '', address: '', port: 22, username: 'root', auth: 'password', keyId: null, groupId, color: null, tags: [], favorite: false, notes: '' }
}

export function HostDrawer({ hostId, groupId }: { hostId?: string; groupId?: string | null }) {
  const { hosts, groups, secretsPersistent, saveHost, deleteHost, edit } = useVault()
  const existing: Host | undefined = hostId ? hosts.find((h) => h.id === hostId) : undefined
  const [form, setForm] = useState<HostInput>(() => (existing ? { ...existing } : emptyHost(groupId ?? null)))
  const [password, setPassword] = useState('')
  const [pwdChange, setPwdChange] = useState<PasswordChange>(undefined)
  const [showPwd, setShowPwd] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const groupOptions = useMemo(
    () => groups.map((g) => ({ id: g.id, name: groupPath(g.id, groups).map((x) => x.name).join(' / ') })).sort((a, b) => a.name.localeCompare(b.name)),
    [groups]
  )

  const set = <K extends keyof HostInput>(k: K, v: HostInput[K]): void => setForm((f) => ({ ...f, [k]: v }))
  const text = (k: 'label' | 'address' | 'username' | 'notes') => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value)

  const addTag = (): void => {
    const t = tagDraft.trim().replace(/,$/, '')
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t])
    setTagDraft('')
  }

  const save = async (andConnect = false): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const change: PasswordChange = form.auth === 'password' ? pwdChange : existing?.hasPassword ? null : undefined
      const saved = await saveHost(form, change)
      edit({ kind: 'host', id: saved.id })
      setPwdChange(undefined)
      setPassword('')
      if (andConnect) connectHost(saved)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const pwdPlaceholder =
    pwdChange === null ? 'Будет удалён при сохранении' : existing?.hasPassword ? '•••••••• сохранён' : 'Не сохранён — спросим при входе'

  return (
    <Drawer
      title={existing ? 'Хост' : 'Новый хост'}
      onClose={() => edit(null)}
      actions={
        existing && (
          <button
            className={`icon-btn ${confirmDelete ? 'danger' : ''}`}
            title={confirmDelete ? 'Нажмите ещё раз, чтобы удалить' : 'Удалить хост'}
            onClick={() => (confirmDelete ? void deleteHost(existing.id) : setConfirmDelete(true))}
            onBlur={() => setConfirmDelete(false)}
            type="button"
          >
            <IconTrash size={18} />
          </button>
        )
      }
      footer={
        <div className="foot-row">
          {existing && (
            <button className="btn-soft grow" type="button" disabled={busy} onClick={() => void save(true)}>
              <IconPlug size={17} /> Подключиться
            </button>
          )}
          <button className="btn-cta grow" type="button" disabled={busy} onClick={() => void save()}>
            Сохранить
          </button>
        </div>
      }
    >
      <form
        className="drawer-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <section className="drawer-group">
          <h3 className="group-title">Адрес</h3>
          <Field label="Название" value={form.label} onChange={text('label')} placeholder={form.address || 'prod-web-01'} />
          <div className="field-pair">
            <Field label="Хост или IP" required value={form.address} onChange={text('address')} autoFocus={!existing} placeholder="203.0.113.10" />
            <Field
              label="Порт"
              value={String(form.port)}
              onChange={(e) => set('port', Number(e.target.value.replace(/\D/g, '').slice(0, 5)) || 0)}
              className="port-input"
            />
          </div>
        </section>

        <section className="drawer-group">
          <h3 className="group-title">Аутентификация</h3>
          <Field label="Пользователь" required icon={<IconUser size={16} />} value={form.username} onChange={text('username')} />
          <div className="segmented" role="radiogroup">
            {AUTH.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={form.auth === a.id}
                className={form.auth === a.id ? 'on' : ''}
                disabled={a.disabled}
                title={a.title}
                onClick={() => set('auth', a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
          {form.auth === 'password' && (
            <>
              <div className="field-with-action">
                <Field
                  label="Пароль"
                  icon={<IconLock size={16} />}
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  placeholder={pwdPlaceholder}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setPwdChange(e.target.value === '' ? undefined : e.target.value)
                  }}
                  autoComplete="off"
                />
                <button type="button" className="icon-btn field-action" onClick={() => setShowPwd((v) => !v)} title={showPwd ? 'Скрыть' : 'Показать'}>
                  {showPwd ? <IconEyeOff size={17} /> : <IconEye size={17} />}
                </button>
              </div>
              {existing?.hasPassword && pwdChange !== null && (
                <button type="button" className="link-btn" onClick={() => (setPwdChange(null), setPassword(''))}>
                  Забыть сохранённый пароль
                </button>
              )}
              <p className="hint">
                {secretsPersistent
                  ? 'Пароль хранится в диспетчере учётных данных Windows и не попадает в интерфейс.'
                  : 'Диспетчер учётных данных недоступен: пароль будет храниться только до закрытия приложения.'}
              </p>
            </>
          )}
          {form.auth === 'agent' && <p className="hint">Используется OpenSSH-агент Windows (служба ssh-agent) с добавленными в него ключами.</p>}
        </section>

        <section className="drawer-group">
          <h3 className="group-title">Организация</h3>
          <label className="field">
            <span className="field-label">Группа</span>
            <span className="field-row">
              <select value={form.groupId ?? ''} onChange={(e) => set('groupId', e.target.value || null)}>
                <option value="">Без группы</option>
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <div className="tags-field">
            {form.tags.map((t) => (
              <span key={t} className="chip">
                {t}
                <button type="button" aria-label={`Убрать ${t}`} onClick={() => set('tags', form.tags.filter((x) => x !== t))}>
                  ×
                </button>
              </span>
            ))}
            <input
              value={tagDraft}
              placeholder={form.tags.length ? '' : 'Теги: Enter или запятая'}
              onChange={(e) => (e.target.value.endsWith(',') ? (setTagDraft(e.target.value), setTimeout(addTag)) : setTagDraft(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                } else if (e.key === 'Backspace' && !tagDraft && form.tags.length) set('tags', form.tags.slice(0, -1))
              }}
              onBlur={addTag}
            />
          </div>
          <div className="swatches" role="radiogroup" aria-label="Цвет">
            {HOST_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={(form.color ?? HOST_COLORS[0]) === c}
                className={(form.color ?? HOST_COLORS[0]) === c ? 'on' : ''}
                style={{ background: c }}
                onClick={() => set('color', c === HOST_COLORS[0] ? null : c)}
                title={c}
              />
            ))}
            <span className="toolbar-spacer" />
            <button type="button" className={`fav-toggle ${form.favorite ? 'on' : ''}`} onClick={() => set('favorite', !form.favorite)}>
              <IconStar size={17} /> {form.favorite ? 'В избранном' : 'В избранное'}
            </button>
          </div>
          <label className="field">
            <span className="field-label">Заметки</span>
            <textarea className="notes" value={form.notes} onChange={text('notes')} rows={3} spellCheck={false} />
          </label>
        </section>
        {error && <div className="form-error">{error}</div>}
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}
