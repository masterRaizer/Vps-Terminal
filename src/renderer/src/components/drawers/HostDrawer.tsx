import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_HOST_OPTIONS, HOST_COLORS, type AuthMethod, type Host, type HostInput, type PasswordChange } from '@shared/vault'
import { groupPath, useVault } from '@/store/vault'
import { connectHost } from '@/lib/connectHost'
import { TERM_THEMES, termThemeById } from '@/lib/termThemes'
import { useSessions } from '@/store/sessions'
import { Drawer, Tile } from '../ui'
import { IconInput, MoreMenu, PickerRow, useOutsideClose } from '../form'
import {
  IconAgent,
  IconBackspace,
  IconBraces,
  IconChain,
  IconCharset,
  IconClose,
  IconDots,
  IconEye,
  IconEyeOff,
  IconGroup,
  IconKey,
  IconLock,
  IconPlug,
  IconPlus,
  IconProxy,
  IconServer,
  IconStar,
  IconTag,
  IconUser,
  IconVariable,
  IconVault
} from '../Icons'

function emptyHost(groupId: string | null): HostInput {
  return { label: '', address: '', port: 22, username: 'root', auth: 'password', keyId: null, groupId, color: null, tags: [], favorite: false, notes: '', options: { ...DEFAULT_HOST_OPTIONS } }
}

const toInput = (h: Host): HostInput => {
  const { id, label, address, port, username, auth, keyId, groupId, color, tags, favorite, notes, options } = h
  return { id, label, address, port, username, auth, keyId, groupId, color, tags, favorite, notes, options }
}

const envToText = (env: Record<string, string>): string => Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n')
function textToEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf('=')
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1)
  }
  return env
}

