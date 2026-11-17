import { useEffect, useState } from 'react'
import type { HostKeyPrompt } from '@shared/ipc'
import { onHostKeyPrompt } from '@/lib/sessionBus'
import { IconShield } from './Icons'

/** Asks the user to confirm an unknown server key (TOFU store arrives in step 4). */
export function HostKeyDialog() {
  const [queue, setQueue] = useState<HostKeyPrompt[]>([])
  useEffect(() => onHostKeyPrompt((p) => setQueue((q) => [...q, p])), [])
  const current = queue[0]
  if (!current) return null

  const answer = (accept: boolean): void => {
    window.api.ssh.answerHostKey(current.requestId, accept)
    setQueue((q) => q.slice(1))
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="hk-title">
        <div className="modal-icon">
          <IconShield size={22} />
        </div>
        <h2 id="hk-title">Проверьте ключ сервера</h2>
        <p>
          Подлинность <b>{current.host}:{current.port}</b> ещё не подтверждена. Сверьте отпечаток с
          тем, что показывает сервер (<code>ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub</code>).
        </p>
        <dl className="kv">
          <dt>Алгоритм</dt>
          <dd>{current.algorithm}</dd>
          <dt>Отпечаток</dt>
          <dd className="mono">{current.fingerprint}</dd>
        </dl>
        <div className="modal-actions">
          <button className="btn" onClick={() => answer(false)}>
            Отмена
          </button>
          <button className="btn btn-primary" autoFocus onClick={() => answer(true)}>
            Доверять и подключиться
          </button>
        </div>
      </div>
    </div>
  )
}
