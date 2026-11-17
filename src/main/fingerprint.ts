import { createHash } from 'node:crypto'

/** OpenSSH-style SHA256 fingerprint of a raw public host key blob. */
export function sha256Fingerprint(key: Buffer): string {
  const b64 = createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
  return `SHA256:${b64}`
}

/** Algorithm name is the first length-prefixed string in the key blob. */
export function keyAlgorithm(key: Buffer): string {
  if (key.length < 4) return 'unknown'
  const len = key.readUInt32BE(0)
  if (len <= 0 || 4 + len > key.length) return 'unknown'
  return key.subarray(4, 4 + len).toString('ascii')
}
