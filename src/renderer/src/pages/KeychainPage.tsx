import { useState } from 'react'
import { useVault, vaultCall } from '@/store/vault'
import { Card, EmptyState, SplitButton, ToolButton } from '@/components/ui'
import { KeyDrawer } from '@/components/drawers/KeyDrawer'
import { IdentityDrawer } from '@/components/drawers/IdentityDrawer'
import { IconDownload, IconFolder, IconKey, IconLock, IconPlus, IconUser } from '@/components/Icons'

const TYPE = { ed25519: 'ED25519', rsa: 'RSA', ecdsa: 'ECDSA', unknown: 'ключ' } as const

export function KeychainPage() {
  const v = useVault()
  const [notice, setNotice] = useState<string>()

  const runImport = async (folder: boolean): Promise<void> => {
    try {
      const r = await vaultCall(folder ? window.api.keys.importFolder() : window.api.keys.importFiles())
      if (!r) return
      const parts = [`Импортировано ключей: ${r.added.length}`]
      if (r.bound) parts.push(`привязано к хостам: ${r.bound}`)
      if (r.skipped.length) parts.push(`пропущено: ${r.skipped.length} (${r.skipped.slice(0, 3).join('; ')}${r.skipped.length > 3 ? '…' : ''})`)
      setNotice(parts.join(', '))
    } catch (e) {
      setNotice(`Импорт не удался: ${(e as Error).message}`)
    }
  }

  const ed = v.editing
  return (
    <div className="page-with-drawer">
      <div className="page">
        <div className="toolbar toolbar-top">
          <SplitButton
            icon={<IconPlus size={18} />}
            label="Новый ключ"
            onClick={() => v.edit({ kind: 'key', mode: 'generate' })}
            menu={[
              { label: 'Сгенерировать ключ', onClick: () => v.edit({ kind: 'key', mode: 'generate' }) },
              { label: 'Вставить приватный ключ', onClick: () => v.edit({ kind: 'key', mode: 'paste' }) },
              { label: 'Импорт файлов…', onClick: () => void runImport(false) },
              { label: 'Импорт папки…', onClick: () => void runImport(true) }
            ]}
          />
          <ToolButton icon={<IconFolder size={18} />} label="Импорт папки" onClick={() => void runImport(true)} />
          <ToolButton icon={<IconDownload size={18} />} label="Файлы" onClick={() => void runImport(false)} />
          <ToolButton icon={<IconUser size={18} />} label="Профиль доступа" onClick={() => v.edit({ kind: 'identity' })} />
        </div>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button className="icon-btn" onClick={() => setNotice(undefined)} aria-label="Скрыть">
              ×
            </button>
          </div>
        )}
        <div className="page-body">
          <section>
            <h2 className="section-title">Ключи</h2>
            {v.keys.length ? (
              <div className="card-grid">
                {v.keys.map((k) => (
                  <Card
                    key={k.id}
                    icon={<IconKey size={22} />}
                    title={k.label}
                    subtitle={`Тип ${TYPE[k.type]}${k.bits ? ` ${k.bits}` : ''}${k.encrypted ? ' · с фразой' : ''}`}
                    badge={k.encrypted ? <IconLock size={13} className="muted" /> : undefined}
                    selected={ed?.kind === 'key' && ed.id === k.id}
                    onClick={() => v.edit({ kind: 'key', id: k.id })}
                  />
                ))}
              </div>
            ) : (
              <EmptyState icon={<IconKey size={26} />} title="Ключей пока нет" text="Импортируйте папку с ключами (например, ~/.ssh) — хосты из hosts.json привяжутся к ключам по имени файла." />
            )}
          </section>
          <section>
            <h2 className="section-title">Профили доступа</h2>
            {v.identities.length ? (
              <div className="card-grid">
                {v.identities.map((i) => {
                  const key = v.keys.find((k) => k.id === i.keyId)
                  return (
                    <Card
                      key={i.id}
                      icon={<IconUser size={22} />}
                      title={i.label}
                      subtitle={[i.username, i.hasPassword && 'пароль', key && `ключ ${key.label}`].filter(Boolean).join(' · ')}
                      selected={ed?.kind === 'identity' && ed.id === i.id}
                      onClick={() => v.edit({ kind: 'identity', id: i.id })}
                    />
                  )
                })}
              </div>
            ) : (
              <EmptyState icon={<IconUser size={26} />} title="Профилей нет" text="Профиль = логин + пароль и/или ключ. Назначьте его группе хостов или всем нодам панели." />
            )}
          </section>
        </div>
      </div>
      {ed?.kind === 'key' && <KeyDrawer key={ed.id ?? `new-${ed.mode}`} id={ed.id} mode={ed.mode} />}
      {ed?.kind === 'identity' && <IdentityDrawer key={ed.id ?? 'new'} id={ed.id} />}
    </div>
  )
}
