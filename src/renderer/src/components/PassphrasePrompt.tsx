import { useState } from 'react'
import { create } from 'zustand'
import { useSessions } from '@/store/sessions'
import { useVault } from '@/store/vault'
import { IconKey, IconLock } from './Icons'

interface Ask {
  tabId: string
  keyLabel: string
  wrong: boolean
}

export const usePassphrasePrompt = create<{ request: Ask | null; ask(a: Ask): void; close(): void }>((set) => ({
  request: null,
  ask: (request) => set({ request }),
  close: () => set({ request: null })
}))

export function PassphrasePrompt() {
  const a = usePassphrasePrompt((s) => s.request)
  if (!a) return null
  return <Dialog key={`${a.tabId}:${a.wrong}`} a={a} />
}

function Dialog({ a }: { a: Ask }) {
  const [pp, setPp] = useState('')
  const [remember, setRemember] = useState(true)
  const persistent = useVault((s) => s.secretsPersistent)
  const close = usePassphrasePrompt((s) => s.close)
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form
        className="modal"
        onKeyDown={(e) => e.key === 'Escape' && close()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!pp) return
          useSessions.getState().retryWithPassphrase(a.tabId, pp, remember)
          close()
        }}
      >
        <div className="modal-icon">
          <IconKey size={24} />
        </div>
        <h2>Парольная фраза ключа «{a.keyLabel}»</h2>
        <p>{a.wrong ? 'Фраза не подошла, попробуйте ещё раз.' : 'Ключ зашифрован. Введите фразу, чтобы войти.'}</p>
        <label className="rc-input wide">
          <IconLock size={15} />
          <input type="password" autoFocus value={pp} onChange={(e) => setPp(e.target.value)} placeholder="Парольная фраза" autoComplete="off" />
        </label>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {persistent ? 'Запомнить в диспетчере учётных данных Windows' : 'Запомнить до закрытия приложения'}
        </label>
        <div className="modal-actions">
          <button className="btn" type="button" onClick={close}>
            Отмена
          </button>
          <button className="btn btn-primary" type="submit" disabled={!pp}>
            Разблокировать
          </button>
        </div>
      </form>
    </div>
  )
}
