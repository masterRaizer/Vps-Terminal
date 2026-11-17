import { useState } from 'react'
import type { PasswordChange } from '@shared/vault'
import { useVault, vaultCall } from '@/store/vault'
import { Drawer, Tile } from '../ui'
import { IconInput, MoreMenu, PickerRow } from '../form'
import { IconDots, IconKey, IconLock, IconUser } from '../Icons'

export function IdentityDrawer({ id }: { id?: string }) {
  const { identities, keys, hosts, integrations, edit } = useVault()
  const ident = id ? identities.find((i) => i.id === id) : undefined
  const [label, setLabel] = useState(ident?.label ?? '')
  const [username, setUsername] = useState(ident?.username ?? 'root')
  const [keyId, setKeyId] = useState<string>(ident?.keyId ?? '')
  const [password, setPassword] = useState('')
  const [pwd, setPwd] = useState<PasswordChange>(undefined)
  const [error, setError] = useState<string>()
  const used = hosts.filter((h) => h.identityId === id).length + integrations.filter((i) => i.identityId === id).length

  const save = async (): Promise<void> => {
    try {
      const saved = await vaultCall(window.api.identities.save({ id, label, username, keyId: keyId || null }, pwd))
      setPassword('')
      setPwd(undefined)
      edit({ kind: 'identity', id: saved.id })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Drawer
      title={ident ? 'Профиль доступа' : 'Новый профиль доступа'}
      onClose={() => edit(null)}
      actions={
        ident && (
          <MoreMenu
            trigger={<IconDots size={20} />}
            items={[
              { label: 'Забыть пароль', disabled: !ident.hasPassword, onClick: () => void vaultCall(window.api.identities.save({ id: ident.id, label: ident.label, username: ident.username, keyId: ident.keyId }, null)) },
              {
                label: 'Удалить профиль',
                danger: true,
                onClick: () => window.confirm(used ? `Профиль используется (${used}). Удалить? Хосты вернутся к своим учётным данным.` : `Удалить «${ident.label}»?`) && void vaultCall(window.api.identities.delete(ident.id)).then(() => edit(null))
              }
            ]}
          />
        )
      }
      footer={
        <button className="btn-cta" type="button" onClick={() => void save()} disabled={!username.trim()}>
          Сохранить
        </button>
      }
    >
      <section className="drawer-group">
        <div className="addr-row">
          <Tile tone="blue" size={48}>
            <IconUser size={24} />
          </Tile>
          <IconInput placeholder={username || 'Название'} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus={!ident} />
        </div>
        <p className="hint">Профиль — это логин с паролем и/или ключом. Его можно назначить многим хостам и нодам Remnawave сразу.</p>
      </section>
      <section className="drawer-group">
        <h3 className="group-title">Учётные данные</h3>
        <IconInput icon={<IconUser size={18} />} placeholder="Пользователь" value={username} onChange={(e) => setUsername(e.target.value)} />
        <IconInput
          icon={<IconLock size={18} />}
          type="password"
          placeholder={ident?.hasPassword ? '•••••••• сохранён' : 'Пароль (необязательно)'}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setPwd(e.target.value || undefined)
          }}
          autoComplete="off"
        />
        <PickerRow
          icon={<IconKey size={18} />}
          placeholder="Ключ"
          value={keyId}
          display={keyId ? undefined : <span className="ph">Ключ SSH (необязательно)</span>}
          options={[{ value: '', label: 'Без ключа' }, ...keys.map((k) => ({ value: k.id, label: k.label, hint: k.type.toUpperCase() }))]}
          onPick={setKeyId}
        />
        {error && <div className="form-error">{error}</div>}
      </section>
    </Drawer>
  )
}
