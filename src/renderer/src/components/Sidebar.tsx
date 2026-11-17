import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useSessions } from '@/store/sessions'
import { IconBolt, IconSearch, IconServer } from './Icons'

/** Parses "user@host:port" shorthand. */
function parseTarget(s: string): { username?: string; host: string; port?: number } {
  let rest = s.trim()
  let username: string | undefined
  const at = rest.lastIndexOf('@')
  if (at > 0) {
    username = rest.slice(0, at)
    rest = rest.slice(at + 1)
  }
  const m = /^(.*):(\d{1,5})$/.exec(rest)
  if (m && !rest.startsWith('[')) return { username, host: m[1], port: Number(m[2]) }
  return { username, host: rest.replace(/^\[|\]$/g, '') }
}

export function Sidebar() {
  const openTab = useSessions((s) => s.openTab)
  const [filter, setFilter] = useState('')
  const [target, setTarget] = useState('')
  const [username, setUsername] = useState('root')
  const [port, setPort] = useState('22')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const searchRef = useRef<HTMLInputElement>(null)

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

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const t = parseTarget(target)
    const user = (t.username ?? username).trim()
    const p = t.port ?? Number(port)
    if (!t.host) return setError('Укажите адрес')
    if (!user) return setError('Укажите пользователя')
    if (!Number.isInteger(p) || p < 1 || p > 65535) return setError('Неверный порт')
    setError(undefined)
    openTab({ host: t.host, port: p, username: user }, password)
    setPassword('')
  }

  return (
    <aside className="sidebar">
      <label className="search">
        <IconSearch size={15} />
        <input ref={searchRef} placeholder="Поиск хостов" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <kbd>Ctrl K</kbd>
      </label>

      <section className="panel">
        <header className="panel-head">
          <IconBolt size={14} /> Быстрое подключение
        </header>
        <form className="quick" onSubmit={submit}>
          <input
            placeholder="user@host:port"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            spellCheck={false}
            autoFocus
          />
          <div className="row">
            <input
              placeholder="Пользователь"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              spellCheck={false}
            />
            <input
              className="port"
              placeholder="22"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary" type="submit">
            Подключиться
          </button>
        </form>
      </section>

      <section className="panel grow">
        <header className="panel-head">
          <IconServer size={14} /> Хосты
        </header>
        <div className="empty">
          Сохранённые хосты, группы и теги появятся на следующем шаге.
        </div>
      </section>
    </aside>
  )
}
