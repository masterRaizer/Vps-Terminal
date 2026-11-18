import { createHash } from 'node:crypto'
import { utils } from 'ssh2'
import type { KeyType } from '@shared/vault'

export interface KeyInfo {
  type: KeyType
  bits: number | null
  publicKey: string | null
  fingerprint: string | null
  encrypted: boolean
}

const MAX_KEY_BYTES = 64 * 1024

function typeOf(sshType: string): KeyType {
  if (sshType.includes('ed25519')) return 'ed25519'
  if (sshType.includes('rsa')) return 'rsa'
  if (sshType.includes('ecdsa')) return 'ecdsa'
  return 'unknown'
}

function rsaBits(pub: Buffer): number | null {
  // ssh-rsa blob: string type, mpint e, mpint n
  try {
    let off = 0
    const read = (): Buffer => {
      const len = pub.readUInt32BE(off)
      const v = pub.subarray(off + 4, off + 4 + len)
      off += 4 + len
      return v
    }
    read()
    read()
    const n = read()
    let bytes = n.length
    if (n[0] === 0) bytes--
    return Math.round((bytes * 8) / 1024) * 1024
  } catch {
    return null
  }
}

const isPassphraseError = (e: Error): boolean => /passphrase|encrypted/i.test(e.message)

/** Inspects a private key. Throws on garbage; reports `encrypted` when a passphrase is needed. */
export function inspectPrivateKey(text: string, passphrase?: string, publicText?: string): KeyInfo {
  if (Buffer.byteLength(text) > MAX_KEY_BYTES) throw new Error('Файл слишком большой для ключа')
  const parsed = utils.parseKey(text, passphrase)
  if (parsed instanceof Error) {
    if (!passphrase && isPassphraseError(parsed)) {
      const fromPub = publicText ? inspectPublicKey(publicText) : null
      return { type: fromPub?.type ?? guessType(text), bits: fromPub?.bits ?? null, publicKey: fromPub?.publicKey ?? null, fingerprint: fromPub?.fingerprint ?? null, encrypted: true }
    }
    throw new Error(passphrase && isPassphraseError(parsed) ? 'Неверная парольная фраза' : `Не похоже на приватный ключ: ${parsed.message}`)
  }
  const key = Array.isArray(parsed) ? parsed[0] : parsed
  if (!key.isPrivateKey()) throw new Error('Это публичный ключ, нужен приватный')
  const pub = key.getPublicSSH()
  const type = typeOf(key.type)
  return {
    type,
    bits: type === 'rsa' ? rsaBits(pub) : null,
    publicKey: `${key.type} ${pub.toString('base64')}${key.comment ? ` ${key.comment}` : ''}`,
    fingerprint: fingerprintOf(pub),
    encrypted: Boolean(passphrase) || /ENCRYPTED|Encryption: (?!none)/.test(text)
  }
}

export function inspectPublicKey(text: string): Omit<KeyInfo, 'encrypted'> | null {
  const parsed = utils.parseKey(text.trim())
  if (parsed instanceof Error) return null
  const key = Array.isArray(parsed) ? parsed[0] : parsed
  const pub = key.getPublicSSH()
  const type = typeOf(key.type)
  return { type, bits: type === 'rsa' ? rsaBits(pub) : null, publicKey: `${key.type} ${pub.toString('base64')}${key.comment ? ` ${key.comment}` : ''}`, fingerprint: fingerprintOf(pub) }
}

export function fingerprintOf(pub: Buffer): string {
  return `SHA256:${createHash('sha256').update(pub).digest('base64').replace(/=+$/, '')}`
}

function guessType(text: string): KeyType {
  if (/ed25519/i.test(text)) return 'ed25519'
  if (/RSA/.test(text)) return 'rsa'
  if (/EC PRIVATE|ecdsa/i.test(text)) return 'ecdsa'
  return 'unknown'
}

/** Quick filter for folder imports: does this look like a private key file at all? */
export function looksLikePrivateKey(text: string): boolean {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text) || /^PuTTY-User-Key-File-\d:/m.test(text)
}

export function generateKey(type: 'ed25519' | 'rsa', opts: { bits?: number; comment?: string; passphrase?: string }): { private: string; public: string } {
  const base = { comment: opts.comment, ...(opts.passphrase ? { passphrase: opts.passphrase, cipher: 'aes256-ctr', rounds: 16 } : {}) }
  // ssh2's generator occasionally (~1 in 120 for ed25519) emits a key its own parser rejects.
  // Never hand such a key to the user: verify and regenerate.
  for (let attempt = 0; attempt < 8; attempt++) {
    const pair = type === 'rsa' ? utils.generateKeyPairSync('rsa', { bits: opts.bits ?? 4096, ...base }) : utils.generateKeyPairSync('ed25519', base)
    if (!(utils.parseKey(pair.private, opts.passphrase) instanceof Error)) return pair
  }
  throw new Error('Не удалось сгенерировать корректный ключ, попробуйте ещё раз')
}
