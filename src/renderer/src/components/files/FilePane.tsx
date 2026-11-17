import type React from 'react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { permString, type FileEntry } from '@shared/files'
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconFolderSolid, IconRefresh, IconSearch } from '../Icons'
import { Tile } from '../ui'
import { useOutsideClose } from '../form'

export const DRAG_MIME = 'application/x-vts-files'
export interface DragPayload {
  from: 'local' | 'remote'
  paths: string[]
}

export interface PaneAction {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

type SortKey = 'name' | 'mtime' | 'size' | 'kind'

interface Props {
  kind: 'local' | 'remote'
  title: string
  icon: ReactNode
  path: string
  entries: FileEntry[]
  loading: boolean
  error?: string
  sep: '/' | '\\'
  /** Breadcrumb roots, e.g. Windows drives. */
  roots?: string[]
  onNavigate(path: string): void
  onRefresh(): void
  onOpenFile?(entry: FileEntry): void
  paneActions: PaneAction[]
  itemActions(selected: FileEntry[]): PaneAction[]
  onDropPayload(p: DragPayload): void
  onDropOsFiles?(paths: string[]): void
}

export const joinPath = (dir: string, name: string, sep: '/' | '\\'): string => (dir.endsWith(sep) ? dir + name : dir + sep + name)

export function parentOf(path: string, sep: '/' | '\\'): string {
  if (sep === '/') {
    if (path === '/') return '/'
    const p = path.replace(/\/+$/, '')
    return p.slice(0, p.lastIndexOf('/')) || '/'
  }
  const p = path.replace(/\\+$/, '')
  const i = p.lastIndexOf('\\')
  if (i < 0) return path.endsWith('\\') ? path : `${path}\\`
  const up = p.slice(0, i)
  return /^[A-Za-z]:$/.test(up) ? `${up}\\` : up
}

function crumbs(path: string, sep: '/' | '\\'): Array<{ name: string; path: string }> {
  if (sep === '/') {
    const parts = path.split('/').filter(Boolean)
    return [{ name: '/', path: '/' }, ...parts.map((n, i) => ({ name: n, path: '/' + parts.slice(0, i + 1).join('/') }))]
  }
  const parts = path.split('\\').filter(Boolean)
  return parts.map((n, i) => ({ name: n, path: i === 0 ? `${n}\\` : parts.slice(0, i + 1).join('\\') }))
}

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} Б`
  const u = ['КБ', 'МБ', 'ГБ', 'ТБ']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`
}

const kindOf = (e: FileEntry): string => (e.type === 'dir' ? 'папка' : e.type === 'link' ? 'ссылка' : (/\.([^.]{1,8})$/.exec(e.name)?.[1].toLowerCase() ?? 'файл'))

