import { useState } from 'react'
import { countHostsDeep, useVault } from '@/store/vault'
import { Tile } from '../ui'
import { Flag } from '../Flag'
import { IconChevronLeft, IconGroup, IconLaptop, IconSearch, IconServer } from '../Icons'

/** In-pane "Select host" view: groups, hosts, search and a Local button. */
export function PaneHostPicker({ onPick, onLocal, onBack }: { onPick: (h: { id: string; label: string; country: string | null }) => void; onLocal: () => void; onBack?: () => void }) {
  const { hosts, groups } = useVault()
  const [q, setQ] = useState('')
  const [groupId, setGroupId] = useState<string | null>(null)
  const query = q.trim().toLowerCase()
  const shownGroups = query ? groups.filter((g) => g.name.toLowerCase().includes(query)) : groups.filter((g) => g.parentId === groupId)
  const shownHosts = query
    ? hosts.filter((h) => `${h.label} ${h.address} ${h.username} ${h.tags.join(' ')}`.toLowerCase().includes(query))
    : hosts.filter((h) => h.groupId === groupId)
  const current = groups.find((g) => g.id === groupId)

  return (
    <div className="pane-picker">
      <header className="pp-head">
        {(onBack || groupId) && (
          <button className="icon-btn" title="Назад" onClick={() => (groupId ? setGroupId(current?.parentId ?? null) : onBack?.())}>
            <IconChevronLeft size={20} />
          </button>
        )}
        <div className="pp-title">
          <strong>Выбор хоста</strong>
          <span>{current ? current.name : 'Хранилище'}</span>
        </div>
        <span className="toolbar-spacer" />
        <button className="btn-local" onClick={onLocal}>
          <IconLaptop size={17} /> Локально
        </button>
      </header>
      <label className="pp-search">
        <IconSearch size={18} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" />
      </label>
      <div className="pp-body">
        {shownGroups.length > 0 && (
          <>
            <h3 className="section-title">Группы</h3>
            {shownGroups.map((g) => {
              const n = countHostsDeep(g.id, groups, hosts)
              return (
                <button key={g.id} className="pp-row" onClick={() => (setQ(''), setGroupId(g.id))}>
                  <Tile tone={g.color ?? 'blue'} size={44}>
                    <IconGroup size={22} />
                  </Tile>
                  <span className="pp-text">
                    <b>{g.name}</b>
                    <small>
                      {n} {n % 10 === 1 && n % 100 !== 11 ? 'хост' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'хоста' : 'хостов'}
                    </small>
                  </span>
                </button>
              )
            })}
          </>
        )}
        <h3 className="section-title">Хосты</h3>
        {shownHosts.map((h) => (
          <button key={h.id} className="pp-row" onClick={() => onPick(h)}>
            <span className="tile-wrap">
              <Tile tone={h.color ?? 'blue'} size={44}>
                <IconServer size={22} />
              </Tile>
              {h.country && <Flag cc={h.country} size={18} className="tile-flag" />}
            </span>
            <span className="pp-text">
              <b>{h.label}</b>
              <small>ssh, {h.username}</small>
            </span>
          </button>
        ))}
        {!shownHosts.length && <p className="hint">{query ? 'Ничего не найдено' : 'В этой группе нет хостов'}</p>}
      </div>
    </div>
  )
}
