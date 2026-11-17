// Builds compact country lookup tables from the CC0 ip-location-db dataset.
// Output: resources/geoip/country-v4.bin, country-v6.bin
//   magic(4) | count u32 LE | starts (u32 LE for v4, u64 LE /64-prefix for v6) | codes (2 ASCII bytes each)
// A code of "--" marks a gap with no country.
import { createReadStream, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources', 'geoip')
const require = createRequire(import.meta.url)
const pkgDir = dirname(require.resolve('@ip-location-db/geo-whois-asn-country/package.json'))
const src4 = join(pkgDir, 'geo-whois-asn-country-ipv4-num.csv')
const src6 = join(pkgDir, 'geo-whois-asn-country-ipv6-num.csv')
const out4 = join(outDir, 'country-v4.bin')
const out6 = join(outDir, 'country-v6.bin')

if (!process.argv.includes('--force') && existsSync(out4) && existsSync(out6) && statSync(out4).mtimeMs > statSync(src4).mtimeMs) {
  process.exit(0)
}

async function build(file, v6) {
  const starts = []
  const codes = []
  let prevEnd = -1n
  const push = (start, code) => {
    if (codes.length && codes[codes.length - 1] === code) return // merge neighbours
    starts.push(start)
    codes.push(code)
  }
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line) continue
    const [a, b, cc] = line.split(',')
    let start = BigInt(a)
    let end = BigInt(b)
    if (v6) {
      start >>= 64n
      end >>= 64n
    }
    if (start > prevEnd + 1n) push(prevEnd + 1n, '--')
    if (end <= prevEnd) continue
    if (start <= prevEnd) start = prevEnd + 1n
    push(start, /^[A-Z]{2}$/.test(cc) ? cc : '--')
    prevEnd = end
  }
  push(prevEnd + 1n, '--')
  const width = v6 ? 8 : 4
  const buf = Buffer.alloc(8 + starts.length * (width + 2))
  buf.write(v6 ? 'VTG6' : 'VTG4', 0, 'ascii')
  buf.writeUInt32LE(starts.length, 4)
  starts.forEach((s, i) => {
    const max = v6 ? (1n << 64n) - 1n : 0xffffffffn
    const v = s > max ? max : s
    if (v6) buf.writeBigUInt64LE(v, 8 + i * 8)
    else buf.writeUInt32LE(Number(v), 8 + i * 4)
  })
  const codeBase = 8 + starts.length * width
  codes.forEach((c, i) => buf.write(c, codeBase + i * 2, 'ascii'))
  return buf
}

mkdirSync(outDir, { recursive: true })
const [b4, b6] = await Promise.all([build(src4, false), build(src6, true)])
writeFileSync(out4, b4)
writeFileSync(out6, b6)
console.log(`geoip: v4 ${(b4.length / 1024).toFixed(0)} KiB, v6 ${(b6.length / 1024).toFixed(0)} KiB`)
