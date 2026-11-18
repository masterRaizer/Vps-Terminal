import { useState } from 'react'
import { useVault } from '@/store/vault'
import { Card, EmptyState, SplitButton } from '@/components/ui'
import { SnippetDrawer } from '@/components/drawers/SnippetDrawer'
import { IconBraces, IconPencil, IconPlus, IconSearch } from '@/components/Icons'

export function SnippetsPage() {
  const v = useVault()
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const list = v.snippets.filter((s) => !query || `${s.label} ${s.command} ${s.tags.join(' ')}`.toLowerCase().includes(query))
  const ed = v.editing
  return (
    <div className="page-with-drawer">
      <div className="page">
        <div className="toolbar toolbar-top">
          <SplitButton icon={<IconPlus size={18} />} label="Новый сниппет" onClick={() => v.edit({ kind: 'snippet' })} />
          <span className="toolbar-spacer" />
          <label className="pane-filter wide">
            <IconSearch size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по сниппетам" />
          </label>
        </div>
        <div className="page-body">
          <section>
            <h2 className="section-title">Сниппеты</h2>
            {list.length ? (
              <div className="card-grid">
                {list.map((s) => (
                  <Card
                    key={s.id}
                    icon={<IconBraces size={22} />}
                    title={s.label}
                    subtitle={s.command.split('\n')[0]}
                    selected={ed?.kind === 'snippet' && ed.id === s.id}
                    onClick={() => v.edit({ kind: 'snippet', id: s.id })}
                    trailing={<IconPencil size={16} />}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<IconBraces size={26} />}
                title={query ? 'Ничего не найдено' : 'Сниппетов пока нет'}
                text="Сохраняйте частые команды: обновления, docker compose, проверки nginx. Вставляются из правой панели терминала."
              />
            )}
          </section>
        </div>
      </div>
      {ed?.kind === 'snippet' && <SnippetDrawer key={ed.id ?? 'new'} id={ed.id} />}
    </div>
  )
}
