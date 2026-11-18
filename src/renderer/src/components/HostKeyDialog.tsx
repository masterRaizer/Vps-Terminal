import { useEffect, useState } from 'react'
import type { HostKeyPrompt } from '@shared/ipc'
import { onHostKeyPrompt } from '@/lib/sessionBus'
import { useVault } from '@/store/vault'
import { IconShield } from './Icons'

/** Trust-on-first-use prompt; a changed key gets a loud warning. */
export function HostKeyDialog() {
  const [queue, setQueue] = useState<HostKeyPrompt[]>([])
  useEffect(() => onHostKeyPrompt((p) => setQueue((q) => [...q, p])), [])
  const current = queue[0]
  if (!current) return null
  const changed = current.kind === 'changed'

  const answer = (accept: boolean): void => {
    window.api.ssh.answerHostKey(current.requestId, accept)
    setQueue((q) => q.slice(1))
    if (accept) setTimeout(() => void useVault.getState().load(), 300)
  }

  return (
    <div className="modal-backdrop">
      <div className={`modal ${changed ? 'danger' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="hk-title">
        <div className="modal-icon">
          <IconShield size={24} />
        </div>
        <h2 id="hk-title">{changed ? 'Ключ сервера изменился!' : 'Проверьте ключ сервера'}</h2>
        {changed ? (
          <p>
            <b>
              {current.host}:{current.port}
            </b>{' '}
            предъявил не тот ключ, что был сохранён. Так бывает после переустановки сервера, но так же выглядит и перехват соединения (MITM). Подключайтесь,
            только если точно знаете, что ключ меняли.
          </p>
        ) : (
          <p>
            Подлинность{' '}
            <b>
              {current.host}:{current.port}
            </b>{' '}
            ещё не подтверждена. Сверьте отпечаток с тем, что показывает сервер (<code>ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub</code>). После подтверждения ключ
            запомнится в «Известных хостах».
          </p>
        )}
        <dl className="kv">
          {changed && current.previous && (
            <>
              <dt>Было</dt>
              <dd className="mono old-fp">
                {current.previous.algorithm} {current.previous.fingerprint}
              </dd>
            </>
          )}
          <dt>{changed ? 'Стало' : 'Алгоритм'}</dt>
          <dd className={changed ? 'mono new-fp' : ''}>{changed ? `${current.algorithm} ${current.fingerprint}` : current.algorithm}</dd>
          {!changed && (
            <>
              <dt>Отпечаток</dt>
              <dd className="mono">{current.fingerprint}</dd>
            </>
          )}
        </dl>
        <div className="modal-actions">
          <button className={changed ? 'btn btn-primary' : 'btn'} onClick={() => answer(false)} autoFocus={changed}>
            {changed ? 'Не подключаться' : 'Отмена'}
          </button>
          <button className={changed ? 'btn btn-danger' : 'btn btn-primary'} autoFocus={!changed} onClick={() => answer(true)}>
            {changed ? 'Заменить ключ и подключиться' : 'Доверять и подключиться'}
          </button>
        </div>
      </div>
    </div>
  )
}
