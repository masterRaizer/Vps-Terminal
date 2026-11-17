import { useEffect, useMemo, useRef, useState } from 'react'
import type { Host } from '@shared/vault'
import { useSessions } from '@/store/sessions'
import { countHostsDeep, groupPath, useVault } from '@/store/vault'
import { parseTarget } from '@/lib/parseTarget'
import { connectHost } from '@/lib/connectHost'
import { Card, EmptyState, SplitButton, ToolButton } from '@/components/ui'
import { HostDrawer } from '@/components/drawers/HostDrawer'
import { GroupDrawer } from '@/components/drawers/GroupDrawer'
import { QuickConnectDrawer } from '@/components/drawers/QuickConnectDrawer'
import { IntegrationDrawer } from '@/components/drawers/IntegrationDrawer'
import { Flag } from '@/components/Flag'
import { vaultCall } from '@/store/vault'
import {
  IconChevronRight,
  IconDownload,
  IconGroup,
  IconHosts,
  IconList,
  IconGrid,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconServer,
  IconStar,
  IconTag,
  IconTerminal
} from '@/components/Icons'

const matches = (h: Host, q: string): boolean =>
  [h.label, h.address, h.username, h.country ?? '', ...h.tags].some((v) => v.toLowerCase().includes(q))

export function HostsPage() {
  const v = useVault()
  const { focusSearchTick, tabs } = useSessions()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [listView, setListView] = useState(false)
  const [showTags, setShowTags] = useState(false)
  const [notice, setNotice] = useState<string>()

  useEffect(() => {
    searchRef.current?.focus()
  }, [focusSearchTick])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const q = query.trim().toLowerCase()
  const allTags = useMemo(() => [...new Set(v.hosts.flatMap((h) => h.tags))].sort(), [v.hosts])
  const searching = Boolean(q || v.tagFilter)
  const liveHostIds = new Set(tabs.filter((t) => t.status === 'ready').map((t) => t.hostId))

  const visibleHosts = v.hosts.filter((h) =>
    searching ? (!q || matches(h, q)) && (!v.tagFilter || h.tags.includes(v.tagFilter)) : h.groupId === v.currentGroupId
  )
  const visibleGroups = searching
    ? v.groups.filter((g) => q && g.name.toLowerCase().includes(q))
    : v.groups.filter((g) => g.parentId === v.currentGroupId)
  const favorites = !searching && v.currentGroupId === null ? v.hosts.filter((h) => h.favorite) : []
  const path = groupPath(v.currentGroupId, v.groups)

  const quickConnect = (): void => {
    const t = parseTarget(query)
    v.edit({ kind: 'quick', host: t.host, port: t.port ?? 22, username: t.username ?? 'root' })
  }

  const onSubmit = (): void => {
    // Enter on an exact single match connects to it; otherwise open quick connect.
    if (q && visibleHosts.length === 1 && !query.includes('@') && !query.startsWith('ssh ')) connectHost(visibleHosts[0])
    else if (q) quickConnect()
  }

  const [syncing, setSyncing] = useState<string | null>(null)
  const syncIntegration = async (id: string): Promise<void> => {
    setSyncing(id)
    try {
      const r = await vaultCall(window.api.integrations.sync(id))
      setNotice(`Remnawave: нод ${r.total}, добавлено ${r.created}, обновлено ${r.updated}${r.missing ? `, пропало из панели ${r.missing}` : ''}`)
    } catch (e) {
      setNotice(`Синхронизация не удалась: ${(e as Error).message}`)
    } finally {
      setSyncing(null)
    }
  }
  const integrationOf = (groupId: string) => v.integrations.find((i) => i.groupId === groupId)

  const runImport = async (): Promise<void> => {
    try {
      const r = await window.api.vault.importHosts()
      if (!r) return
      await v.load()
      setNotice(`Импортировано: ${r.added}, пропущено (уже есть): ${r.skipped}${r.errors.length ? `, ошибок: ${r.errors.length} — ${r.errors[0]}` : ''}`)
    } catch (e) {
      setNotice(`Импорт не удался: ${(e as Error).message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')}`)
    }
  }

  const hostCard = (h: Host) => (
    <Card
      key={h.id}
      tone={h.color ?? undefined}
      icon={<IconServer size={22} />}
      flag={h.country}
      title={h.label}
      subtitle={`ssh, ${h.username}${h.port !== 22 ? `, :${h.port}` : ''}${h.tags.length ? ` · ${h.tags.join(', ')}` : ''}`}
      selected={v.editing?.kind === 'host' && v.editing.id === h.id}
      onClick={() => connectHost(h)}
      badge={liveHostIds.has(h.id) ? <span className="live-dot" title="Сессия открыта" /> : h.favorite ? <IconStar size={14} className="fav-mark" /> : undefined}
      trailing={
        <span
          role="button"
          tabIndex={0}
          className="icon-btn"
          title="Изменить"
          onClick={(e) => {
            e.stopPropagation()
            v.edit({ kind: 'host', id: h.id })
          }}
        >
          <IconPencil size={17} />
        </span>
      }
    />
  )

  const editing = v.editing
  return (
    <div className="page-with-drawer">
      <div className="page">
        <form
          className="omnibar"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Найдите хост или введите ssh user@hostname…"
            spellCheck={false}
          />
          <button className="omni-btn" type="button" disabled={!q} onClick={quickConnect}>
            Подключить
          </button>
        </form>

        <div className="toolbar">
          <SplitButton
            icon={<IconPlus size={18} />}
            label="Новый хост"
            onClick={() => v.edit({ kind: 'host', groupId: v.currentGroupId })}
            menu={[
              { label: 'Новый хост', onClick: () => v.edit({ kind: 'host', groupId: v.currentGroupId }) },
              { label: 'Новая группа', onClick: () => v.edit({ kind: 'group', parentId: v.currentGroupId }) },
              { label: 'Импорт hosts.json…', onClick: () => void runImport() },
              { label: 'Подключить панель Remnawave…', onClick: () => v.edit({ kind: 'integration' }) }
            ]}
          />
          <ToolButton icon={<IconTerminal size={18} />} label="Быстрое подключение" onClick={quickConnect} />
          <ToolButton icon={<IconDownload size={18} />} label="Импорт" onClick={() => void runImport()} />
          <ToolButton icon={<IconRefresh size={18} />} label="Remnawave" onClick={() => v.edit(v.integrations[0] ? { kind: 'integration', id: v.integrations[0].id } : { kind: 'integration' })} />
          <span className="toolbar-spacer" />
          <ToolButton icon={listView ? <IconGrid size={18} /> : <IconList size={18} />} title={listView ? 'Плитка' : 'Список'} onClick={() => setListView((x) => !x)} />
          <ToolButton icon={<IconTag size={18} />} title="Фильтр по тегам" onClick={() => setShowTags((x) => !x)} disabled={!allTags.length} />
        </div>

        {showTags && allTags.length > 0 && (
          <div className="tag-bar">
            {allTags.map((t) => (
              <button key={t} className={`chip ${v.tagFilter === t ? 'on' : ''}`} onClick={() => v.setTagFilter(v.tagFilter === t ? null : t)}>
                {t}
              </button>
            ))}
          </div>
        )}

        {notice && (
          <div className="notice" role="status">
            {notice}
            <button className="icon-btn" onClick={() => setNotice(undefined)} aria-label="Скрыть">
              ×
            </button>
          </div>
        )}
        {!v.secretsPersistent && (
          <div className="notice warn">Диспетчер учётных данных недоступен — сохранённые пароли живут только до закрытия приложения.</div>
        )}

        <div className={`page-body ${listView ? 'as-list' : ''}`}>
          {!searching && path.length > 0 && (
            <nav className="breadcrumbs">
              <button onClick={() => v.openGroup(null)}>Все хосты</button>
              {path.map((g, i) => (
                <span key={g.id} className="crumb">
                  <IconChevronRight size={15} />
                  {i === path.length - 1 ? (
                    <span className="crumb-current">
                      {g.name}
                      <button className="icon-btn small" title="Изменить группу" onClick={() => v.edit({ kind: 'group', id: g.id })}>
                        <IconPencil size={15} />
                      </button>
                      {integrationOf(g.id) && (
                        <button className={`btn-chip ${syncing ? 'spin' : ''}`} onClick={() => void syncIntegration(integrationOf(g.id)!.id)} disabled={Boolean(syncing)}>
                          <IconRefresh size={14} /> {syncing ? 'Синхронизация…' : 'Синхронизировать с панелью'}
                        </button>
                      )}
                    </span>
                  ) : (
                    <button onClick={() => v.openGroup(g.id)}>{g.name}</button>
                  )}
                </span>
              ))}
            </nav>
          )}

          {favorites.length > 0 && (
            <section>
              <h2 className="section-title">Избранное</h2>
              <div className="card-grid">{favorites.map(hostCard)}</div>
            </section>
          )}

          {visibleGroups.length > 0 && (
            <section>
              <h2 className="section-title">Группы</h2>
              <div className="card-grid">
                {visibleGroups.map((g) => {
                  const n = countHostsDeep(g.id, v.groups, v.hosts)
                  const integ = integrationOf(g.id)
                  return (
                    <Card
                      key={g.id}
                      tone={g.color ?? undefined}
                      icon={<IconGroup size={22} />}
                      title={g.name}
                      subtitle={`${integ ? 'Remnawave · ' : ''}${n} ${plural(n, 'хост', 'хоста', 'хостов')}${integ?.lastError ? ' · ошибка синхронизации' : ''}`}
                      selected={editing?.kind === 'group' && editing.id === g.id}
                      onClick={() => {
                        setQuery('')
                        v.setTagFilter(null)
                        v.openGroup(g.id)
                      }}
                      trailing={
                        <>
                          {integ && (
                            <span
                              role="button"
                              tabIndex={0}
                              className={`icon-btn ${syncing === integ.id ? 'spin' : ''}`}
                              title="Синхронизировать с панелью"
                              onClick={(e) => {
                                e.stopPropagation()
                                void syncIntegration(integ.id)
                              }}
                            >
                              <IconRefresh size={17} />
                            </span>
                          )}
                          <span
                            role="button"
                            tabIndex={0}
                            className="icon-btn"
                            title="Изменить"
                            onClick={(e) => {
                              e.stopPropagation()
                              v.edit(integ ? { kind: 'integration', id: integ.id } : { kind: 'group', id: g.id })
                            }}
                          >
                            <IconPencil size={17} />
                          </span>
                        </>
                      }
                    />
                  )
                })}
              </div>
            </section>
          )}

          <section>
            <h2 className="section-title">{searching ? 'Найдено' : 'Хосты'}</h2>
            {visibleHosts.length > 0 ? (
              <div className="card-grid">{visibleHosts.map(hostCard)}</div>
            ) : searching ? (
              <EmptyState icon={<IconHosts size={26} />} title="Ничего не найдено" text="Нажмите «Подключить», чтобы зайти по введённому адресу." />
            ) : v.loaded ? (
              <EmptyState
                icon={<IconHosts size={26} />}
                title={v.currentGroupId ? 'В группе нет хостов' : 'Сохранённых хостов пока нет'}
                text="Добавьте хост или импортируйте список из hosts.json."
                action={
                  <button className="btn-soft" onClick={() => v.edit({ kind: 'host', groupId: v.currentGroupId })}>
                    Добавить хост
                  </button>
                }
              />
            ) : null}
            {v.error && <div className="form-error">{v.error}</div>}
          </section>
        </div>
      </div>

      {editing?.kind === 'host' && <HostDrawer key={editing.id ?? 'new'} hostId={editing.id} groupId={editing.groupId} />}
      {editing?.kind === 'group' && <GroupDrawer key={editing.id ?? 'new'} groupId={editing.id} parentId={editing.parentId} />}
      {editing?.kind === 'integration' && <IntegrationDrawer key="integration" id={editing.id} />}
      {editing?.kind === 'quick' && <QuickConnectDrawer key={`${editing.host}:${editing.port}`} initial={editing} />}
    </div>
  )
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
