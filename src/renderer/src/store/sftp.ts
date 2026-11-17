import { create } from 'zustand'
import type { TransferEvent } from '@shared/files'
import { errorText } from '@/lib/errors'
import { askText } from '@/components/InputDialog'

export type PaneSource = { kind: 'local' } | { kind: 'remote'; hostId: string; label: string; country: string | null; sftpId: string; home: string }

export interface SidePane {
  source: PaneSource | null
  /** Current directory, shared so the other pane can drop files here. */
  path: string | null
  picking: boolean
  connecting: string | null
  error?: string
}

type Side = 0 | 1
const empty = (): SidePane => ({ source: null, path: null, picking: false, connecting: null })

interface SftpState {
  panes: [SidePane, SidePane]
  transfers: TransferEvent[]
  patch(i: Side, p: Partial<SidePane>): void
  setLocal(i: Side): void
  connect(i: Side, host: { id: string; label: string; country: string | null }, o?: { password?: string; passphrase?: string; rememberPassphrase?: boolean }): Promise<void>
  disconnect(i: Side): void
  /** Opens a host in the first pane that is not already local (used by "Open SFTP" from a terminal). */
  openHost(host: { id: string; label: string; country: string | null }): void
  clearFinished(): void
}

export const useSftp = create<SftpState>((set, get) => ({
  // Like most two-pane clients: your computer on the left, a server on the right.
  panes: [{ ...empty(), source: { kind: 'local' } }, empty()],
  transfers: [],
  patch: (i, p) => set((s) => ({ panes: s.panes.map((x, j) => (j === i ? { ...x, ...p } : x)) as [SidePane, SidePane] })),
  setLocal: (i) => {
    get().disconnect(i)
    get().patch(i, { source: { kind: 'local' }, path: null, picking: false, error: undefined })
  },
  connect: async (i, host, o = {}) => {
    get().disconnect(i)
    get().patch(i, { connecting: host.label, error: undefined, picking: false, source: null, path: null })
    try {
      const r = await window.api.sftp.open(host.id, o)
      get().patch(i, { source: { kind: 'remote', hostId: host.id, label: host.label, country: host.country, sftpId: r.id, home: r.home }, connecting: null, path: null })
    } catch (e) {
      const raw = errorText(e)
      get().patch(i, { connecting: null })
      const need = /\[\[(NEED|BAD)_PASSPHRASE:[^:\]]+:([^\]]*)\]\]/.exec(raw)
      if (need) {
        const pp = await askText({ title: `Парольная фраза ключа «${need[2]}»`, label: need[1] === 'BAD' ? 'Фраза не подошла, попробуйте ещё раз.' : 'Ключ зашифрован.', password: true, okText: 'Разблокировать' })
        if (pp) return get().connect(i, host, { ...o, passphrase: pp, rememberPassphrase: true })
        return
      }
      if (/authentication/i.test(raw) && !o.password) {
        const pw = await askText({ title: `Пароль для ${host.label}`, password: true, okText: 'Подключиться' })
        if (pw) return get().connect(i, host, { ...o, password: pw })
        return
      }
      get().patch(i, { error: raw.replace(/\[\[[^\]]*\]\]\s*/, '') })
    }
  },
  disconnect: (i) => {
    const src = get().panes[i].source
    if (src?.kind === 'remote') window.api.sftp.close(src.sftpId)
    get().patch(i, { source: null, path: null })
  },
  openHost: (host) => {
    const panes = get().panes
    const i: Side = panes[1].source?.kind !== 'local' ? 1 : panes[0].source?.kind !== 'local' ? 0 : 1
    void get().connect(i, host)
  },
  clearFinished: () => set((s) => ({ transfers: s.transfers.filter((t) => t.status === 'running' || t.status === 'queued') }))
}))

window.api.sftp.onTransfer((ev) =>
  useSftp.setState((s) => {
    const i = s.transfers.findIndex((t) => t.id === ev.id)
    return { transfers: i < 0 ? [...s.transfers, ev] : s.transfers.map((t, j) => (j === i ? ev : t)) }
  })
)
window.api.sftp.onClosed((id) => {
  const s = useSftp.getState()
  s.panes.forEach((p, i) => {
    if (p.source?.kind === 'remote' && p.source.sftpId === id) s.patch(i as Side, { source: null, path: null, error: 'SFTP-соединение закрыто сервером' })
  })
})
