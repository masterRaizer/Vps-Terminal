import { useState } from 'react'
import { create } from 'zustand'
import type { Host } from '@shared/vault'
import { useSessions } from '@/store/sessions'
import { useVault } from '@/store/vault'
import { IconLock } from './Icons'

interface PromptState {
  host: Host | null
  ask(h: Host): void
  close(): void
}

export const usePasswordPrompt = create<PromptState>((set) => ({
  host: null,
  ask: (host) => set({ host }),
  close: () => set({ host: null })
}))

export function PasswordPrompt() {
  const { host, close } = usePasswordPrompt()
  if (!host) return null
  return <PromptDialog key={host.id} host={host} close={close} />
}

function PromptDialog({ host, close }: { host: Host; close: () => void }) {
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string>()
  const persistent = useVault((s) => s.secretsPersistent)

  const submit = async (): Promise<void> => {
    try {
      if (remember) {
        const { id, label, address, port, username, auth, keyId, groupId, color, tags, favorite, notes, options } = host
        await useVault.getState().saveHost({ id, label, address, port, username, auth, keyId, groupId, color, tags, favorite, notes, options }, password)
        useSessions.getState().openHostTab(host, false)
      } else {
        useSessions.getState().openHostTab(host, true, password)
      }
      close()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <div className="modal-icon">
          <IconLock size={24} />
        </div>
        <h2>Пароль для {host.label}</h2>
        <p>
          {host.username}@{host.address}:{host.port}
        </p>
        <label className="rc-input wide">
          <IconLock size={15} />
          <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" autoComplete="off" />
        </label>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {persistent ? 'Сохранить в диспетчере учётных данных Windows' : 'Запомнить до закрытия приложения'}
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn" type="button" onClick={close}>
            Отмена
          </button>
          <button className="btn btn-primary" type="submit">
            Подключиться
          </button>
        </div>
      </form>
    </div>
  )
}
