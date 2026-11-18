import { useState } from 'react'
import { useSync } from '@/store/sync'
import { errorText } from '@/lib/errors'
import { Tile } from '@/components/ui'
import { IconInput } from '@/components/form'
import { IconLock, IconRefresh, IconServer, IconShield } from '@/components/Icons'

const DEFAULT_URL = 'https://sync.devkillmix.com:2053'

export function SyncPage() {
  const status = useSync((s) => s.status)
  return (
    <div className="page">
      <div className="toolbar toolbar-top">
        <span className="toolbar-title">Синхронизация через свой сервер</span>
      </div>
      <div className="page-body narrow">{status?.configured ? <Connected /> : <Setup />}</div>
    </div>
  )
}

function Setup() {
  const [url, setUrl] = useState(DEFAULT_URL)
  const [token, setToken] = useState('')
  const [master, setMaster] = useState('')
  const [master2, setMaster2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const mismatch = master2 !== '' && master !== master2
  const valid = url && token.length >= 16 && master.length >= 8 && master === master2

  const connect = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await window.api.sync.configure(url, token, master)
      setToken('')
      setMaster('')
      setMaster2('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="sync-card" onSubmit={(e) => (e.preventDefault(), valid && void connect())}>
      <div className="sync-head">
        <Tile tone="green" size={48}>
          <IconShield size={24} />
        </Tile>
        <div>
          <h2>Сквозное шифрование</h2>
          <p>Хосты, ключи, пароли, сниппеты и туннели шифруются на этом компьютере (scrypt + AES-256-GCM). Сервер хранит только зашифрованный файл и не знает мастер-пароля.</p>
        </div>
      </div>
      <IconInput icon={<IconServer size={18} />} placeholder="https://sync.example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
      <IconInput icon={<IconLock size={18} />} type="password" placeholder="Токен доступа к серверу" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
      <IconInput icon={<IconShield size={18} />} type="password" placeholder="Мастер-пароль (минимум 8 символов)" value={master} onChange={(e) => setMaster(e.target.value)} autoComplete="new-password" />
      <IconInput icon={<IconShield size={18} />} type="password" placeholder="Повторите мастер-пароль" value={master2} onChange={(e) => setMaster2(e.target.value)} autoComplete="new-password" />
      {mismatch && <div className="form-error">Пароли не совпадают</div>}
      <p className="hint warn">
        Мастер-пароль не восстанавливается: без него данные на сервере не расшифровать. Если хранилище на сервере уже есть (с другого компьютера) — введите тот же пароль, данные объединятся.
      </p>
      {error && <div className="form-error">{error}</div>}
      <button className="btn-cta" type="submit" disabled={!valid || busy}>
        {busy ? 'Подключение…' : 'Подключить и синхронизировать'}
      </button>
    </form>
  )
}

function Connected() {
  const status = useSync((s) => s.status)!
  const [error, setError] = useState<string>()
  return (
    <div className="sync-card">
      <div className="sync-head">
        <Tile tone={status.lastError ? 'orange' : 'green'} size={48}>
          <IconRefresh size={24} />
        </Tile>
        <div>
          <h2>{status.syncing ? 'Синхронизация…' : status.lastError ? 'Ошибка синхронизации' : 'Синхронизировано'}</h2>
          <p>
            {status.url}
            <br />
            {status.lastSyncAt ? `Последняя: ${new Date(status.lastSyncAt).toLocaleString()}` : 'Ещё не синхронизировалось'} · версия {status.version}
          </p>
        </div>
      </div>
      {status.lastError && <div className="form-error">{status.lastError}</div>}
      {error && <div className="form-error">{error}</div>}
      <p className="hint">Изменения отправляются через пару секунд после правки; другие устройства подтягивают их при запуске и каждые 5 минут.</p>
      <div className="foot-row">
        <button
          className="btn-soft grow"
          type="button"
          onClick={() => {
            if (window.confirm('Отключить синхронизацию на этом компьютере? Локальные данные останутся, данные на сервере не удаляются.')) void window.api.sync.disable()
          }}
        >
          Отключить на этом устройстве
        </button>
        <button className="btn-cta grow" type="button" disabled={status.syncing} onClick={() => void window.api.sync.now().catch((e) => setError(errorText(e)))}>
          <IconRefresh size={17} /> Синхронизировать сейчас
        </button>
      </div>
    </div>
  )
}
