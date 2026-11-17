import { create } from 'zustand'
import type { TransferEvent } from '@shared/files'
import { errorText } from '@/lib/errors'
import { askText } from '@/components/InputDialog'

interface Remote {
  hostId: string
  label: string
  sftpId: string
  home: string
}

interface SftpState {
  remote: Remote | null
  connecting: string | null
  error?: string
  transfers: TransferEvent[]
  picking: boolean
  connect(host: { id: string; label: string }, o?: { password?: string; passphrase?: string; rememberPassphrase?: boolean }): Promise<void>
  disconnect(): void
  setPicking(v: boolean): void
  clearFinished(): void
}

export const useSftp = create<SftpState>((set, get) => ({
  remote: null,
  connecting: null,
  transfers: [],
  picking: false,
  connect: async (host, o = {}) => {
    get().disconnect()
    set({ connecting: host.label, error: undefined, picking: false })
    try {
      const r = await window.api.sftp.open(host.id, o)
      set({ remote: { hostId: host.id, label: host.label, sftpId: r.id, home: r.home }, connecting: null })
    } catch (e) {
      const raw = errorText(e)
      const need = /\[\[(NEED|BAD)_PASSPHRASE:[^:\]]+:([^\]]*)\]\]/.exec(raw)
      set({ connecting: null })
      if (need) {
        const pp = await askText({ title: `Парольная фраза ключа «${need[2]}»`, label: need[1] === 'BAD' ? 'Фраза не подошла, попробуйте ещё раз.' : 'Ключ зашифрован.', password: true, okText: 'Разблокировать' })
        if (pp) return get().connect(host, { ...o, passphrase: pp, rememberPassphrase: true })
        return
      }
      if (/authentication/i.test(raw) && !o.password) {
        const pw = await askText({ title: `Пароль для ${host.label}`, password: true, okText: 'Подключиться' })
        if (pw) return get().connect(host, { ...o, password: pw })
        return
      }
      set({ error: raw.replace(/\[\[[^\]]*\]\]\s*/, '') })
    }
  },
  disconnect: () => {
    const r = get().remote
    if (r) window.api.sftp.close(r.sftpId)
    set({ remote: null })
  },
  setPicking: (picking) => set({ picking }),
  clearFinished: () => set((s) => ({ transfers: s.transfers.filter((t) => t.status === 'running' || t.status === 'queued') }))
}))

window.api.sftp.onTransfer((ev) =>
  useSftp.setState((s) => {
    const i = s.transfers.findIndex((t) => t.id === ev.id)
    const transfers = i < 0 ? [...s.transfers, ev] : s.transfers.map((t, j) => (j === i ? ev : t))
    return { transfers }
  })
)
window.api.sftp.onClosed((id) => {
  if (useSftp.getState().remote?.sftpId === id) useSftp.setState({ remote: null, error: 'SFTP-соединение закрыто сервером' })
})
