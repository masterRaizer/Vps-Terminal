import { useCallback, useEffect, useState } from 'react'
import type { FileEntry, Listing } from '@shared/files'
import { useSftp, type PaneSource } from '@/store/sftp'
import { errorText } from '@/lib/errors'
import { askText } from '@/components/InputDialog'
import { askChmod } from '@/components/files/ChmodDialog'
import { FilePane, fmtSize, joinPath, type DragPayload, type PaneAction } from '@/components/files/FilePane'
import { PaneHostPicker } from '@/components/files/PaneHostPicker'
import { Flag } from '@/components/Flag'
import { IconClose, IconFolder, IconLaptop, IconServer } from '@/components/Icons'

const localSep: '/' | '\\' = navigator.userAgent.includes('Windows') ? '\\' : '/'
type Side = 0 | 1
const sepOf = (src: PaneSource | null): '/' | '\\' => (src?.kind === 'local' ? localSep : '/')

export function SftpPage() {
  const [notice, setNotice] = useState<string>()
  const [refresh, setRefresh] = useState(0)
  const doneCount = useSftp((s) => s.transfers.filter((t) => t.status === 'done').length)
  useEffect(() => {
    if (doneCount) setRefresh((r) => r + 1)
  }, [doneCount])

  /** Copies paths from one side into the other side's current folder. */
  const transfer = async (from: Side, paths: string[]): Promise<void> => {
    const { panes } = useSftp.getState()
    const src = panes[from].source
    const dst = panes[from === 0 ? 1 : 0]
    if (!src || !dst.source || !dst.path) return setNotice('Откройте папку назначения во второй панели')
    try {
      if (src.kind === 'local' && dst.source.kind === 'remote') await window.api.sftp.upload(dst.source.sftpId, paths, dst.path)
      else if (src.kind === 'remote' && dst.source.kind === 'local') await window.api.sftp.download(src.sftpId, paths, dst.path)
      else setNotice(src.kind === 'local' ? 'Обе панели локальные — откройте хост в одной из них' : 'Копирование между двумя серверами появится позже: скачайте файл, затем загрузите')
    } catch (e) {
      setNotice(errorText(e))
    }
  }

  return (
    <div className="sftp-wrap">
      {notice && (
        <div className="notice sftp-notice" role="status">
          {notice}
          <button className="icon-btn" onClick={() => setNotice(undefined)} aria-label="Скрыть">
            ×
          </button>
        </div>
      )}
      <div className="sftp">
        <SftpSide side={0} onTransfer={transfer} onNotice={setNotice} refresh={refresh} />
        <SftpSide side={1} onTransfer={transfer} onNotice={setNotice} refresh={refresh} />
      </div>
      <TransferBar />
    </div>
  )
}

