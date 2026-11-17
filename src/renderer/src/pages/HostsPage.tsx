import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useSessions } from '@/store/sessions'
import { parseTarget } from '@/lib/parseTarget'
import { Card, Drawer, EmptyState, Field, SplitButton, ToolButton } from '@/components/ui'
import { IconEye, IconEyeOff, IconGrid, IconHosts, IconLock, IconPlug, IconPlus, IconServer, IconTag, IconTerminal, IconUser } from '@/components/Icons'

interface Draft {
  host: string
  port: string
  username: string
  password: string
}

export function HostsPage() {
  const { focusSearchTick, openTab, tabs, activate } = useSessions()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [focusSearchTick])

  // Ctrl+K focuses the search/connect bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const startConnect = (): void => {
    const t = parseTarget(query)
    setDraft({ host: t.host, port: String(t.port ?? 22), username: t.username ?? 'root', password: '' })
  }

  const live = tabs.filter((t) => !query || `${t.params.username}@${t.params.host}`.includes(query.trim()))

  return (
    <div className="page-with-drawer">
      <div className="page">
        <form
          className="omnibar"
          onSubmit={(e) => {
            e.preventDefault()
            startConnect()
          }}
        >
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найдите хост или введите ssh user@hostname…"
            spellCheck={false}
          />
          <button className="omni-btn" type="submit" disabled={!query.trim()}>
            Подключить
          </button>
        </form>

        <div className="toolbar">
          <SplitButton icon={<IconPlus size={18} />} label="Новый хост" disabled title="Менеджер хостов — шаг 2" />
          <ToolButton icon={<IconTerminal size={18} />} label="Быстрое подключение" onClick={() => setDraft({ host: '', port: '22', username: 'root', password: '' })} />
          <span className="toolbar-spacer" />
          <ToolButton icon={<IconGrid size={18} />} title="Плитка" />
          <ToolButton icon={<IconTag size={18} />} title="Теги" disabled />
        </div>

        <div className="page-body">
          {live.length > 0 && (
            <section>
              <h2 className="section-title">Открытые сессии</h2>
              <div className="card-grid">
                {live.map((t) => (
                  <Card
                    key={t.id}
                    tone={t.status === 'ready' ? 'green' : 'slate'}
                    icon={<IconServer size={22} />}
                    title={t.title}
                    subtitle={`ssh, ${t.params.username}`}
                    onClick={() => activate(t.id)}
                  />
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="section-title">Хосты</h2>
            <EmptyState
              icon={<IconHosts size={26} />}
              title="Сохранённых хостов пока нет"
              text="Группы, теги и карточки хостов появятся на следующем шаге. Сейчас можно подключиться через строку сверху."
            />
          </section>
        </div>
      </div>

      {draft && (
        <ConnectDrawer
          draft={draft}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onConnect={() => {
            const port = Number(draft.port)
            openTab({ host: draft.host.trim(), port, username: draft.username.trim() }, draft.password)
            setDraft(null)
            setQuery('')
          }}
        />
      )}
    </div>
  )
}

function ConnectDrawer({ draft, onChange, onClose, onConnect }: { draft: Draft; onChange: (d: Draft) => void; onClose: () => void; onConnect: () => void }) {
  const [showPwd, setShowPwd] = useState(false)
  const port = Number(draft.port)
  const valid = draft.host.trim() && !/\s/.test(draft.host.trim()) && draft.username.trim() && Number.isInteger(port) && port > 0 && port < 65536
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...draft, [k]: e.target.value })

  return (
    <Drawer
      title="Новое подключение"
      onClose={onClose}
      footer={
        <button className="btn-cta" disabled={!valid} onClick={onConnect} type="button">
          <IconPlug size={18} /> Подключиться
        </button>
      }
    >
      <form
        className="drawer-group"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onConnect()
        }}
      >
        <h3 className="group-title">Адрес</h3>
        <Field label="Хост или IP" required value={draft.host} onChange={set('host')} autoFocus={!draft.host} placeholder="203.0.113.10" />
        <Field label="Порт" value={draft.port} onChange={(e) => onChange({ ...draft, port: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
        <button type="submit" hidden />
      </form>
      <form
        className="drawer-group"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onConnect()
        }}
      >
        <h3 className="group-title">Аутентификация</h3>
        <Field label="Пользователь" required icon={<IconUser size={16} />} value={draft.username} onChange={set('username')} />
        <div className="field-with-action">
          <Field
            label="Пароль"
            icon={<IconLock size={16} />}
            type={showPwd ? 'text' : 'password'}
            value={draft.password}
            onChange={set('password')}
            autoComplete="off"
            autoFocus={Boolean(draft.host)}
          />
          <button type="button" className="icon-btn field-action" onClick={() => setShowPwd((v) => !v)} title={showPwd ? 'Скрыть' : 'Показать'}>
            {showPwd ? <IconEyeOff size={17} /> : <IconEye size={17} />}
          </button>
        </div>
        <p className="hint">Пароль уходит в основной процесс только для входа и нигде не сохраняется. Ключи и сохранение паролей — шаги 2–3.</p>
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}
