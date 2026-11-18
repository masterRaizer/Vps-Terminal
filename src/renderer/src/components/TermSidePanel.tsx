import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useSessions, type SideTab } from '@/store/sessions'
import { useVault } from '@/store/vault'
import { useSftp } from '@/store/sftp'
import { termRegistry } from '@/lib/termRegistry'
import { TERM_FONTS, TERM_THEMES, type TermTheme } from '@/lib/termThemes'
import { EmptyState } from './ui'
import { sendToTerminal } from '@/lib/runSnippet'
import type { SnippetRun } from '@shared/vault'
import { IconBraces, IconChevronDown, IconClock, IconMinus, IconPalette, IconPlay, IconPlus, IconRocket, IconSearch } from './Icons'

export const FOCUS_TERM_SEARCH = 'vts:focus-term-search'

const TABS: Array<{ id: SideTab; title: string; icon: JSX.Element }> = [
  { id: 'quick', title: 'Быстрые действия', icon: <IconRocket size={18} /> },
  { id: 'snippets', title: 'Сниппеты', icon: <IconBraces size={18} /> },
  { id: 'history', title: 'История', icon: <IconClock size={18} /> },
  { id: 'themes', title: 'Оформление', icon: <IconPalette size={18} /> }
]

export function TermSidePanel() {
  const sideTab = useSessions((s) => s.sideTab)
  const setSideTab = useSessions((s) => s.setSideTab)
  return (
    <aside className="sidepanel">
      <div className="sp-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`sp-tab ${sideTab === t.id ? 'active' : ''}`} title={t.title} onClick={() => setSideTab(t.id)}>
            {t.icon}
          </button>
        ))}
      </div>
      <div className="sp-body">
        {sideTab === 'quick' && <QuickPanel />}
        {sideTab === 'snippets' && <SnippetsPanel />}
        {sideTab === 'history' && <HistoryPanel />}
        {sideTab === 'themes' && <ThemesPanel />}
      </div>
    </aside>
  )
}

function QuickPanel() {
  const activeId = useSessions((s) => s.activeId)
  const hostId = useSessions((s) => s.tabs.find((t) => t.id === s.activeId)?.hostId)
  const [q, setQ] = useState('')
  const [miss, setMiss] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const focus = (): void => inputRef.current?.focus()
    window.addEventListener(FOCUS_TERM_SEARCH, focus)
    return () => window.removeEventListener(FOCUS_TERM_SEARCH, focus)
  }, [])

  const find = (dir: 'next' | 'prev'): void => {
    const h = activeId ? termRegistry.get(activeId) : undefined
    if (!h || !q) return
    const ok = dir === 'next' ? h.search.findNext(q) : h.search.findPrevious(q)
    setMiss(!ok)
  }
  const handle = activeId ? termRegistry.get(activeId) : undefined

  return (
    <>
      <div className={`sp-search ${miss ? 'miss' : ''}`}>
        <IconSearch size={17} />
        <input
          ref={inputRef}
          value={q}
          placeholder="Поиск в терминале — Ctrl+Shift+F"
          onChange={(e) => {
            setQ(e.target.value)
            setMiss(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') find(e.shiftKey ? 'prev' : 'next')
            if (e.key === 'Escape') {
              handle?.search.clearDecorations()
              handle?.term.focus()
            }
          }}
        />
        <button className="icon-btn" title="Назад (Shift+Enter)" onClick={() => find('prev')}>
          <IconChevronDown size={16} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button className="icon-btn" title="Вперёд (Enter)" onClick={() => find('next')}>
          <IconChevronDown size={16} />
        </button>
      </div>
      <h3 className="sp-heading">Действия</h3>
      <div className="sp-actions">
        <div className="sp-split">
          <button className="sp-action" onClick={() => void useSessions.getState().split('row')} title="Ctrl+Shift+D">
            Разделить вправо <kbd>Ctrl Shift D</kbd>
          </button>
          <button className="sp-action" onClick={() => void useSessions.getState().split('col')} title="Ctrl+Shift+E">
            Разделить вниз <kbd>Ctrl Shift E</kbd>
          </button>
        </div>
        {hostId && (
          <button
            className="sp-action"
            onClick={() => {
              const h = useVault.getState().hosts.find((x) => x.id === hostId)
              if (!h) return
              useSessions.getState().showSftp()
              useSftp.getState().openHost(h)
            }}
          >
            Открыть файлы (SFTP)
          </button>
        )}
        <button
          className="sp-action"
          onClick={() => {
            const sel = handle?.term.getSelection()
            if (sel) void navigator.clipboard.writeText(sel)
          }}
        >
          Копировать выделение <kbd>Ctrl Shift C</kbd>
        </button>
        <button className="sp-action" onClick={() => void navigator.clipboard.readText().then((t) => handle?.term.paste(t))}>
          Вставить <kbd>Ctrl Shift V</kbd>
        </button>
        <button className="sp-action" onClick={() => handle?.term.clear()}>
          Очистить буфер
        </button>
      </div>
    </>
  )
}

