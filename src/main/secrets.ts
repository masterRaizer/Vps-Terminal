/** OS credential store (Windows Credential Manager via keytar), with an in-memory fallback. */

export interface SecretStore {
  readonly persistent: boolean
  get(account: string): Promise<string | null>
  set(account: string, secret: string): Promise<void>
  delete(account: string): Promise<void>
}

export const SERVICE = 'Vps Terminal SSH'

export class MemorySecretStore implements SecretStore {
  readonly persistent = false
  private map = new Map<string, string>()
  has(account: string): boolean {
    return this.map.has(account)
  }
  async get(account: string): Promise<string | null> {
    return this.map.get(account) ?? null
  }
  async set(account: string, secret: string): Promise<void> {
    this.map.set(account, secret)
  }
  async delete(account: string): Promise<void> {
    this.map.delete(account)
  }
}

type Keytar = typeof import('keytar')

class KeytarSecretStore implements SecretStore {
  readonly persistent = true
  constructor(private readonly kt: Keytar) {}
  get(account: string): Promise<string | null> {
    return this.kt.getPassword(SERVICE, account)
  }
  set(account: string, secret: string): Promise<void> {
    return this.kt.setPassword(SERVICE, account, secret)
  }
  async delete(account: string): Promise<void> {
    await this.kt.deletePassword(SERVICE, account)
  }
}

export function createSecretStore(log: (msg: string) => void = console.warn): SecretStore {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const kt = require('keytar') as Keytar
    return new KeytarSecretStore(kt)
  } catch (e) {
    log(`keytar unavailable, secrets are kept in memory only: ${(e as Error).message}`)
    return new MemorySecretStore()
  }
}

export const hostPasswordAccount = (hostId: string): string => `host:${hostId}:password`
