import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

/** scrypt parameters (~0.5 s on a laptop; 128 MiB). Stored in the blob so they can be raised later. */
export const KDF = { N: 1 << 17, r: 8, p: 1 }

export interface Envelope {
  v: 1
  kdf: { alg: 'scrypt'; N: number; r: number; p: number; salt: string }
  iv: string
  tag: string
  ct: string
}

export function deriveKey(masterPassword: string, salt: Buffer, params = KDF): Promise<Buffer> {
  if (masterPassword.length < 8) return Promise.reject(new Error('Мастер-пароль: минимум 8 символов'))
  return new Promise((resolve, reject) =>
    scryptCb(masterPassword.normalize('NFKC'), salt, 32, { N: params.N, r: params.r, p: params.p, maxmem: 256 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)))
  )
}

export const newSalt = (): Buffer => randomBytes(16)

/** Compress + AES-256-GCM. The KDF header is authenticated as associated data. */
export function seal(plain: unknown, key: Buffer, salt: Buffer, params = KDF): string {
  const kdf = { alg: 'scrypt' as const, N: params.N, r: params.r, p: params.p, salt: salt.toString('base64') }
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(Buffer.from(JSON.stringify(kdf)))
  const ct = Buffer.concat([c.update(deflateRawSync(Buffer.from(JSON.stringify(plain), 'utf-8'))), c.final()])
  const env: Envelope = { v: 1, kdf, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') }
  return JSON.stringify(env)
}

export function parseEnvelope(blob: string): Envelope {
  let env: Envelope
  try {
    env = JSON.parse(blob)
  } catch {
    throw new Error('На сервере не хранилище Vps Terminal SSH')
  }
  if (env?.v !== 1 || env.kdf?.alg !== 'scrypt') throw new Error('Неизвестная версия хранилища — обновите приложение')
  return env
}

export function open<T>(blob: string, key: Buffer): T {
  const env = parseEnvelope(blob)
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'))
  d.setAAD(Buffer.from(JSON.stringify(env.kdf)))
  d.setAuthTag(Buffer.from(env.tag, 'base64'))
  let plain: Buffer
  try {
    plain = Buffer.concat([d.update(Buffer.from(env.ct, 'base64')), d.final()])
  } catch {
    throw new Error('Не удалось расшифровать: неверный мастер-пароль')
  }
  return JSON.parse(inflateRawSync(plain).toString('utf-8')) as T
}
