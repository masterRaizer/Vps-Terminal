import { useState } from 'react'
import { useSessions } from '@/store/sessions'
import { useVault } from '@/store/vault'
import { connectHost } from '@/lib/connectHost'
import { Drawer, Field } from '../ui'
import { IconEye, IconEyeOff, IconLock, IconPlug, IconUser } from '../Icons'

export function QuickConnectDrawer({ initial }: { initial: { host: string; port: number; username: string } }) {
  const edit = useVault((s) => s.edit)
  const [host, setHost] = useState(initial.host)
  const [port, setPort] = useState(String(initial.port))
  const [username, setUsername] = useState(initial.username)
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [saveIt, setSaveIt] = useState(false)
  const [error, setError] = useState<string>()

  const p = Number(port)
  const valid = host.trim() && !/\s/.test(host.trim()) && username.trim() && Number.isInteger(p) && p > 0 && p < 65536

  const go = async (): Promise<void> => {
    if (!valid) return
    try {
      if (saveIt) {
        const saved = await useVault.getState().saveHost(
          { label: host.trim(), address: host.trim(), port: p, username: username.trim(), auth: 'password', keyId: null, groupId: useVault.getState().currentGroupId, color: null, tags: [], favorite: false, notes: '' },
          password || undefined
        )
        connectHost(saved)
      } else {
        useSessions.getState().openTab({ host: host.trim(), port: p, username: username.trim() }, password)
      }
      edit(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Drawer
      title="Быстрое подключение"
      onClose={() => edit(null)}
      footer={
        <button className="btn-cta" disabled={!valid} onClick={() => void go()} type="button">
          <IconPlug size={18} /> Подключиться
        </button>
      }
    >
      <form
        className="drawer-form"
        onSubmit={(e) => {
          e.preventDefault()
          void go()
        }}
      >
        <section className="drawer-group">
          <h3 className="group-title">Адрес</h3>
          <div className="field-pair">
            <Field label="Хост или IP" required value={host} onChange={(e) => setHost(e.target.value)} autoFocus={!host} placeholder="203.0.113.10" />
            <Field label="Порт" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))} className="port-input" />
          </div>
        </section>
        <section className="drawer-group">
          <h3 className="group-title">Аутентификация</h3>
          <Field label="Пользователь" required icon={<IconUser size={16} />} value={username} onChange={(e) => setUsername(e.target.value)} />
          <div className="field-with-action">
            <Field
              label="Пароль"
              icon={<IconLock size={16} />}
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              autoFocus={Boolean(host)}
            />
            <button type="button" className="icon-btn field-action" onClick={() => setShowPwd((v) => !v)} title={showPwd ? 'Скрыть' : 'Показать'}>
              {showPwd ? <IconEyeOff size={17} /> : <IconEye size={17} />}
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={saveIt} onChange={(e) => setSaveIt(e.target.checked)} />
            Сохранить в хосты (вместе с паролем)
          </label>
        </section>
        {error && <div className="form-error">{error}</div>}
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}
