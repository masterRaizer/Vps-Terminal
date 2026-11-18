import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import { useSessions, type Tab } from '@/store/sessions'
import { attachData, claimStatus } from '@/lib/sessionBus'
import { termRegistry } from '@/lib/termRegistry'
import { DEFAULT_TERM_THEME, fontStack, termThemeById } from '@/lib/termThemes'
import { FOCUS_TERM_SEARCH } from './TermSidePanel'
import { errorText } from '@/lib/errors'
import { useVault } from '@/store/vault'
import { fillSnippet, toShellInput } from '@shared/snippets'
import { usePassphrasePrompt } from './PassphrasePrompt'
import { IconLock, IconRefresh } from './Icons'

interface Props {
  tab: Tab
  active: boolean
  /** Position inside the terminal area; null hides the pane (it stays mounted). */
  rect: { left: string; top: string; width: string; height: string } | null
  inSplit: boolean
}

const themeOf = (id: string) => (termThemeById(id) ?? termThemeById(DEFAULT_TERM_THEME)!).theme

export function TerminalView({ tab, active, rect, inSplit }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionRef = useRef<string | undefined>(undefined)
  const globalTheme = useSessions((s) => s.termTheme)
  const themeId = tab.termTheme ?? globalTheme
  const fontSize = useSessions((s) => s.fontSize)
  const termFont = useSessions((s) => s.termFont)

  // Create the xterm instance once per tab.
  useEffect(() => {
    const { termTheme: gTheme, fontSize: fs, termFont } = useSessions.getState()
    const termTheme = tab.termTheme ?? gTheme
    const term = new Terminal({
      fontFamily: fontStack(termFont),
      fontSize: fs,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 40000,
      drawBoldTextInBrightColors: false,
      allowProposedApi: true,
      theme: themeOf(termTheme)
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.open(hostRef.current!)
    void document.fonts.load('14px "Source Code Pro"').then(() => fit.fit())
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      /* WebGL unavailable — DOM renderer is used */
    }
    fit.fit()

    term.attachCustomKeyEventHandler((e) => {
      if (tab.backspaceCtrlH && e.type === 'keydown' && e.key === 'Backspace' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (sessionRef.current) window.api.ssh.write(sessionRef.current, '\x08')
        e.preventDefault()
        return false
      }
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
      if (k === 'd' || k === 'e') {
        void useSessions.getState().split(k === 'd' ? 'row' : 'col')
        return false
      }
      if (k === 'w') {
        useSessions.getState().closeTab(tab.id)
        return false
      }
      if (k === 'f') {
        useSessions.getState().setSideTab('quick')
        setTimeout(() => window.dispatchEvent(new Event(FOCUS_TERM_SEARCH)), 0)
        return false
      }
      return true
    })
    // Right click: copy the selection if there is one, otherwise paste.
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
    const el = hostRef.current!
    el.addEventListener('contextmenu', onContext)

    term.onData((d) => {
      if (sessionRef.current) window.api.ssh.write(sessionRef.current, d)
    })
    term.onResize(({ cols, rows }) => {
      if (sessionRef.current) window.api.ssh.resize(sessionRef.current, cols, rows)
    })

    termRef.current = term
    fitRef.current = fit
    termRegistry.set(tab.id, { term, search })

    const ro = new ResizeObserver(() => {
      if (el.offsetParent !== null) fit.fit()
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      el.removeEventListener('contextmenu', onContext)
      termRegistry.delete(tab.id)
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Connect (and reconnect when `attempt` changes).
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const { patchTab, takePassword, log } = useSessions.getState()
    const password = takePassword(tab.id)
    const cur = useSessions.getState().tabs.find((t) => t.id === tab.id)
    const passphrase = cur?.pendingPassphrase
    const rememberPassphrase = cur?.rememberPassphrase
    if (passphrase) patchTab(tab.id, { pendingPassphrase: undefined, rememberPassphrase: undefined })
    let detach: (() => void) | undefined
    let cancelled = false
    const target = `${tab.params.username}@${tab.params.host}:${tab.params.port}`

    term.writeln(`\x1b[2mПодключение к ${target}…\x1b[0m`)
    patchTab(tab.id, { status: 'connecting', message: undefined })

    const started = tab.hostId
      ? window.api.ssh.connectHost({ hostId: tab.hostId, password, passphrase, rememberPassphrase, cols: term.cols, rows: term.rows })
      : window.api.ssh.connect({ ...tab.params, password, cols: term.cols, rows: term.rows })
    started
      .then((sessionId) => {
        if (cancelled) {
          window.api.ssh.disconnect(sessionId)
          return
        }
        sessionRef.current = sessionId
        detach = attachData(sessionId, (d) => term.write(d))
        const early = claimStatus(sessionId)
        patchTab(tab.id, { sessionId, ...(early ? { status: early.status, message: early.message } : {}) })
        if (early) log({ target, status: early.status, message: early.message })
      })
      .catch((e: unknown) => {
        const raw = errorText(e)
        const need = /\[\[(NEED|BAD)_PASSPHRASE:([^:\]]+):([^\]]*)\]\]\s*/.exec(raw)
        const message = raw.replace(/\[\[[^\]]*\]\]\s*/, '')
        patchTab(tab.id, { status: 'error', message })
        log({ target, status: 'error', message })
        if (need) usePassphrasePrompt.getState().ask({ tabId: tab.id, keyLabel: need[3], wrong: need[1] === 'BAD' })
      })

    return () => {
      cancelled = true
      detach?.()
      if (sessionRef.current) window.api.ssh.disconnect(sessionRef.current)
      sessionRef.current = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.attempt])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    if (tab.status === 'error') term.writeln(`\r\n\x1b[31m✖ ${tab.message ?? 'Ошибка соединения'}\x1b[0m`)
    if (tab.status === 'closed') term.writeln('\r\n\x1b[33m● Соединение закрыто\x1b[0m')
  }, [tab.status, tab.message])

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = themeOf(themeId)
  }, [themeId])

  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.fontSize = fontSize
    termRef.current.options.fontFamily = fontStack(termFont)
    fitRef.current?.fit()
  }, [fontSize, termFont])

  useEffect(() => {
    if (active && tab.status === 'ready') termRef.current?.focus()
  }, [active, tab.status])

  // Startup snippet: once per (re)connect, when the shell is ready.
  const startupSent = useRef(0)
  useEffect(() => {
    if (tab.status !== 'ready' || !tab.hostId || startupSent.current === tab.attempt) return
    startupSent.current = tab.attempt
    const v = useVault.getState()
    const sid = v.hosts.find((h) => h.id === tab.hostId)?.options.startupSnippetId
    const sn = sid ? v.snippets.find((x) => x.id === sid) : undefined
    if (sn && tab.sessionId) {
      const cmd = fillSnippet(sn.command, {})
      setTimeout(() => {
        if (tab.sessionId) {
          window.api.ssh.write(tab.sessionId, toShellInput(cmd, true))
          window.api.snippets.record(sn.id, tab.hostId ?? null, cmd)
        }
      }, 300)
    }
  }, [tab.status, tab.attempt, tab.hostId, tab.sessionId])

  const rectKey = rect ? `${rect.left}|${rect.top}|${rect.width}|${rect.height}` : ''
  useEffect(() => {
    if (rectKey) requestAnimationFrame(() => fitRef.current?.fit())
  }, [rectKey])

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        fitRef.current?.fit()
        termRef.current?.focus()
      })
    }
  }, [active])

  const disconnected = tab.status === 'closed' || tab.status === 'error'
  const bg = themeOf(themeId).background

  return (
    <div
      className={`term-pane ${inSplit ? 'in-split' : ''} ${inSplit && active ? 'focused' : ''}`}
      style={rect ? { display: 'flex', background: bg, ...rect } : { display: 'none' }}
      onMouseDownCapture={() => !active && useSessions.getState().activate(tab.id)}
    >
      {inSplit && (
        <div className="pane-head">
          <span className={`dot dot-${tab.status}`} />
          {tab.title}
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
        reconnect(tab.id, tab.needsPassword ? password : undefined)
        setPassword('')
      }}
    >
      <span className={`dot dot-${tab.status}`} />
      <span className="reconnect-text">
        {tab.status === 'error' ? `Ошибка: ${tab.message ?? 'не удалось подключиться'}` : 'Сессия завершена'}
      </span>
      {tab.needsPassword && (
        <label className="rc-input">
          <IconLock size={15} />
          <input type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        </label>
      )}
      <button className="btn-cta small" type="submit">
        <IconRefresh size={16} /> Переподключить
      </button>
    </form>
  )
}