function SftpSide({ side, onTransfer, onNotice, refresh }: { side: Side; onTransfer: (from: Side, paths: string[]) => Promise<void>; onNotice: (m: string) => void; refresh: number }) {
  const pane = useSftp((s) => s.panes[side])
  const other = useSftp((s) => s.panes[side === 0 ? 1 : 0])
  const { patch, setLocal, connect, disconnect } = useSftp.getState()
  const src = pane.source
  const sep = sepOf(src)
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [roots, setRoots] = useState<string[]>([])
  const fail = (e: unknown): void => onNotice(errorText(e))

  const load = useCallback(
    async (p: string) => {
      const s = useSftp.getState().panes[side].source
      if (!s) return
      setLoading(true)
      setError(undefined)
      try {
        const l = s.kind === 'local' ? await window.api.local.list(p) : await window.api.sftp.list(s.sftpId, p)
        setListing(l)
        useSftp.getState().patch(side, { path: l.path })
      } catch (e) {
        setError(errorText(e))
        setListing({ path: p, entries: [] })
        useSftp.getState().patch(side, { path: p })
      } finally {
        setLoading(false)
      }
    },
    [side]
  )

  // (Re)open the start folder whenever the source changes.
  const srcKey = src ? (src.kind === 'local' ? 'local' : src.sftpId) : ''
  useEffect(() => {
    setListing(null)
    if (!src) return
    void (async () => {
      if (src.kind === 'local') {
        setRoots(await window.api.local.roots())
        void load(await window.api.local.home())
      } else void load(src.home)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcKey])

  useEffect(() => {
    if (refresh && pane.path && src) void load(pane.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  if (pane.picking || (!src && !pane.connecting && pane.picking)) {
    return (
      <section className="fpane">
        <PaneHostPicker onPick={(h) => void connect(side, h)} onLocal={() => setLocal(side)} onBack={() => patch(side, { picking: false })} />
      </section>
    )
  }

  if (!src || !listing) {
    return (
      <section className="fpane remote">
        <div className="empty-state">
          <span className="empty-icon">
            <IconFolder size={26} />
          </span>
          <h3>{pane.connecting ? `Подключение к ${pane.connecting}…` : src ? 'Загрузка…' : 'Подключитесь к хосту'}</h3>
          <p>{pane.error ?? 'Выберите сохранённый хост, чтобы управлять файлами по SFTP, или откройте локальные файлы.'}</p>
          {!src && (
            <button className="btn-soft" onClick={() => patch(side, { picking: true })} disabled={Boolean(pane.connecting)}>
              Выбрать хост
            </button>
          )}
        </div>
      </section>
    )
  }

  const path = listing.path
  const otherName = other.source ? (other.source.kind === 'local' ? 'на компьютер' : `на ${other.source.label}`) : null
  const canSend = Boolean(other.source && other.path && other.source.kind !== src.kind)
  const isRemote = src.kind === 'remote'

  const itemActions = (sel: FileEntry[]): PaneAction[] => [
    {
      label: `${isRemote ? 'Скачать' : 'Загрузить'} ${otherName ?? ''}${sel.length > 1 ? ` (${sel.length})` : ''}`.trim(),
      disabled: !canSend,
      onClick: () => void onTransfer(side, sel.map((e) => joinPath(path, e.name, sep)))
    },
    ...(isRemote ? [] : [{ label: 'Открыть', disabled: sel.length !== 1 || sel[0].type === 'dir', onClick: () => void window.api.local.open(joinPath(path, sel[0].name, sep)).catch(fail) }]),
    {
      label: 'Переименовать',
      disabled: sel.length !== 1,
      onClick: async () => {
        const n = await askText({ title: 'Переименовать', value: sel[0].name, okText: 'Переименовать' })
        if (!n || n === sel[0].name || n.includes('/') || (!isRemote && n.includes('\\'))) return
        const a = joinPath(path, sel[0].name, sep)
        const b = joinPath(path, n, sep)
        await (isRemote ? window.api.sftp.rename(src.sftpId, a, b) : window.api.local.rename(a, b)).catch(fail)
        void load(path)
      }
    },
    ...(isRemote
      ? [
          {
            label: 'Права доступа…',
            disabled: sel.length !== 1 || sel[0].mode === null,
            onClick: async () => {
              const m = await askChmod(sel[0].name, sel[0].mode ?? 0o644)
              if (m !== null) await window.api.sftp.chmod(src.sftpId, joinPath(path, sel[0].name, '/'), m).catch(fail)
              void load(path)
            }
          }
        ]
      : []),
    {
      label: isRemote ? 'Удалить' : 'В корзину',
      danger: true,
      onClick: async () => {
        const names = sel.map((s) => s.name).join(', ')
        if (!window.confirm(isRemote ? `Удалить на сервере без возможности восстановления: ${names}?` : `Переместить в корзину: ${names}?`)) return
        for (const e of sel) await (isRemote ? window.api.sftp.remove(src.sftpId, joinPath(path, e.name, '/')) : window.api.local.trash(joinPath(path, e.name, sep))).catch(fail)
        void load(path)
      }
    }
  ]

  const newFolder = async (): Promise<void> => {
    const n = await askText({ title: 'Новая папка', value: 'Новая папка', okText: 'Создать' })
    if (!n || n.includes('/')) return
    const p = joinPath(path, n, sep)
    await (isRemote ? window.api.sftp.mkdir(src.sftpId, p) : window.api.local.mkdir(p)).catch(fail)
    void load(path)
  }

  return (
    <FilePane
      kind={src.kind}
      title={isRemote ? src.label : 'Локально'}
      icon={isRemote ? <IconServer size={18} /> : <IconLaptop size={18} />}
      titleExtra={isRemote && src.country ? <Flag cc={src.country} size={18} /> : undefined}
      path={path}
      entries={listing.entries}
      loading={loading}
      error={error}
      sep={sep}
      roots={isRemote ? undefined : roots}
      onNavigate={(p) => void load(p)}
      onRefresh={() => void load(path)}
      onOpenFile={(e) => (isRemote ? void onTransfer(side, [joinPath(path, e.name, '/')]) : void window.api.local.open(joinPath(path, e.name, sep)).catch(fail))}
      paneActions={[
        { label: 'Новая папка', onClick: () => void newFolder() },
        { label: 'Домашняя папка', onClick: async () => void load(isRemote ? src.home : await window.api.local.home()) },
        { label: 'Обновить', onClick: () => void load(path) },
        { label: 'Выбрать другой хост…', onClick: () => patch(side, { picking: true }) },
        ...(isRemote ? [{ label: 'Отключиться', danger: true, onClick: () => disconnect(side) }] : [])
      ]}
      itemActions={itemActions}
      onDropPayload={(p: DragPayload) => void onTransfer(side === 0 ? 1 : 0, p.paths)}
      onDropOsFiles={isRemote ? (paths) => void window.api.sftp.upload(src.sftpId, paths, path).catch(fail) : undefined}
    />
  )
}

function TransferBar() {
  const { transfers, clearFinished } = useSftp()
  if (!transfers.length) return null
  return (
    <div className="transfers">
      <div className="tr-head">
        <span>Передачи</span>
        <span className="toolbar-spacer" />
        <button className="link-btn" onClick={clearFinished}>
          Очистить завершённые
        </button>
      </div>
      {transfers
        .slice(-5)
        .reverse()
        .map((t) => {
          const pct = t.total ? Math.min(100, Math.round((t.transferred / t.total) * 100)) : t.status === 'done' ? 100 : 0
          return (
            <div key={t.id} className={`tr-row st-${t.status}`}>
              <span className="tr-dir">{t.direction === 'upload' ? '↑' : '↓'}</span>
              <span className="tr-name" title={t.name}>
                {t.name}
              </span>
              <span className="tr-bar">
                <span style={{ width: `${pct}%` }} />
              </span>
              <span className="tr-info">{t.status === 'error' ? (t.message ?? 'ошибка') : t.status === 'cancelled' ? 'отменено' : `${fmtSize(t.transferred)} / ${fmtSize(t.total)}`}</span>
              {t.status === 'running' ? (
                <button className="icon-btn small" title="Отменить" onClick={() => window.api.sftp.cancel(t.id)}>
                  <IconClose size={14} />
                </button>
              ) : (
                <span className="tr-pad" />
              )}
            </div>
          )
        })}
    </div>
  )
}
