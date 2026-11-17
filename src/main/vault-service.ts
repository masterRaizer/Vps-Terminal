import type { Group, Host, PasswordChange, VaultSnapshot } from '@shared/vault'
import { hostPasswordAccount, MemorySecretStore, type SecretStore } from './secrets'
import { validateGroupInput, validateHostInput, VaultRepo } from './vault-repo'

/** Repo + credential store: the only place that touches host secrets. */
export class VaultService {
  constructor(private readonly repo: VaultRepo, private readonly secrets: SecretStore) {}

  snapshot(): VaultSnapshot {
    let hosts = this.repo.listHosts()
    // An in-memory store forgets everything on restart: don't claim a saved password that is gone.
    const mem = this.secrets instanceof MemorySecretStore ? this.secrets : null
    if (mem) hosts = hosts.map((h) => ({ ...h, hasPassword: h.hasPassword && mem.has(hostPasswordAccount(h.id)) }))
    return { hosts, groups: this.repo.listGroups(), secretsPersistent: this.secrets.persistent }
  }

  async saveHost(raw: unknown, password: unknown): Promise<Host> {
    const input = validateHostInput(raw)
    if (password !== undefined && password !== null && typeof password !== 'string') throw new Error('Неверный пароль')
    if (typeof password === 'string' && password.length > 4096) throw new Error('Пароль слишком длинный')
    const host = this.repo.saveHost(input)
    await this.applyPassword(host.id, password as PasswordChange)
    return this.repo.getHost(host.id)!
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

  /** Resolves connection parameters for a saved host. Secrets stay in main. */
  async resolveForConnect(hostId: string): Promise<{ host: Host; password: string | null }> {
    const host = this.repo.getHost(hostId)
    if (!host) throw new Error('Хост не найден')
    const password = host.auth === 'password' ? await this.secrets.get(hostPasswordAccount(hostId)) : null
    return { host, password }
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
