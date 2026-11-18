import { randomUUID } from 'node:crypto'
import { DEFAULT_HOST_OPTIONS, type AuthMethod, type CountrySource, type Group, type GroupInput, type Host, type HostInput, type HostOptions } from '@shared/vault'
import type { Db } from './db'

interface HostRow {
  id: string
  label: string
  address: string
  port: number
  username: string
  auth: AuthMethod
  key_id: string | null
  group_id: string | null
  color: string | null
  tags: string
  favorite: number
  notes: string
  has_password: number
  options: string
  country: string | null
  country_source: CountrySource
  identity_id: string | null
  key_hint: string | null
  source: string | null
  external_id: string | null
  created_at: number
  updated_at: number
  last_connected_at: number | null
}

interface GroupRow {
  id: string
  name: string
  parent_id: string | null
  color: string | null
  created_at: number
  updated_at: number
}

const toHost = (r: HostRow): Host => ({
  id: r.id,
  label: r.label,
  address: r.address,
  port: r.port,
  username: r.username,
  auth: r.auth,
  keyId: r.key_id,
  groupId: r.group_id,
  color: r.color,
  tags: safeTags(r.tags),
  favorite: r.favorite === 1,
  notes: r.notes,
  options: parseOptions(r.options),
  country: r.country,
  countrySource: r.country_source,
  identityId: r.identity_id,
  keyHint: r.key_hint,
  source: r.source,
  externalId: r.external_id,
  hasPassword: r.has_password === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lastConnectedAt: r.last_connected_at
})

