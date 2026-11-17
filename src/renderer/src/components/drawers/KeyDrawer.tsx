import { useState } from 'react'
import { useVault, vaultCall } from '@/store/vault'
import { Drawer, Tile } from '../ui'
import { IconInput, MoreMenu } from '../form'
import { IconDots, IconKey, IconLock } from '../Icons'

const TYPE_LABEL = { ed25519: 'ED25519', rsa: 'RSA', ecdsa: 'ECDSA', unknown: 'неизвестен' } as const

export function KeyDrawer({ id, mode }: { id?: string; mode?: 'generate' | 'paste' }) {
  const { keys, hosts, identities, edit } = useVault()
  const key = id ? keys.find((k) => k.id === id) : undefined
  if (key) return <ExistingKey key={key.id} id={key.id} />
  return <NewKey mode={mode ?? 'generate'} onDone={(newId) => edit({ kind: 'key', id: newId })} onClose={() => edit(null)} usedBy={hosts.length + identities.length} />
}

function NewKey({ mode: initial, onDone, onClose }: { mode: 'generate' | 'paste'; onDone: (id: string) => void; onClose: () => void; usedBy: number }) {
  const [mode, setMode] = useState(initial)
  const [label, setLabel] = useState('')
  const [type, setType] = useState<'ed25519' | 'rsa'>('ed25519')
  const [bits, setBits] = useState(4096)
  const [passphrase, setPassphrase] = useState('')
  const [remember, setRemember] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      if (mode === 'generate') {
        const k = await vaultCall(window.api.keys.generate({ label: label || `${type}-key`, type, bits: type === 'rsa' ? bits : undefined, passphrase: passphrase || undefined, rememberPassphrase: remember }))
        onDone(k.id)
      } else {
        const k = await vaultCall(window.api.keys.importText(label || 'imported-key', text))
        if (!k) throw new Error('Такой ключ уже есть в хранилище')
        onDone(k.id)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      title="Новый ключ"
      onClose={onClose}
      footer={
        <button className="btn-cta" type="button" disabled={busy || (mode === 'paste' && !text.trim())} onClick={() => void submit()}>
          {busy ? 'Подождите…' : mode === 'generate' ? 'Сгенерировать' : 'Сохранить ключ'}
        </button>
      }
    >
      <div className="segmented two">
        <button className={mode === 'generate' ? 'on' : ''} onClick={() => setMode('generate')} type="button">
          Сгенерировать
        </button>
        <button className={mode === 'paste' ? 'on' : ''} onClick={() => setMode('paste')} type="button">
          Вставить приватный ключ
        </button>
      </div>
      <section className="drawer-group">
        <IconInput icon={<IconKey size={18} />} placeholder="Название (например, id_ed25519)" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        {mode === 'generate' ? (
          <>
            <div className="segmented">
              <button type="button" className={type === 'ed25519' ? 'on' : ''} onClick={() => setType('ed25519')}>
                ED25519
              </button>
              <button type="button" className={type === 'rsa' && bits === 4096 ? 'on' : ''} onClick={() => (setType('rsa'), setBits(4096))}>
                RSA 4096
              </button>
              <button type="button" className={type === 'rsa' && bits === 2048 ? 'on' : ''} onClick={() => (setType('rsa'), setBits(2048))}>
                RSA 2048
              </button>
            </div>
            <IconInput icon={<IconLock size={18} />} type="password" placeholder="Парольная фраза (необязательно)" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="off" />
            {passphrase && (
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Запомнить фразу в диспетчере учётных данных
              </label>
            )}
            <p className="hint">ED25519 — короткий и быстрый, подходит почти всем серверам. RSA нужен для старых систем.</p>
          </>
        ) : (
          <>
            <textarea className="notes key-text" rows={9} spellCheck={false} placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----'} value={text} onChange={(e) => setText(e.target.value)} />
            <p className="hint">OpenSSH, PEM (RSA/EC/PKCS#8) или PuTTY .ppk v2. Ключ шифруется сразу при сохранении.</p>
          </>
        )}
        {error && <div className="form-error">{error}</div>}
      </section>
    </Drawer>
  )
}

function ExistingKey({ id }: { id: string }) {
  const { keys, hosts, identities, edit } = useVault()
  const key = keys.find((k) => k.id === id)!
  const [label, setLabel] = useState(key.label)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string>()
  const usedHosts = hosts.filter((h) => h.keyId === id)
  const usedIdents = identities.filter((i) => i.keyId === id)

  const rename = async (): Promise<void> => {
    if (label.trim() && label !== key.label) await vaultCall(window.api.keys.rename(id, label.trim())).catch((e: Error) => setError(e.message))
  }
  const copyPublic = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(await window.api.keys.publicKey(id))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''))
    }
  }

  return (
    <Drawer
      title="Ключ"
      onClose={() => edit(null)}
      actions={
        <MoreMenu
          trigger={<IconDots size={20} />}
          items={[
            { label: 'Забыть парольную фразу', disabled: !key.hasPassphrase, onClick: () => void vaultCall(window.api.keys.forgetPassphrase(id)) },
            {
              label: 'Удалить ключ',
              danger: true,
              onClick: () => {
                const n = usedHosts.length + usedIdents.length
                if (window.confirm(n ? `Ключ используется (${n}). Удалить? Хосты переключатся на пароль.` : `Удалить ключ «${key.label}»?`)) {
                  void vaultCall(window.api.keys.delete(id)).then(() => edit(null))
                }
              }
            }
          ]}
        />
      }
      footer={
        <button className="btn-cta" type="button" onClick={() => void copyPublic()} disabled={!key.publicKey}>
          {copied ? 'Скопировано' : 'Копировать публичный ключ'}
        </button>
      }
    >
      <section className="drawer-group">
        <div className="addr-row">
          <Tile tone="blue" size={48}>
            <IconKey size={24} />
          </Tile>
          <IconInput placeholder="Название" value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => void rename()} />
        </div>
        <dl className="kv">
          <dt>Тип</dt>
          <dd>
            {TYPE_LABEL[key.type]}
            {key.bits ? ` ${key.bits}` : ''}
          </dd>
          <dt>Отпечаток</dt>
          <dd className="mono">{key.fingerprint ?? 'станет известен после первой разблокировки'}</dd>
          <dt>Защита</dt>
          <dd>{key.encrypted ? (key.hasPassphrase ? 'парольная фраза сохранена' : 'парольная фраза, спросим при входе') : 'без парольной фразы'}</dd>
        </dl>
        {key.publicKey && <textarea className="notes key-text" readOnly rows={4} value={key.publicKey} onFocus={(e) => e.currentTarget.select()} />}
        <p className="hint">Приватная часть хранится зашифрованной (AES-256-GCM) и в интерфейс не попадает.</p>
        {error && <div className="form-error">{error}</div>}
      </section>
      <section className="drawer-group">
        <h3 className="group-title">Используется</h3>
        {usedHosts.length + usedIdents.length === 0 && <p className="hint">Пока ни одним хостом.</p>}
        {usedIdents.map((i) => (
          <button key={i.id} type="button" className="mini-row" onClick={() => edit({ kind: 'identity', id: i.id })}>
            Профиль «{i.label}»
          </button>
        ))}
        {usedHosts.map((h) => (
          <button key={h.id} type="button" className="mini-row" onClick={() => edit({ kind: 'host', id: h.id })}>
            {h.label} <small>{h.address}</small>
          </button>
        ))}
      </section>
    </Drawer>
  )
}
