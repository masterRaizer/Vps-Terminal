import { readFileSync } from 'node:fs'
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { join } from 'node:path'

/** Offline IP → country lookup over tables built by scripts/build-geoip.mjs (CC0 data). */
export class GeoIp {
  private v4?: { starts: Uint32Array; codes: Buffer }
  private v6?: { starts: BigUint64Array; codes: Buffer }
  private warned = false

  constructor(private readonly dir: string) {}

  private load(): void {
    if (this.v4) return
    const b4 = readFileSync(join(this.dir, 'country-v4.bin'))
    const b6 = readFileSync(join(this.dir, 'country-v6.bin'))
    if (b4.toString('ascii', 0, 4) !== 'VTG4' || b6.toString('ascii', 0, 4) !== 'VTG6') throw new Error('GeoIP: повреждённые таблицы')
    const n4 = b4.readUInt32LE(4)
    const n6 = b6.readUInt32LE(4)
    // Copy into aligned typed arrays.
    const s4 = new Uint32Array(n4)
    for (let i = 0; i < n4; i++) s4[i] = b4.readUInt32LE(8 + i * 4)
    const s6 = new BigUint64Array(n6)
    for (let i = 0; i < n6; i++) s6[i] = b6.readBigUInt64LE(8 + i * 8)
    this.v4 = { starts: s4, codes: b4.subarray(8 + n4 * 4) }
    this.v6 = { starts: s6, codes: b6.subarray(8 + n6 * 8) }
  }

  /** ISO 3166 alpha-2 code for an IP literal, or null. */
  countryOfIp(ip: string): string | null {
    this.load()
    const kind = isIP(ip)
    if (kind === 4) {
      const n = ip.split('.').reduce((acc, p) => acc * 256 + Number(p), 0)
      if (isReservedV4(n)) return null
      return pick(this.v4!.starts, this.v4!.codes, n)
    }
    if (kind === 6) {
      const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
      if (mapped) return this.countryOfIp(mapped[1])
      const p = ipv6Prefix64(ip)
      const top = Number(p >> 48n)
      // Only global unicast (2000::/3) has a country.
      if (top < 0x2000 || top > 0x3fff) return null
      return pick(this.v6!.starts, this.v6!.codes, p)
    }
    return null
  }

  /** Resolves a hostname locally (system DNS) and looks the first address up. */
  async countryOf(address: string): Promise<string | null> {
    try {
      this.load()
    } catch (e) {
      if (!this.warned) console.warn(`GeoIP недоступен (${this.dir}): ${(e as Error).message}`)
      this.warned = true
      return null
    }
    if (isIP(address)) return this.countryOfIp(address)
    try {
      const { address: ip } = await dnsLookup(address)
      return this.countryOfIp(ip)
    } catch {
      return null
    }
  }
}

const V4_RESERVED: Array<[number, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]
].map(([a, bits]) => {
  const base = (a as string).split('.').reduce((acc, p) => acc * 256 + Number(p), 0)
  return [base, base + 2 ** (32 - (bits as number)) - 1]
})

function isReservedV4(n: number): boolean {
  return V4_RESERVED.some(([lo, hi]) => n >= lo && n <= hi)
}

function pick<T extends number | bigint>(starts: ArrayLike<T>, codes: Buffer, key: T): string | null {
  let lo = 0
  let hi = starts.length - 1
  if (hi < 0 || key < starts[0]) return null
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= key) lo = mid
    else hi = mid - 1
  }
  const cc = codes.toString('ascii', lo * 2, lo * 2 + 2)
  return cc === '--' ? null : cc
}

function ipv6Prefix64(ip: string): bigint {
  const [head, tail = ''] = ip.split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h
  let v = 0n
  for (let i = 0; i < 4; i++) v = (v << 16n) + BigInt(parseInt(groups[i] || '0', 16))
  return v
}
