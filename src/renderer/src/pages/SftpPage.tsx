import { useCallback, useEffect, useState } from 'react'
import type { FileEntry, Listing } from '@shared/files'
import { useSftp } from '@/store/sftp'
import { errorText } from '@/lib/errors'
import { askText } from '@/components/InputDialog'
import { askChmod } from '@/components/files/ChmodDialog'
import { FilePane, fmtSize, joinPath, type DragPayload, type PaneAction } from '@/components/files/FilePane'
import { IconClose, IconFolder, IconLaptop, IconServer } from '@/components/Icons'

const localSep = navigator.userAgent.includes('Windows') ? '\\' : '/'

function useListing(list: (p: string) => Promise<Listing>, initial: string | null) {
  const [path, setPath] = useState<string | null>(initial)
  const [data, setData] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const load = useCallback(
    async (p: string) => {
      setLoading(true)
      setError(undefined)
      try {
        const l = await list(p)
        setData(l)
        setPath(l.path)
      } catch (e) {
        setError(errorText(e))
        setPath(p)
        setData({ path: p, entries: [] })
      } finally {
        setLoading(false)
      }
    },
    [list]
  )
  return { path, data, loading, error, load, setPath }
}

export function SftpPage() {
  const sftp = useSftp()
  const [roots, setRoots] = useState<string[]>([])
  const local = useListing(useCallback((p: string) => window.api.local.list(p), []), null)
  const remoteId = sftp.remote?.sftpId
  const remote = useListing(useCallback((p: string) => (remoteId ? window.api.sftp.list(remoteId, p) : Promise.reject(new Error('Нет соединения'))), [remoteId]), null)
  const [notice, setNotice] = useState<string>()

  useEffect(() => {
    void (async () => {
      setRoots(await window.api.local.roots())
      void local.load(await window.api.local.home())
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (sftp.remote) void remote.load(sftp.remote.home)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sftp.remote?.sftpId])

  // Refresh panes when a transfer into them finishes.
  const lastDone = sftp.transfers.filter((t) => t.status === 'done').length
  useEffect(() => {
    if (!lastDone) return
    if (local.path) void local.load(local.path)
    if (remote.path && remoteId) void remote.load(remote.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDone])

  const fail = (e: unknown): void => setNotice(errorText(e))

  const upload = async (paths: string[]): Promise<void> => {
    if (!remoteId || !remote.path) return setNotice('Сначала подключитесь к хосту справа')
    await window.api.sftp.upload(remoteId, paths, remote.path).catch(fail)
  }
  const download = async (paths: string[]): Promise<void> => {
    if (!remoteId || !local.path) return
    await window.api.sftp.download(remoteId, paths, local.path).catch(fail)
  }

  const localActions = (sel: FileEntry[]): PaneAction[] => [
    { label: sel.length > 1 ? `Загрузить на сервер (${sel.length})` : 'Загрузить на сервер', disabled: !remoteId, onClick: () => void upload(sel.map((e) => joinPath(local.path!, e.name, localSep))) },
    { label: 'Открыть', disabled: sel.length !== 1 || sel[0].type === 'dir', onClick: () => void window.api.local.open(joinPath(local.path!, sel[0].name, localSep)).catch(fail) },
    {
      label: 'Переименовать',
      disabled: sel.length !== 1,
      onClick: async () => {
        const n = await askText({ title: 'Переименовать', value: sel[0].name, okText: 'Переименовать' })
        if (n && n !== sel[0].name) await window.api.local.rename(joinPath(local.path!, sel[0].name, localSep), joinPath(local.path!, n, localSep)).catch(fail)
        void local.load(local.path!)
      }
    },
    {
      label: 'В корзину',
      danger: true,
      onClick: async () => {
        if (!window.confirm(`Переместить в корзину: ${sel.map((s) => s.name).join(', ')}?`)) return
        for (const e of sel) await window.api.local.trash(joinPath(local.path!, e.name, localSep)).catch(fail)
        void local.load(local.path!)
      }
    }
  ]

  const remoteActions = (sel: FileEntry[]): PaneAction[] => [
    { label: sel.length > 1 ? `Скачать (${sel.length})` : 'Скачать', onClick: () => void download(sel.map((e) => joinPath(remote.path!, e.name, '/'))) },
    {
      label: 'Переименовать',
      disabled: sel.length !== 1,
      onClick: async () => {
        const n = await askText({ title: 'Переименовать', value: sel[0].name, okText: 'Переименовать' })
        if (n && n !== sel[0].name && !n.includes('/')) await window.api.sftp.rename(remoteId!, joinPath(remote.path!, sel[0].name, '/'), joinPath(remote.path!, n, '/')).catch(fail)
        void remote.load(remote.path!)
      }
    },
    {
      label: 'Права доступа…',
      disabled: sel.length !== 1 || sel[0].mode === null,
      onClick: async () => {
        const m = await askChmod(sel[0].name, sel[0].mode ?? 0o644)
        if (m !== null) await window.api.sftp.chmod(remoteId!, joinPath(remote.path!, sel[0].name, '/'), m).catch(fail)
        void remote.load(remote.path!)
      }
    },
    {
      label: 'Удалить',
      danger: true,
      onClick: async () => {
        if (!window.confirm(`Удалить на сервере без возможности восстановления: ${sel.map((s) => s.name).join(', ')}?`)) return
        for (const e of sel) await window.api.sftp.remove(remoteId!, joinPath(remote.path!, e.name, '/')).catch(fail)
        void remote.load(remote.path!)
      }
    }
  ]

  const newFolder = async (kind: 'local' | 'remote'): Promise<void> => {
    const n = await askText({ title: 'Новая папка', value: 'Новая папка', okText: 'Создать' })
    if (!n) return
    if (kind === 'local') await window.api.local.mkdir(joinPath(local.path!, n, localSep)).catch(fail)
    else if (!n.includes('/')) await window.api.sftp.mkdir(remoteId!, joinPath(remote.path!, n, '/')).catch(fail)
    void (kind === 'local' ? local.load(local.path!) : remote.load(remote.path!))
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
        {local.path ? (
          <FilePane
            kind="local"
            title="Локальный компьютер"
            icon={<IconLaptop size={18} />}
            path={local.path}
            entries={local.data?.entries ?? []}
            loading={local.loading}
            error={local.error}
            sep={localSep}
            roots={roots}
            onNavigate={(p) => void local.load(p)}
            onRefresh={() => void local.load(local.path!)}
            onOpenFile={(e) => void window.api.local.open(joinPath(local.path!, e.name, localSep)).catch(fail)}
            paneActions={[
              { label: 'Новая папка', onClick: () => void newFolder('local') },
              { label: 'Домашняя папка', onClick: async () => void local.load(await window.api.local.home()) },
              { label: 'Обновить', onClick: () => void local.load(local.path!) }
            ]}
            itemActions={localActions}
            onDropPayload={(p: DragPayload) => void download(p.paths)}
          />
        ) : (
          <section className="fpane" />
        )}
        {sftp.remote && remote.path ? (
          <FilePane
            kind="remote"
            title={sftp.remote.label}
            icon={<IconServer size={18} />}
            path={remote.path}
            entries={remote.data?.entries ?? []}
            loading={remote.loading}
            error={remote.error}
            sep="/"
            onNavigate={(p) => void remote.load(p)}
            onRefresh={() => void remote.load(remote.path!)}
            onOpenFile={(e) => void download([joinPath(remote.path!, e.name, '/')])}
            paneActions={[
              { label: 'Новая папка', onClick: () => void newFolder('remote') },
              { label: 'Домашняя папка', onClick: () => void remote.load(sftp.remote!.home) },
              { label: 'Другой хост…', onClick: () => sftp.setPicking(true) },
              { label: 'Отключиться', danger: true, onClick: () => sftp.disconnect() }
            ]}
            itemActions={remoteActions}
            onDropPayload={(p: DragPayload) => void upload(p.paths)}
            onDropOsFiles={(paths) => void upload(paths)}
          />
        ) : (
          <section className="fpane remote">
            <div className="empty-state">
              <span className="empty-icon">
                <IconFolder size={26} />
              </span>
              <h3>{sftp.connecting ? `Подключение к ${sftp.connecting}…` : 'Подключитесь к хосту'}</h3>
              <p>{sftp.error ?? 'Выберите сохранённый хост, чтобы управлять файлами по SFTP. Файлы можно перетаскивать между панелями и из проводника.'}</p>
              <button className="btn-soft" onClick={() => sftp.setPicking(true)} disabled={Boolean(sftp.connecting)}>
                Выбрать хост
              </button>
            </div>
          </section>
        )}
      </div>
      <TransferBar />
    </div>
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
