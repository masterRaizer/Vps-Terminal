import type { Group, Host, PasswordChange, VaultSnapshot } from '@shared/vault'
import { hostPasswordAccount, MemorySecretStore, type SecretStore } from './secrets'
import { validateGroupInput, validateHostInput, VaultRepo } from './vault-repo'
import { CatalogRepo } from './catalog-repo'
import type { GeoIp } from './geoip'
import type { KeyService } from './key-service'

export interface ConnectOverrides {
  password?: string
  passphrase?: string
  rememberPassphrase?: boolean
}

export interface ResolvedConnection {
  host: Host
  username: string
  password: string | null
  privateKey?: string
  passphrase?: string
  agent: boolean
}

/** Repo + credential store: the only place that touches host secrets. */
export class VaultService {
  private readonly catalog: CatalogRepo | null

  constructor(
    private readonly repo: VaultRepo,
    private readonly secrets: SecretStore,
    opts: { catalog?: CatalogRepo; keys?: KeyService; geo?: GeoIp | null } = {}
  ) {
    this.catalog = opts.catalog ?? null
    this.keys = opts.keys ?? null
    this.geo = opts.geo ?? null
  }

  private readonly keys: KeyService | null
  private readonly geo: GeoIp | null

  snapshot(): VaultSnapshot {
    let hosts = this.repo.listHosts()
    // An in-memory store forgets everything on restart: don't claim a saved password that is gone.
    const mem = this.secrets instanceof MemorySecretStore ? this.secrets : null
    if (mem) hosts = hosts.map((h) => ({ ...h, hasPassword: h.hasPassword && mem.has(hostPasswordAccount(h.id)) }))
    return {
      hosts,
      groups: this.repo.listGroups(),
      keys: this.catalog?.listKeys() ?? [],
      identities: this.catalog?.listIdentities() ?? [],
      integrations: this.catalog?.listIntegrations() ?? [],
      secretsPersistent: this.secrets.persistent
    }
  }

  async saveHost(raw: unknown, password: unknown): Promise<Host> {
    const input = validateHostInput(raw)
    if (password !== undefined && password !== null && typeof password !== 'string') throw new Error('Неверный пароль')
    if (typeof password === 'string' && password.length > 4096) throw new Error('Пароль слишком длинный')
    const prev = input.id ? this.repo.getHost(input.id) : null
    // A country typed by hand pins it; clearing it goes back to GeoIP.
    if (input.country && input.countrySource === undefined && input.country !== prev?.country) input.countrySource = 'manual'
    const host = this.repo.saveHost(input)
    await this.applyPassword(host.id, password as PasswordChange)
    if (host.countrySource === 'auto' && (!host.country || prev?.address !== host.address)) await this.fillCountry(host)
    return this.repo.getHost(host.id)!
  }

  /** GeoIP lookup for hosts whose country is still unknown (runs at startup and after imports). */
  async backfillCountries(): Promise<number> {
    let n = 0
    for (const h of this.repo.listHosts()) if (h.countrySource === 'auto' && !h.country && (await this.fillCountry(h))) n++
    return n
  }

  private async fillCountry(h: Host): Promise<boolean> {
    if (!this.geo) return false
    const cc = await this.geo.countryOf(h.address).catch(() => null)
    this.repo.setCountry(h.id, cc, 'auto')
    return Boolean(cc)
  }

  async deleteHost(id: unknown): Promise<void> {
    if (typeof id !== 'string') throw new Error('Неверный id')
    this.repo.deleteHost(id)
    await this.secrets.delete(hostPasswordAccount(id))
  }

  saveGroup(raw: unknown): Group {
    return this.repo.saveGroup(validateGroupInput(raw))
  }

  deleteGroup(id: unknown): void {
    if (typeof id !== 'string') throw new Error('Неверный id')
    this.repo.deleteGroup(id)
  }

  /** Resolves credentials for a saved host. Secrets stay in main. */
  async resolveForConnect(hostId: string, o: ConnectOverrides = {}): Promise<ResolvedConnection> {
    const host = this.repo.getHost(hostId)
    if (!host) throw new Error('Хост не найден')
    const identity = host.identityId ? (this.catalog?.getIdentity(host.identityId) ?? null) : null
    const out: ResolvedConnection = { host, username: identity?.username ?? host.username, agent: false, password: null }

    if (identity) {
      out.password = o.password ?? (identity.hasPassword ? await this.keys!.identityPassword(identity.id) : null)
      if (identity.keyId) Object.assign(out, await this.keys!.unlock(identity.keyId, o.passphrase, o.rememberPassphrase))
      if (!identity.keyId && !out.password && !o.password) out.agent = true
      return out
    }
    if (host.auth === 'password') out.password = o.password ?? (await this.secrets.get(hostPasswordAccount(hostId)))
    if (host.auth === 'agent') out.agent = true
    if (host.auth === 'key') {
      if (!host.keyId) throw new Error(host.keyHint ? `Ключ «${host.keyHint}» ещё не импортирован — откройте «Ключи» → «Импорт папки»` : 'Для хоста не выбран ключ')
      if (!this.keys) throw new Error('Ключи недоступны')
      Object.assign(out, await this.keys.unlock(host.keyId, o.passphrase, o.rememberPassphrase))
    }
    return out
  }

  markConnected(hostId: string): void {
    this.repo.touchConnected(hostId)
  }

  private async applyPassword(hostId: string, change: PasswordChange): Promise<void> {
    if (change === undefined) return
    if (change === null || change === '') {
      await this.secrets.delete(hostPasswordAccount(hostId))
      this.repo.setHasPassword(hostId, false)
    } else {
      await this.secrets.set(hostPasswordAccount(hostId), change)
      this.repo.setHasPassword(hostId, true)
    }
  }
}