const toGroup = (r: GroupRow): Group => ({
  id: r.id,
  name: r.name,
  parentId: r.parent_id,
  color: r.color,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

function parseOptions(json: string): HostOptions {
  try {
    return validateOptions(JSON.parse(json))
  } catch {
    return { ...DEFAULT_HOST_OPTIONS }
  }
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

export function validateOptions(raw: unknown): HostOptions {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const env: Record<string, string> = {}
  if (typeof r.env === 'object' && r.env !== null) {
    const entries = Object.entries(r.env as Record<string, unknown>)
    if (entries.length > 50) throw new Error('Слишком много переменных окружения')
    for (const [k, v] of entries) {
      if (!ENV_NAME.test(k)) throw new Error(`Переменная «${k}»: недопустимое имя`)
      if (typeof v !== 'string' || v.length > 1024) throw new Error(`Переменная «${k}»: недопустимое значение`)
      env[k] = v
    }
  }
  const theme = r.termTheme
  if (theme !== undefined && theme !== null && (typeof theme !== 'string' || !/^[a-z0-9-]{1,40}$/.test(theme))) throw new Error('Неверная тема')
  return {
    backspace: r.backspace === 'ctrl-h' ? 'ctrl-h' : 'del',
    agentForward: r.agentForward === true,
    env,
    termTheme: (theme as string | null | undefined) ?? null,
    startupSnippetId: typeof r.startupSnippetId === 'string' && r.startupSnippetId.length <= 64 ? r.startupSnippetId : null
  }
}

function safeTags(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((t) => typeof t === 'string') : []
  } catch {
    return []
  }
}

const COLOR_RE = /^#[0-9a-f]{6}$/i

export function validCountry(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string' || !/^[A-Za-z]{2}$/.test(v)) throw new Error('Страна: двухбуквенный код ISO')
  return v.toUpperCase()
}
const str = (v: unknown, field: string, max: number, required = false): string => {
  if (v === undefined || v === null) v = ''
  if (typeof v !== 'string') throw new Error(`${field}: ожидается строка`)
  const s = v.trim()
  if (required && !s) throw new Error(`${field}: обязательное поле`)
  if (s.length > max) throw new Error(`${field}: слишком длинно`)
  return s
}
const optId = (v: unknown, field: string): string | null => {
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string' || v.length > 64) throw new Error(`${field}: неверный id`)
  return v
}
const optColor = (v: unknown): string | null => {
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string' || !COLOR_RE.test(v)) throw new Error('Цвет: неверный формат')
  return v.toLowerCase()
}

/** Validates untrusted host input coming over IPC. */
export function validateHostInput(raw: unknown): HostInput {
  if (typeof raw !== 'object' || raw === null) throw new Error('Неверные данные хоста')
  const r = raw as Record<string, unknown>
  const address = str(r.address, 'Адрес', 255, true)
  if (/\s/.test(address)) throw new Error('Адрес: без пробелов')
  const port = Number(r.port ?? 22)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Порт: 1–65535')
  const auth = (r.auth ?? 'password') as AuthMethod
  if (!['password', 'key', 'agent'].includes(auth)) throw new Error('Неверный способ входа')
  const tagsRaw = Array.isArray(r.tags) ? r.tags : []
  const tags = [...new Set(tagsRaw.map((t) => str(t, 'Тег', 40)).filter(Boolean))].slice(0, 30)
  return {
    id: optId(r.id, 'id') ?? undefined,
    label: str(r.label, 'Название', 120) || address,
    address,
    port,
    username: str(r.username, 'Пользователь', 128, true),
    auth,
    keyId: optId(r.keyId, 'Ключ'),
    groupId: optId(r.groupId, 'Группа'),
    color: optColor(r.color),
    tags,
    favorite: r.favorite === true,
    notes: str(r.notes, 'Заметки', 4000),
    options: validateOptions(r.options),
    country: validCountry(r.country),
    countrySource: r.countrySource === 'manual' || r.countrySource === 'panel' ? r.countrySource : 'auto',
    identityId: optId(r.identityId, 'Профиль доступа'),
    keyHint: r.keyHint ? str(r.keyHint, 'Подсказка ключа', 200) || null : null
  }
}

export function validateGroupInput(raw: unknown): GroupInput {
  if (typeof raw !== 'object' || raw === null) throw new Error('Неверные данные группы')
  const r = raw as Record<string, unknown>
  return {
    id: optId(r.id, 'id') ?? undefined,
    name: str(r.name, 'Название группы', 80, true),
    parentId: optId(r.parentId, 'Родитель'),
    color: optColor(r.color)
  }
}

export class VaultRepo {
  constructor(private readonly db: Db, private readonly now: () => number = Date.now) {}

  listHosts(): Host[] {
    return (this.db.prepare('SELECT * FROM hosts ORDER BY label COLLATE NOCASE').all() as HostRow[]).map(toHost)
  }

  listGroups(): Group[] {
    return (this.db.prepare('SELECT * FROM groups ORDER BY name COLLATE NOCASE').all() as GroupRow[]).map(toGroup)
  }

  getHost(id: string): Host | null {
    const r = this.db.prepare('SELECT * FROM hosts WHERE id = ?').get(id) as HostRow | undefined
    return r ? toHost(r) : null
  }

  saveHost(input: HostInput): Host {
    if (input.groupId && !this.groupExists(input.groupId)) throw new Error('Группа не найдена')
    if (input.identityId && !this.db.prepare('SELECT 1 FROM identities WHERE id = ?').get(input.identityId)) throw new Error('Профиль доступа не найден')
    if (input.keyId && !this.db.prepare('SELECT 1 FROM ssh_keys WHERE id = ?').get(input.keyId)) throw new Error('Ключ не найден')
    const prev = input.id ? this.getHost(input.id) : null
    const t = this.now()
    const values = {
      label: input.label,
      address: input.address,
      port: input.port,
      username: input.username,
      auth: input.auth,
      key_id: input.keyId,
      group_id: input.groupId,
      color: input.color,
      tags: JSON.stringify(input.tags),
      favorite: input.favorite ? 1 : 0,
      notes: input.notes,
      options: JSON.stringify(input.options ?? DEFAULT_HOST_OPTIONS),
      country: input.country !== undefined ? input.country : (prev?.country ?? null),
      country_source: input.countrySource ?? prev?.countrySource ?? 'auto',
      identity_id: input.identityId !== undefined ? input.identityId : (prev?.identityId ?? null),
      key_hint: input.keyHint !== undefined ? input.keyHint : (prev?.keyHint ?? null),
      t
    }
    if (prev) {
      this.db
        .prepare(
          `UPDATE hosts SET label=@label, address=@address, port=@port, username=@username, auth=@auth,
             key_id=@key_id, group_id=@group_id, color=@color, tags=@tags, favorite=@favorite, notes=@notes,
             options=@options, country=@country, country_source=@country_source, identity_id=@identity_id,
             key_hint=@key_hint, updated_at=@t WHERE id=@id`
        )
        .run({ ...values, id: prev.id })
      return this.getHost(prev.id)!
    }
    const id = input.id ?? randomUUID()
    this.db
      .prepare(
        `INSERT INTO hosts (id,label,address,port,username,auth,key_id,group_id,color,tags,favorite,notes,options,country,country_source,identity_id,key_hint,created_at,updated_at)
         VALUES (@id,@label,@address,@port,@username,@auth,@key_id,@group_id,@color,@tags,@favorite,@notes,@options,@country,@country_source,@identity_id,@key_hint,@t,@t)`
      )
      .run({ ...values, id })
    return this.getHost(id)!
  }

  setCountry(id: string, country: string | null, source: CountrySource): void {
    this.db.prepare('UPDATE hosts SET country = ?, country_source = ? WHERE id = ?').run(country, source, id)
  }

  /** Marks a host as managed by an integration. */
  setSource(id: string, source: string | null, externalId: string | null): void {
    this.db.prepare('UPDATE hosts SET source = ?, external_id = ? WHERE id = ?').run(source, externalId, id)
  }

  hostsBySource(source: string): Host[] {
    return (this.db.prepare('SELECT * FROM hosts WHERE source = ?').all(source) as HostRow[]).map(toHost)
  }

  /** Binds hosts waiting for a key with this file name; returns how many were bound. */
  bindKeyHint(hint: string, keyId: string): number {
    return this.db
      .prepare("UPDATE hosts SET key_id = ?, auth = 'key' WHERE key_id IS NULL AND lower(key_hint) = lower(?)")
      .run(keyId, hint).changes
  }

  setHasPassword(id: string, has: boolean): void {
    this.db.prepare('UPDATE hosts SET has_password = ? WHERE id = ?').run(has ? 1 : 0, id)
  }

  touchConnected(id: string): void {
    this.db.prepare('UPDATE hosts SET last_connected_at = ? WHERE id = ?').run(this.now(), id)
  }

  deleteHost(id: string): void {
    this.db.prepare('DELETE FROM hosts WHERE id = ?').run(id)
  }

  saveGroup(input: GroupInput): Group {
    const t = this.now()
    if (input.parentId) {
      if (!this.groupExists(input.parentId)) throw new Error('Родительская группа не найдена')
      if (input.id && this.wouldCycle(input.id, input.parentId)) throw new Error('Группа не может быть вложена сама в себя')
    }
    if (input.id && this.groupExists(input.id)) {
      this.db
        .prepare('UPDATE groups SET name=?, parent_id=?, color=?, updated_at=? WHERE id=?')
        .run(input.name, input.parentId, input.color, t, input.id)
      return this.getGroup(input.id)!
    }
    const id = input.id ?? randomUUID()
    this.db
      .prepare('INSERT INTO groups (id,name,parent_id,color,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .run(id, input.name, input.parentId, input.color, t, t)
    return this.getGroup(id)!
  }

  /** Deletes a group; its hosts and subgroups move up to the group's parent. */
  deleteGroup(id: string): void {
    const g = this.getGroup(id)
    if (!g) return
    this.db.transaction(() => {
      this.db.prepare('UPDATE hosts SET group_id = ? WHERE group_id = ?').run(g.parentId, id)
      this.db.prepare('UPDATE groups SET parent_id = ? WHERE parent_id = ?').run(g.parentId, id)
      this.db.prepare('DELETE FROM groups WHERE id = ?').run(id)
    })()
  }

  private getGroup(id: string): Group | null {
    const r = this.db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRow | undefined
    return r ? toGroup(r) : null
  }

  private groupExists(id: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM groups WHERE id = ?').get(id))
  }

  private wouldCycle(id: string, parentId: string): boolean {
    let cur: string | null = parentId
    for (let i = 0; cur && i < 1000; i++) {
      if (cur === id) return true
      cur = this.getGroup(cur)?.parentId ?? null
    }
    return false
  }
}
