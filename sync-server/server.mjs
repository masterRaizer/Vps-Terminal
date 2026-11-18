// Vps Terminal SSH — zero-knowledge vault sync server.
// Stores one encrypted blob per deployment plus a version counter. It never sees keys or plaintext.
// No dependencies: node:http + node:fs. Configure with environment variables:
//   SYNC_TOKEN_SHA256  hex sha256 of the bearer token (the token itself is never stored)
//   DATA_DIR           where vault.json and backups live (default /data)
//   PORT               listen port (default 8787), HOST (default 0.0.0.0)
//   MAX_BLOB_MB        upload limit (default 25)
import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function createSyncServer({ tokenSha256, dataDir, maxBlobBytes = 25 * 1024 * 1024, keepBackups = 20, now = () => Date.now() }) {
  if (!/^[0-9a-f]{64}$/i.test(tokenSha256 ?? '')) throw new Error('SYNC_TOKEN_SHA256 must be a hex sha256')
  const expected = Buffer.from(tokenSha256.toLowerCase(), 'hex')
  const vaultFile = join(dataDir, 'vault.json')
  const historyDir = join(dataDir, 'history')
  let queue = Promise.resolve()
  const hits = new Map()

  const authorized = (req) => {
    const m = /^Bearer ([\x21-\x7e]{16,512})$/.exec(req.headers.authorization ?? '')
    if (!m) return false
    const got = createHash('sha256').update(m[1]).digest()
    return timingSafeEqual(got, expected)
  }

  // 120 requests per minute per IP; failed auth costs 10.
  const limited = (ip, cost = 1) => {
    const t = now()
    const e = hits.get(ip) ?? { n: 0, reset: t + 60_000 }
    if (t > e.reset) Object.assign(e, { n: 0, reset: t + 60_000 })
    e.n += cost
    hits.set(ip, e)
    if (hits.size > 10_000) hits.clear()
    return e.n > 120
  }

  const load = async () => {
    try {
      return JSON.parse(await readFile(vaultFile, 'utf-8'))
    } catch (e) {
      if (e.code === 'ENOENT') return null
      throw e
    }
  }

  const save = async (doc) => {
    await mkdir(historyDir, { recursive: true })
    const tmp = `${vaultFile}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(doc), { mode: 0o600 })
    await rename(tmp, vaultFile)
    await writeFile(join(historyDir, `vault-${String(doc.version).padStart(8, '0')}.json`), JSON.stringify(doc), { mode: 0o600 })
    const old = (await readdir(historyDir)).filter((f) => f.startsWith('vault-')).sort()
    for (const f of old.slice(0, Math.max(0, old.length - keepBackups))) await rm(join(historyDir, f), { force: true })
  }

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    res.end(body === undefined ? '' : JSON.stringify(body))
  }

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let size = 0
      let tooLarge = false
      const chunks = []
      req.on('data', (c) => {
        size += c.length
        // Over the limit: stop keeping data but drain a little so the client can read our 413;
        // far over it, cut the connection.
        if (size > maxBlobBytes + 64 * 1024) {
          tooLarge = true
          chunks.length = 0
          if (size > 2 * maxBlobBytes + 64 * 1024) {
            reject(Object.assign(new Error('too large'), { status: 413 }))
            req.destroy()
          }
        } else chunks.push(c)
      })
      req.on('end', () => (tooLarge ? reject(Object.assign(new Error('too large'), { status: 413 })) : resolve(Buffer.concat(chunks).toString('utf-8'))))
      req.on('error', reject)
    })

  return createServer(async (req, res) => {
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.socket.remoteAddress ?? '').trim()
    try {
      const url = new URL(req.url ?? '/', 'http://x')
      if (url.pathname === '/healthz') return send(res, 200, { ok: true })
      if (url.pathname !== '/v1/vault') return send(res, 404, { error: 'not found' })
      if (limited(ip)) return send(res, 429, { error: 'rate limited' })
      if (!authorized(req)) {
        limited(ip, 10)
        return send(res, 401, { error: 'unauthorized' })
      }
      if (req.method === 'GET') {
        const doc = await load()
        return doc ? send(res, 200, doc) : send(res, 404, { error: 'empty', version: 0 })
      }
      if (req.method === 'PUT') {
        let body
        try {
          body = JSON.parse(await readBody(req))
        } catch (e) {
          return send(res, e.status ?? 400, { error: e.status ? 'too large' : 'bad json' })
        }
        if (!Number.isInteger(body?.baseVersion) || body.baseVersion < 0 || typeof body.blob !== 'string' || !body.blob) return send(res, 400, { error: 'expected { baseVersion, blob }' })
        if (body.blob.length > maxBlobBytes) return send(res, 413, { error: 'too large' })
        // Serialise writers so the version check and the write are atomic.
        let result
        queue = queue.then(async () => {
          const cur = await load()
          const curVersion = cur?.version ?? 0
          if (body.baseVersion !== curVersion) {
            result = [409, cur ?? { version: 0 }]
            return
          }
          const doc = { version: curVersion + 1, updatedAt: now(), blob: body.blob }
          await save(doc)
          result = [200, { version: doc.version, updatedAt: doc.updatedAt }]
        })
        await queue
        return send(res, result[0], result[1])
      }
      res.setHeader('Allow', 'GET, PUT')
      return send(res, 405, { error: 'method not allowed' })
    } catch (e) {
      console.error(new Date().toISOString(), 'error', e)
      return send(res, 500, { error: 'internal' })
    }
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createSyncServer({
    tokenSha256: process.env.SYNC_TOKEN_SHA256,
    dataDir: process.env.DATA_DIR ?? '/data',
    maxBlobBytes: Number(process.env.MAX_BLOB_MB ?? 25) * 1024 * 1024
  })
  const port = Number(process.env.PORT ?? 8787)
  server.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log(`vps-terminal-sync listening on :${port}`))
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)))
}
