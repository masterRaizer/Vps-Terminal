import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import { useSessions, type Tab } from '@/store/sessions'
import { attachData, claimStatus } from '@/lib/sessionBus'
import { termThemes } from '@/lib/termThemes'
import { IconClose, IconRefresh, IconSearch } from './Icons'

interface Props {
  tab: Tab
  active: boolean
}

export function TerminalView({ tab, active }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const sessionRef = useRef<string | undefined>(undefined)
  const theme = useSessions((s) => s.theme)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  // Create the xterm instance once per tab.
  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"Cascadia Mono", "JetBrains Mono", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.15,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowProposedApi: true,
      theme: termThemes[useSessions.getState().theme]
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.open(hostRef.current!)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      /* WebGL unavailable — DOM renderer is used */
    }
    fit.fit()

    // Clipboard: Ctrl+Shift+C / Ctrl+Shift+V, Ctrl+Shift+F for search.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !e.ctrlKey || !e.shiftKey) return true
      const k = e.key.toLowerCase()
      if (k === 'c') {
        const sel = term.getSelection()
        if (sel) void navigator.clipboard.writeText(sel)
        return false
      }
      if (k === 'v') {
        void navigator.clipboard.readText().then((t) => term.paste(t))
        return false
      }
      if (k === 'f') {
        setSearchOpen(true)
        return false
      }
      return true
    })
    // Right click pastes (copy happens via selection + Ctrl+Shift+C).
    const onContext = (e: MouseEvent): void => {
      e.preventDefault()
      const sel = term.getSelection()
      if (sel) {
        void navigator.clipboard.writeText(sel)
        term.clearSelection()
      } else {
        void navigator.clipboard.readText().then((t) => term.paste(t))
      }
    }
    hostRef.current!.addEventListener('contextmenu', onContext)

    term.onData((d) => {
      if (sessionRef.current) window.api.ssh.write(sessionRef.current, d)
    })
    term.onResize(({ cols, rows }) => {
      if (sessionRef.current) window.api.ssh.resize(sessionRef.current, cols, rows)
    })

    termRef.current = term
    fitRef.current = fit
    searchRef.current = search

    const ro = new ResizeObserver(() => {
      if (hostRef.current && hostRef.current.offsetParent !== null) fit.fit()
    })
    ro.observe(hostRef.current!)

    const el = hostRef.current!
    return () => {
      ro.disconnect()
      el.removeEventListener('contextmenu', onContext)
      term.dispose()
      termRef.current = null
    }
  }, [])

  // Connect (and reconnect when `attempt` changes).
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const { patchTab, takePassword } = useSessions.getState()
    const password = takePassword(tab.id)
    let detach: (() => void) | undefined
    let cancelled = false

    term.writeln(`\x1b[2mПодключение к ${tab.params.username}@${tab.params.host}:${tab.params.port}…\x1b[0m`)
    patchTab(tab.id, { status: 'connecting', message: undefined })

    window.api.ssh
      .connect({ ...tab.params, password, cols: term.cols, rows: term.rows })
      .then((sessionId) => {
        if (cancelled) {
          window.api.ssh.disconnect(sessionId)
          return
        }
        sessionRef.current = sessionId
        detach = attachData(sessionId, (d) => term.write(d))
        const early = claimStatus(sessionId)
        patchTab(tab.id, {
          sessionId,
          ...(early ? { status: early.status, message: early.message } : {})
        })
      })
      .catch((e: Error) => patchTab(tab.id, { status: 'error', message: e.message }))

    return () => {
      cancelled = true
      detach?.()
      if (sessionRef.current) window.api.ssh.disconnect(sessionRef.current)
      sessionRef.current = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.attempt])

  // Print disconnect / error notices into the buffer.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    if (tab.status === 'error') term.writeln(`\r\n\x1b[31m✖ ${tab.message ?? 'Ошибка соединения'}\x1b[0m`)
    if (tab.status === 'closed') term.writeln('\r\n\x1b[33m● Соединение закрыто\x1b[0m')
  }, [tab.status, tab.message])

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = termThemes[theme]
  }, [theme])

  // Take keyboard focus once the shell is ready (e.g. after the host-key dialog closes).
  useEffect(() => {
    if (active && tab.status === 'ready') termRef.current?.focus()
  }, [active, tab.status])

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        fitRef.current?.fit()
        termRef.current?.focus()
      })
    }
  }, [active])

  const runSearch = (dir: 'next' | 'prev'): void => {
    if (!query) return
    const opts = { caseSensitive: false, decorations: undefined }
    if (dir === 'next') searchRef.current?.findNext(query, opts)
    else searchRef.current?.findPrevious(query, opts)
  }

  const disconnected = tab.status === 'closed' || tab.status === 'error'

  return (
    <div className="term-pane" style={{ display: active ? 'flex' : 'none' }}>
      {searchOpen && (
        <div className="term-search">
          <IconSearch size={14} />
          <input
            autoFocus
            placeholder="Поиск в выводе"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch(e.shiftKey ? 'prev' : 'next')
              if (e.key === 'Escape') {
                setSearchOpen(false)
                searchRef.current?.clearDecorations()
                termRef.current?.focus()
              }
            }}
          />
          <button className="icon-btn" title="Назад (Shift+Enter)" onClick={() => runSearch('prev')}>
            ↑
          </button>
          <button className="icon-btn" title="Вперёд (Enter)" onClick={() => runSearch('next')}>
            ↓
          </button>
          <button
            className="icon-btn"
            title="Закрыть"
            onClick={() => {
              setSearchOpen(false)
              termRef.current?.focus()
            }}
          >
            <IconClose size={14} />
          </button>
        </div>
      )}
      <div className="term-host" ref={hostRef} />
      {disconnected && <ReconnectBar tab={tab} />}
    </div>
  )
}

function ReconnectBar({ tab }: { tab: Tab }) {
  const [password, setPassword] = useState('')
  const reconnect = useSessions((s) => s.reconnect)
  return (
    <form
      className="reconnect-bar"
      onSubmit={(e) => {
        e.preventDefault()
        reconnect(tab.id, password)
        setPassword('')
      }}
    >
      <span className={`dot dot-${tab.status}`} />
      <span className="reconnect-text">
        {tab.status === 'error' ? 'Ошибка подключения' : 'Сессия завершена'}
      </span>
      <input
        type="password"
        placeholder="Пароль"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="off"
      />
      <button className="btn btn-primary" type="submit">
        <IconRefresh size={14} /> Переподключить
      </button>
    </form>
  )
}
