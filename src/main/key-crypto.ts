import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { SecretStore } from './secrets'

const ACCOUNT = 'vault:data-key'

/**
 * Encrypts private keys at rest with AES-256-GCM. The 32-byte data key lives in the OS credential
 * store (Windows Credential Manager caps a secret at ~2.5 KB, too small for an RSA-4096 key).
 */
export class DataKeyCipher {
  private key?: Buffer

  constructor(private readonly secrets: SecretStore) {}

  private async dataKey(): Promise<Buffer> {
    if (this.key) return this.key
    const stored = await this.secrets.get(ACCOUNT)
    if (stored) {
      const k = Buffer.from(stored, 'base64')
      if (k.length !== 32) throw new Error('Ключ шифрования хранилища повреждён')
      this.key = k
    } else {
      this.key = randomBytes(32)
      await this.secrets.set(ACCOUNT, this.key.toString('base64'))
    }
    return this.key
  }

  async encrypt(plain: string): Promise<Buffer> {
    const iv = randomBytes(12)
    const c = createCipheriv('aes-256-gcm', await this.dataKey(), iv)
    const ct = Buffer.concat([c.update(plain, 'utf-8'), c.final()])
    return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), ct])
  }

  async decrypt(blob: Buffer): Promise<string> {
    if (blob[0] !== 1) throw new Error('Неизвестный формат зашифрованного ключа')
    const iv = blob.subarray(1, 13)
    const tag = blob.subarray(13, 29)
    const d = createDecipheriv('aes-256-gcm', await this.dataKey(), iv)
    d.setAuthTag(tag)
    try {
      return Buffer.concat([d.update(blob.subarray(29)), d.final()]).toString('utf-8')
    } catch {
      throw new Error('Не удалось расшифровать ключ: ключ хранилища в диспетчере учётных данных изменился или утерян')
    }
  }
}