export function HostDrawer({ hostId, groupId }: { hostId?: string; groupId?: string | null }) {
  const { hosts, groups, secretsPersistent, saveHost, deleteHost, edit } = useVault()
  const existing: Host | undefined = hostId ? hosts.find((h) => h.id === hostId) : undefined
  const [form, setForm] = useState<HostInput>(() => (existing ? toInput(existing) : emptyHost(groupId ?? null)))
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [envText, setEnvText] = useState(() => envToText(form.options.env))
  const [envOpen, setEnvOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const addRef = useOutsideClose(addOpen, () => setAddOpen(false))
  const colorRef = useOutsideClose(colorOpen, () => setColorOpen(false))
  const globalTheme = useSessions((s) => s.termTheme)

  const groupOptions = useMemo(
    () => [
      { value: '', label: 'Без группы' },
      ...groups.map((g) => ({ value: g.id, label: groupPath(g.id, groups).map((x) => x.name).join(' / ') })).sort((a, b) => a.label.localeCompare(b.label))
    ],
    [groups]
  )

  const set = <K extends keyof HostInput>(k: K, v: HostInput[K]): void => setForm((f) => ({ ...f, [k]: v }))
  const setOpt = <K extends keyof HostInput['options']>(k: K, v: HostInput['options'][K]): void =>
    setForm((f) => ({ ...f, options: { ...f.options, [k]: v } }))

  const valid = form.address.trim() !== '' && !/\s/.test(form.address.trim()) && form.username.trim() !== '' && form.port > 0 && form.port < 65536

  const persist = async (change: PasswordChange = undefined): Promise<Host | null> => {
    if (!valid) return null
    try {
      const h = await saveHost(form, change)
      setError(undefined)
      setSaved(true)
      if (!existing) edit({ kind: 'host', id: h.id })
      return h
    } catch (e) {
      setError((e as Error).message)
      return null
    }
  }

  // Existing hosts save themselves shortly after each change.
  const first = useRef(true)
  useEffect(() => {
    if (!existing) return
    if (first.current) {
      first.current = false
      return
    }
    setSaved(false)
    const t = setTimeout(() => void persist(), 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  const commitPassword = async (): Promise<void> => {
    if (!password) return
    if (existing) {
      if (await persist(password)) setPassword('')
    }
  }

  const addTag = (): void => {
    const t = tagDraft.trim().replace(/,$/, '')
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t])
    setTagDraft('')
  }

  const pickAuth = async (a: AuthMethod): Promise<void> => {
    setAddOpen(false)
    set('auth', a)
  }

  const connect = async (): Promise<void> => {
    const h = await persist(existing ? (password ? password : undefined) : password || undefined)
    if (h) {
      setPassword('')
      connectHost(h)
    }
  }

  const tileColor = form.color ?? HOST_COLORS[0]
  const themeId = form.options.termTheme ?? globalTheme
  const theme = termThemeById(themeId) ?? TERM_THEMES[0]
  const envCount = Object.keys(form.options.env).length

  return (
    <Drawer
      title={existing ? 'Хост' : 'Новый хост'}
      onClose={() => edit(null)}
      actions={
        <>
          {existing && <span className={`save-state ${saved ? 'on' : ''}`}>{error ? '' : saved ? 'Сохранено' : ''}</span>}
          {existing && (
            <MoreMenu
              trigger={<IconDots size={20} />}
              items={[
                { label: form.favorite ? 'Убрать из избранного' : 'В избранное', onClick: () => set('favorite', !form.favorite) },
                {
                  label: 'Дублировать',
                  onClick: async () => {
                    const copy = await saveHost({ ...toInput(existing), id: undefined, label: `${existing.label} (копия)` }, undefined)
                    edit({ kind: 'host', id: copy.id })
                  }
                },
                { label: 'Забыть сохранённый пароль', disabled: !existing.hasPassword, onClick: () => void persist(null) },
                { label: 'Удалить хост', danger: true, onClick: () => window.confirm(`Удалить «${existing.label}»?`) && void deleteHost(existing.id) }
              ]}
            />
          )}
        </>
      }
      footer={
        <div className="foot-row">
          {!existing && (
            <button className="btn-soft grow" type="button" disabled={!valid} onClick={() => void persist(password || undefined)}>
              Сохранить
            </button>
          )}
          <button className="btn-cta grow" type="button" disabled={!valid} onClick={() => void connect()}>
            <IconPlug size={18} /> Подключиться
          </button>
        </div>
      }
    >
      <form className="drawer-form" onSubmit={(e) => (e.preventDefault(), void connect())}>
        <div className="vault-picker" title="Синхронизация хранилищ — шаг 5">
          <IconVault size={20} />
          <span>Личное хранилище</span>
          <IconStar size={16} className={`vault-fav ${form.favorite ? 'on' : ''}`} onClick={() => set('favorite', !form.favorite)} />
        </div>

        <section className="drawer-group">
          <h3 className="group-title">Адрес</h3>
          <div className="addr-row">
            <div className="tile-pick" ref={colorRef}>
              <button type="button" className="tile-btn" onClick={() => setColorOpen((o) => !o)} title="Цвет хоста">
                <Tile tone={tileColor} size={48}>
                  <IconServer size={24} />
                </Tile>
              </button>
              {colorOpen && (
                <div className="popover swatch-pop">
                  {HOST_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={tileColor === c ? 'on' : ''}
                      style={{ background: c }}
                      aria-label={c}
                      onClick={() => (set('color', c === HOST_COLORS[0] ? null : c), setColorOpen(false))}
                    />
                  ))}
                </div>
              )}
            </div>
            <IconInput placeholder="IP или имя хоста" value={form.address} onChange={(e) => set('address', e.target.value)} autoFocus={!existing} />
          </div>
        </section>

        <section className="drawer-group">
          <h3 className="group-title">Основное</h3>
          <IconInput placeholder={form.address || 'Название'} value={form.label} onChange={(e) => set('label', e.target.value)} />
          <PickerRow
            icon={<IconGroup size={18} />}
            placeholder="Родительская группа"
            value={form.groupId ?? ''}
            display={form.groupId ? undefined : <span className="ph">Родительская группа</span>}
            options={groupOptions}
            onPick={(v) => set('groupId', v || null)}
          />
          <label className="iinput tags-input">
            <span className="iinput-icon">
              <IconTag size={18} />
            </span>
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
              placeholder={form.tags.length ? '' : 'Теги'}
              onChange={(e) => (e.target.value.endsWith(',') ? (setTagDraft(e.target.value), setTimeout(addTag)) : setTagDraft(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                } else if (e.key === 'Backspace' && !tagDraft && form.tags.length) set('tags', form.tags.slice(0, -1))
              }}
              onBlur={addTag}
            />
          </label>
          <PickerRow
            icon={<IconBackspace size={18} />}
            placeholder="Backspace"
            value={form.options.backspace}
            display={<span className="ph">Backspace</span>}
            right={form.options.backspace === 'del' ? 'По умолчанию' : 'Ctrl+H'}
            options={[
              { value: 'del', label: 'По умолчанию (^?)' },
              { value: 'ctrl-h', label: 'Ctrl+H (^H)' }
            ]}
            onPick={(v) => setOpt('backspace', v)}
          />
        </section>

        <section className="drawer-group">
          <div className="port-line">
            SSH на
            <input
              className="port-box"
              value={String(form.port)}
              onChange={(e) => set('port', Number(e.target.value.replace(/\D/g, '').slice(0, 5)) || 0)}
              aria-label="Порт"
            />
            порту
          </div>
          <hr />
          <h3 className="group-title">Учётные данные</h3>
          <IconInput icon={<IconUser size={18} />} placeholder="Пользователь" value={form.username} onChange={(e) => set('username', e.target.value)} />
          {form.auth === 'password' && (
            <IconInput
              icon={<IconLock size={18} />}
              type={showPwd ? 'text' : 'password'}
              placeholder={existing?.hasPassword ? '•••••••• сохранён' : 'Пароль (спросим при входе, если пусто)'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => void commitPassword()}
              autoComplete="off"
              right={
                <span className="iinput-actions">
                  <button type="button" className="icon-btn small" onClick={() => setShowPwd((v) => !v)} title={showPwd ? 'Скрыть' : 'Показать'}>
                    {showPwd ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                  </button>
                </span>
              }
            />
          )}
          {form.auth === 'agent' && (
            <div className="cred-chip">
              <IconAgent size={18} /> SSH-агент Windows
              <button type="button" className="icon-btn small" onClick={() => set('auth', 'password')} title="Убрать">
                <IconClose size={14} />
              </button>
            </div>
          )}
          <div className="add-cred" ref={addRef}>
            <button type="button" className="add-cred-btn" onClick={() => setAddOpen((o) => !o)}>
              <IconPlus size={16} /> Пароль, ключ, SSH-агент
            </button>
            {addOpen && (
              <div className="popover cred-pop">
                <button type="button" className="pop-feature" disabled title="Шаг 3">
                  <IconKey size={18} />
                  <span className="pop-label">
                    Ключ SSH
                    <small>Импорт и генерация — шаг 3</small>
                  </span>
                  <span className="pop-badge">Скоро</span>
                </button>
                <hr />
                <button type="button" className={form.auth === 'password' ? 'on' : ''} onClick={() => void pickAuth('password')}>
                  <IconLock size={18} />
                  <span className="pop-label">Пароль</span>
                </button>
                <button type="button" className={form.auth === 'agent' ? 'on' : ''} onClick={() => void pickAuth('agent')}>
                  <IconAgent size={18} />
                  <span className="pop-label">SSH-агент</span>
                </button>
              </div>
            )}
          </div>
          {!secretsPersistent && form.auth === 'password' && <p className="hint warn">Диспетчер учётных данных недоступен: пароль хранится только до закрытия приложения.</p>}
          <hr />
          <PickerRow
            icon={<IconAgent size={18} />}
            placeholder="Проброс агента"
            value={form.options.agentForward ? 'on' : 'off'}
            display={<span className="ph">Проброс агента</span>}
            right={form.options.agentForward ? 'Включён' : 'Выключен'}
            options={[
              { value: 'off', label: 'Выключен' },
              { value: 'on', label: 'Включён' }
            ]}
            onPick={(v) => setOpt('agentForward', v === 'on')}
          />
          <PickerRow icon={<IconBraces size={18} />} placeholder="Стартовый сниппет" options={[]} onPick={() => {}} disabled right="шаг 4" title="Сниппеты — шаг 4" display={<span className="ph">Стартовый сниппет</span>} />
          <PickerRow icon={<IconChain size={18} />} placeholder="Цепочка хостов" options={[]} onPick={() => {}} disabled right="позже" title="Jump-хосты — после шага 4" display={<span className="ph">Цепочка хостов</span>} />
          <PickerRow icon={<IconProxy size={18} />} placeholder="Прокси" options={[]} onPick={() => {}} disabled right="позже" title="SOCKS/HTTP-прокси — после шага 4" display={<span className="ph">Прокси</span>} />
          <button type="button" className={`iinput picker-btn ${envCount ? 'has-value' : ''}`} onClick={() => setEnvOpen((o) => !o)}>
            <span className="iinput-icon">
              <IconVariable size={18} />
            </span>
            <span className="picker-value">{envCount ? `Переменные окружения: ${envCount}` : <span className="ph">Переменные окружения</span>}</span>
          </button>
          {envOpen && (
            <div className="env-editor">
              <textarea
                className="notes"
                rows={4}
                spellCheck={false}
                placeholder={'LANG=C.UTF-8\nEDITOR=nano'}
                value={envText}
                onChange={(e) => setEnvText(e.target.value)}
                onBlur={() => setOpt('env', textToEnv(envText))}
              />
              <p className="hint">По одной на строку: ИМЯ=значение. Сервер примет только разрешённые в AcceptEnv.</p>
            </div>
          )}
          <div className="iinput picker-btn static">
            <span className="iinput-icon">
              <IconCharset size={18} />
            </span>
            <span className="picker-value">UTF-8</span>
          </div>
          <PickerRow
            icon={null}
            placeholder="Тема терминала"
            value={form.options.termTheme ?? ''}
            options={[{ value: '', label: 'Как в настройках' }, ...TERM_THEMES.map((t) => ({ value: t.id, label: t.name }))]}
            onPick={(v) => setOpt('termTheme', v || null)}
            display={
              <span className="theme-inline">
                <span className="theme-prev mini" style={{ background: theme.theme.background }}>
                  <span style={{ background: theme.theme.foreground, width: '80%' }} />
                  <span style={{ background: theme.theme.foreground, width: '60%', opacity: 0.7 }} />
                </span>
                {theme.name}
                {!form.options.termTheme && <small>по умолчанию</small>}
              </span>
            }
          />
        </section>

        <section className="drawer-group">
          <h3 className="group-title">Заметки</h3>
          <textarea className="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} spellCheck={false} placeholder="Что здесь крутится, контакты, ссылки…" />
        </section>
        {error && <div className="form-error">{error}</div>}
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}