function ThemePreview({ t }: { t: TermTheme }) {
  const c = t.theme
  return (
    <span className="theme-prev" style={{ background: c.background }}>
      <span style={{ background: c.foreground, width: '78%' }} />
      <span style={{ background: c.foreground, width: '92%', opacity: 0.75 }} />
      <span className="tp-row">
        <i style={{ background: c.green }} />
        <i style={{ background: c.blue }} />
        <i style={{ background: c.yellow }} />
        <b style={{ background: c.cursor }} />
      </span>
    </span>
  )
}

function ThemesPanel() {
  const { termTheme, setTermTheme, fontSize, setFontSize, termFont, setTermFont } = useSessions()
  return (
    <>
      <h3 className="sp-heading first">Шрифт</h3>
      <div className="font-list">
        {TERM_FONTS.map((f) => (
          <button key={f.id} className={`font-item ${termFont === f.id ? 'active' : ''}`} onClick={() => setTermFont(f.id)} style={{ fontFamily: f.stack }}>
            <span>{f.name}</span>
            <small>{f.note}</small>
          </button>
        ))}
      </div>
      <div className="sp-font">
        <span>Размер</span>
        <span className="toolbar-spacer" />
        <button className="icon-btn" onClick={() => setFontSize(fontSize - 1)} title="Меньше">
          <IconMinus size={16} />
        </button>
        <span className="font-size">{fontSize}px</span>
        <button className="icon-btn" onClick={() => setFontSize(fontSize + 1)} title="Больше">
          <IconPlus size={16} />
        </button>
      </div>
      <h3 className="sp-heading">Темы</h3>
      <div className="theme-list">
        {TERM_THEMES.map((t) => (
          <button key={t.id} className={`theme-item ${termTheme === t.id ? 'active' : ''}`} onClick={() => setTermTheme(t.id)}>
            <ThemePreview t={t} />
            <span className="theme-text">
              <span className="theme-name">{t.name}</span>
              <span className="theme-note">{t.note}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

function SnippetsPanel() {
  const snippets = useVault((s) => s.snippets)
  const ready = useSessions((s) => s.tabs.find((t) => t.id === s.activeId)?.status === 'ready')
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const list = snippets.filter((s) => !query || `${s.label} ${s.command} ${s.tags.join(' ')}`.toLowerCase().includes(query))
  return (
    <>
      <div className="sp-row sp-row-flex">
        <button
          className="tool"
          onClick={() => {
            useSessions.getState().showVault('snippets')
            useVault.getState().edit({ kind: 'snippet' })
          }}
        >
          <IconBraces size={16} /> Новый сниппет
        </button>
      </div>
      <div className="sp-search small">
        <IconSearch size={15} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" />
      </div>
      {!ready && <p className="hint pad">Сниппеты вставляются в активную подключённую сессию.</p>}
      <div className="snip-list">
        {list.map((s) => (
          <div key={s.id} className="snip-item">
            <button className="snip-main" disabled={!ready} title="Вставить без выполнения" onClick={() => void sendToTerminal(s, false)}>
              <span className="snip-title">
                <IconBraces size={14} /> {s.label}
              </span>
              <span className="snip-cmd">{s.command.split('\n')[0]}</span>
            </button>
            <button className="icon-btn small run" disabled={!ready} title="Выполнить" onClick={() => void sendToTerminal(s, true)}>
              <IconPlay size={14} />
            </button>
          </div>
        ))}
        {!list.length && <EmptyState icon={<IconBraces size={24} />} title={query ? 'Ничего не найдено' : 'Сниппетов нет'} text="Создайте сниппет — он появится здесь." />}
      </div>
    </>
  )
}

function HistoryPanel() {
  const tab = useSessions((s) => s.tabs.find((t) => t.id === s.activeId))
  const [runs, setRuns] = useState<SnippetRun[]>([])
  useEffect(() => {
    let alive = true
    const load = (): void => void window.api.snippets.runs(tab?.hostId ?? null).then((r) => alive && setRuns(r))
    load()
    const t = setInterval(load, 3000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [tab?.hostId])
  if (!runs.length) return <EmptyState icon={<IconClock size={24} />} title="Истории нет" text="Здесь появятся команды, отправленные в этот хост из сниппетов. Набранное вручную не записывается — там могут быть пароли." />
  return (
    <div className="snip-list">
      {runs.map((r) => (
        <button key={r.id} className="snip-main hist" disabled={tab?.status !== 'ready'} onClick={() => void sendToTerminal({ label: 'История', command: r.command }, false, { askVariables: false })}>
          <span className="snip-cmd">{r.command}</span>
          <span className="hist-time">{new Date(r.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
        </button>
      ))}
    </div>
  )
}
