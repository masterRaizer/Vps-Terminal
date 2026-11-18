import { useState } from 'react'
import { snippetVars } from '@shared/snippets'
import { useVault, vaultCall } from '@/store/vault'
import { Drawer, Tile } from '../ui'
import { IconInput, MoreMenu } from '../form'
import { IconBraces, IconDots, IconTag } from '../Icons'

export function SnippetDrawer({ id }: { id?: string }) {
  const { snippets, hosts, edit } = useVault()
  const sn = id ? snippets.find((s) => s.id === id) : undefined
  const [label, setLabel] = useState(sn?.label ?? '')
  const [command, setCommand] = useState(sn?.command ?? '')
  const [tags, setTags] = useState(sn?.tags.join(', ') ?? '')
  const [error, setError] = useState<string>()
  const vars = snippetVars(command)
  const usedAsStartup = hosts.filter((h) => h.options.startupSnippetId === id).length

  const save = async (): Promise<void> => {
    try {
      const saved = await vaultCall(window.api.snippets.save({ id, label, command, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) }))
      edit({ kind: 'snippet', id: saved.id })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Drawer
      title={sn ? 'Сниппет' : 'Новый сниппет'}
      onClose={() => edit(null)}
      actions={
        sn && (
          <MoreMenu
            trigger={<IconDots size={20} />}
            items={[
              {
                label: 'Удалить сниппет',
                danger: true,
                onClick: () => window.confirm(usedAsStartup ? `Сниппет — стартовый у ${usedAsStartup} хост(ов). Удалить?` : `Удалить «${sn.label}»?`) && void vaultCall(window.api.snippets.delete(sn.id)).then(() => edit(null))
              }
            ]}
          />
        )
      }
      footer={
        <button className="btn-cta" type="button" disabled={!command.trim()} onClick={() => void save()}>
          Сохранить
        </button>
      }
    >
      <section className="drawer-group">
        <div className="addr-row">
          <Tile tone="blue" size={48}>
            <IconBraces size={24} />
          </Tile>
          <IconInput placeholder="Название" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus={!sn} />
        </div>
        <textarea className="notes snippet-text" rows={10} spellCheck={false} placeholder={'docker compose -f {{file:docker-compose.yml}} up -d\ndocker ps'} value={command} onChange={(e) => setCommand(e.target.value)} />
        <IconInput icon={<IconTag size={18} />} placeholder="Теги через запятую" value={tags} onChange={(e) => setTags(e.target.value)} />
        <p className="hint">
          Переменные: <code>{'{{имя}}'}</code> или <code>{'{{имя:по умолчанию}}'}</code> — перед вставкой появится форма. Многострочный сниппет выполняется построчно.
          {vars.length > 0 && (
            <>
              <br />
              Найдены: {vars.map((v) => v.name).join(', ')}
            </>
          )}
        </p>
        {error && <div className="form-error">{error}</div>}
      </section>
    </Drawer>
  )
}