export function FilePane(props: Props) {
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true })
  const [filter, setFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [dropOver, setDropOver] = useState(false)
  const history = useRef<{ back: string[]; fwd: string[] }>({ back: [], fwd: [] })
  const prevPath = useRef(props.path)
  const actionsRef = useOutsideClose(actionsOpen, () => setActionsOpen(false))
  const menuRef = useOutsideClose(Boolean(menu), () => setMenu(null))

  useEffect(() => {
    if (prevPath.current !== props.path) {
      setSelected(new Set())
      setFilter('')
    }
    prevPath.current = props.path
  }, [props.path])

  const go = (p: string): void => {
    if (p === props.path) return
    history.current.back.push(props.path)
    history.current.fwd = []
    props.onNavigate(p)
  }

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = props.entries.filter((e) => (hidden || !e.name.startsWith('.')) && (!q || e.name.toLowerCase().includes(q)))
    const dir = sort.asc ? 1 : -1
    return list.sort((a, b) => {
      if ((a.type === 'dir') !== (b.type === 'dir')) return a.type === 'dir' ? -1 : 1
      const v =
        sort.key === 'size'
          ? a.size - b.size
          : sort.key === 'mtime'
            ? a.mtime - b.mtime
            : sort.key === 'kind'
              ? kindOf(a).localeCompare(kindOf(b))
              : a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' })
      return v * dir
    })
  }, [props.entries, filter, hidden, sort])

  const selEntries = rows.filter((r) => selected.has(r.name))

  const click = (e: React.MouseEvent, name: string): void => {
    if (e.shiftKey && anchor) {
      const a = rows.findIndex((r) => r.name === anchor)
      const b = rows.findIndex((r) => r.name === name)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      setSelected(new Set(rows.slice(lo, hi + 1).map((r) => r.name)))
    } else if (e.ctrlKey || e.metaKey) {
      const s = new Set(selected)
      if (s.has(name)) s.delete(name)
      else s.add(name)
      setSelected(s)
      setAnchor(name)
    } else {
      setSelected(new Set([name]))
      setAnchor(name)
    }
  }

  const open = (e: FileEntry): void => {
    if (e.type === 'dir') go(joinPath(props.path, e.name, props.sep))
    else props.onOpenFile?.(e)
  }

  const header = (key: SortKey, label: string) => (
    <button className={`th ${sort.key === key ? 'on' : ''}`} onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}>
      {label}
      {sort.key === key && <IconChevronDown size={13} style={{ transform: sort.asc ? 'rotate(180deg)' : undefined }} />}
    </button>
  )

  const allCrumbs = crumbs(props.path, props.sep)
  const multiRoot = Boolean(props.roots && props.roots.length > 1)

  return (
    <section
      className={`fpane ${dropOver ? 'drop-over' : ''}`}
      onDragOver={(e) => {
        const types = e.dataTransfer.types
        const fromOther = types.includes(DRAG_MIME) && !types.includes(`${DRAG_MIME}-${props.kind}`)
        const osFiles = types.includes('Files') && !types.includes(DRAG_MIME) && Boolean(props.onDropOsFiles)
        if (fromOther || osFiles) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDropOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOver(false)
      }}
      onDrop={(e) => {
        setDropOver(false)
        const raw = e.dataTransfer.getData(DRAG_MIME)
        if (raw) {
          e.preventDefault()
          const p = JSON.parse(raw) as DragPayload
          if (p.from !== props.kind) props.onDropPayload(p)
          return
        }
        if (e.dataTransfer.files.length && props.onDropOsFiles) {
          e.preventDefault()
          props.onDropOsFiles([...e.dataTransfer.files].map((f) => window.api.local.pathForFile(f)).filter(Boolean))
        }
      }}
    >
      <header className="fpane-head">
        <Tile tone={props.kind === 'local' ? 'blue' : 'green'} size={34}>
          {props.icon}
        </Tile>
        <span className="fpane-title">{props.title}</span>
        <span className="toolbar-spacer" />
        {filterOpen ? (
          <label className="pane-filter">
            <IconSearch size={15} />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setFilter(''), setFilterOpen(false))}
              onBlur={() => !filter && setFilterOpen(false)}
              placeholder="Фильтр"
            />
          </label>
        ) : (
          <button className="tool" onClick={() => setFilterOpen(true)}>
            <IconSearch size={17} /> Фильтр
          </button>
        )}
        <div className="more" ref={actionsRef}>
          <button className="tool" onClick={() => setActionsOpen((o) => !o)}>
            Действия <IconChevronDown size={15} />
          </button>
          {actionsOpen && (
            <div className="popover right">
              {[...props.paneActions, { label: hidden ? 'Не показывать скрытые' : 'Показать скрытые файлы', onClick: () => setHidden((h) => !h) }].map((a) => (
                <button key={a.label} disabled={a.disabled} className={(a as PaneAction).danger ? 'danger' : ''} onClick={() => (setActionsOpen(false), a.onClick())}>
                  <span className="pop-label">{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      <div className="crumbs">
        <button
          className="icon-btn"
          title="Назад"
          disabled={!history.current.back.length}
          onClick={() => {
            const p = history.current.back.pop()
            if (p) {
              history.current.fwd.push(props.path)
              props.onNavigate(p)
            }
          }}
        >
          <IconChevronLeft size={18} />
        </button>
        <button
          className="icon-btn"
          title="Вперёд"
          disabled={!history.current.fwd.length}
          onClick={() => {
            const p = history.current.fwd.pop()
            if (p) {
              history.current.back.push(props.path)
              props.onNavigate(p)
            }
          }}
        >
          <IconChevronRight size={18} />
        </button>
        <div className="crumb-list">
          {multiRoot && (
            <select className="drive" value={allCrumbs[0]?.path} onChange={(e) => go(e.target.value)}>
              {props.roots!.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/\\$/, '')}
                </option>
              ))}
            </select>
          )}
          {allCrumbs.slice(multiRoot ? 1 : 0).map((c, i, all) => (
            <span key={c.path} className="crumb-item">
              {(i > 0 || multiRoot) && <IconChevronRight size={13} className="muted" />}
              <button onClick={() => go(c.path)} className={i === all.length - 1 ? 'cur' : ''}>
                <IconFolderSolid size={18} className="crumb-folder" />
                {c.name}
              </button>
            </span>
          ))}
        </div>
        <button className="icon-btn" title="Обновить" onClick={props.onRefresh}>
          <IconRefresh size={17} className={props.loading ? 'spin-svg' : ''} />
        </button>
      </div>
      <div className="ftable">
        <div className="ftable-head">
          {header('name', 'Имя')}
          {header('mtime', 'Изменён')}
          {header('size', 'Размер')}
          {header('kind', props.kind === 'remote' ? 'Права' : 'Тип')}
        </div>
        <div
          className="ftable-body"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') go(parentOf(props.path, props.sep))
            if (e.key === 'Enter' && selEntries.length === 1) open(selEntries[0])
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
              e.preventDefault()
              setSelected(new Set(rows.map((r) => r.name)))
            }
            if (e.key === 'Delete' && selEntries.length) props.itemActions(selEntries).find((a) => a.danger)?.onClick()
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY })
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(new Set())
          }}
        >
          {props.path !== parentOf(props.path, props.sep) && (
            <div className="frow" onDoubleClick={() => go(parentOf(props.path, props.sep))}>
              <span className="fname">
                <IconFolderSolid size={22} className="crumb-folder" /> ..
              </span>
            </div>
          )}
          {rows.map((e) => (
            <div
              key={e.name}
              className={`frow ${selected.has(e.name) ? 'sel' : ''}`}
              onMouseDown={(ev) => {
                if (ev.button === 2 && selected.has(e.name)) return
                click(ev, e.name)
              }}
              onDoubleClick={() => open(e)}
              draggable
              onDragStart={(ev) => {
                const names = selected.has(e.name) ? [...selected] : [e.name]
                if (!selected.has(e.name)) setSelected(new Set([e.name]))
                const payload: DragPayload = { from: props.kind, paths: names.map((n) => joinPath(props.path, n, props.sep)) }
                ev.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
                ev.dataTransfer.setData(`${DRAG_MIME}-${props.kind}`, '1')
                ev.dataTransfer.effectAllowed = 'copy'
              }}
            >
              <span className="fname" title={e.name}>
                {e.type === 'dir' ? <IconFolderSolid size={22} className="crumb-folder" /> : <span className={`ficon ${e.type}`} />}
                <span className="fname-text">{e.name}</span>
              </span>
              <span className="fcell">{e.mtime ? new Date(e.mtime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>
              <span className="fcell">{e.type === 'dir' ? '--' : fmtSize(e.size)}</span>
              <span className="fcell mono-sm">{props.kind === 'remote' ? permString(e.mode, e.type) : kindOf(e)}</span>
            </div>
          ))}
          {!props.loading && !props.error && rows.length === 0 && <div className="ftable-empty">{filter ? 'Ничего не найдено' : 'Пустая папка'}</div>}
          {props.error && <div className="ftable-empty err">{props.error}</div>}
        </div>
      </div>
      {menu && (
        <div className="popover ctx" ref={menuRef} style={{ left: menu.x, top: menu.y }}>
          {(selEntries.length ? props.itemActions(selEntries) : props.paneActions).map((a) => (
            <button key={a.label} disabled={a.disabled} className={a.danger ? 'danger' : ''} onClick={() => (setMenu(null), a.onClick())}>
              <span className="pop-label">{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
