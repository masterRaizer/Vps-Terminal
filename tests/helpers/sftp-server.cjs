// Minimal SFTP server for tests: ssh2 Server + SFTP subsystem backed by a real directory.
const fs = require('fs')
const path = require('path')
const { Server, utils } = require('ssh2')
const { STATUS_CODE, flagsToString } = utils.sftp

function attrsOf(st) {
  return { mode: st.mode, uid: st.uid, gid: st.gid, size: st.size, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) }
}

/**
 * Starts a server on 127.0.0.1. `auth(ctx)` returns true to accept.
 * Remote paths are absolute and mapped under `root`. Returns { server, port, close }.
 */
function startSftpServer({ root, auth, shell, port = 0 }) {
  const hostKey = utils.generateKeyPairSync('ed25519').private
  const clients = new Set()
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    clients.add(client)
    client.on('close', () => clients.delete(client))
    client.on('authentication', (ctx) => (auth(ctx) ? ctx.accept() : ctx.reject()))
    client.on('error', () => {})
    // Port forwarding: direct-tcpip (-L/-D) and tcpip-forward (-R).
    client.on('tcpip', (accept, _reject, info) => {
      const ch = accept()
      const s = require('net').connect(info.destPort, info.destIP)
      ch.on('error', () => s.destroy())
      s.on('error', () => ch.destroy())
      ch.pipe(s).pipe(ch)
    })
    client.on('request', (accept, reject, name, info) => {
      if (name !== 'tcpip-forward') return reject && reject()
      const srv = require('net').createServer((sock) => {
        client.forwardOut(info.bindAddr, srv.address().port, sock.remoteAddress, sock.remotePort, (err, ch) => {
          if (err) return sock.destroy()
          sock.pipe(ch).pipe(sock)
        })
      })
      srv.listen(info.bindPort, info.bindAddr, () => accept && accept(srv.address().port))
      client.on('close', () => srv.close())
    })
    client.on('session', (accept) => {
      const session = accept()
      session.on('pty', (a) => a && a())
      session.on('window-change', (a) => a && a())
      session.on('shell', (a) => {
        const st = a()
        if (shell) shell(st)
      })
      session.on('sftp', (acceptSftp) => {
        const sftp = acceptSftp()
        const handles = new Map()
        let next = 0
        const local = (p) => {
          const n = path.posix.normalize('/' + p)
          return path.join(root, ...n.split('/').filter(Boolean))
        }
        const newHandle = (v) => {
          const h = Buffer.alloc(4)
          h.writeUInt32BE(next++)
          handles.set(h.readUInt32BE(0), v)
          return h
        }
        const get = (h) => handles.get(h.readUInt32BE(0))
        const fail = (id, e) => sftp.status(id, e && e.code === 'ENOENT' ? STATUS_CODE.NO_SUCH_FILE : e && e.code === 'EACCES' ? STATUS_CODE.PERMISSION_DENIED : STATUS_CODE.FAILURE, e ? e.message : '')
        sftp.on('REALPATH', (id, p) => {
          const n = path.posix.normalize(p === '.' || p === '' ? '/home' : p.startsWith('/') ? p : '/home/' + p)
          sftp.name(id, [{ filename: n, longname: n, attrs: {} }])
        })
        sftp.on('STAT', (id, p) => { try { sftp.attrs(id, attrsOf(fs.statSync(local(p)))) } catch (e) { fail(id, e) } })
        sftp.on('LSTAT', (id, p) => { try { sftp.attrs(id, attrsOf(fs.lstatSync(local(p)))) } catch (e) { fail(id, e) } })
        sftp.on('OPENDIR', (id, p) => { try { const names = fs.readdirSync(local(p)); sftp.handle(id, newHandle({ dir: local(p), names, done: false })) } catch (e) { fail(id, e) } })
        sftp.on('READDIR', (id, h) => {
          const d = get(h)
          if (!d || d.done) return sftp.status(id, STATUS_CODE.EOF)
          d.done = true
          sftp.name(id, d.names.map((n) => { const st = fs.statSync(path.join(d.dir, n)); return { filename: n, longname: n, attrs: attrsOf(st) } }))
        })
        sftp.on('OPEN', (id, p, flags) => {
          try {
            const f = flagsToString(flags)
            sftp.handle(id, newHandle({ fd: fs.openSync(local(p), f) }))
          } catch (e) { fail(id, e) }
        })
        sftp.on('READ', (id, h, offset, len) => {
          const o = get(h)
          const buf = Buffer.alloc(len)
          const n = fs.readSync(o.fd, buf, 0, len, offset)
          if (n === 0) return sftp.status(id, STATUS_CODE.EOF)
          sftp.data(id, buf.subarray(0, n))
        })
        sftp.on('WRITE', (id, h, offset, data) => { fs.writeSync(get(h).fd, data, 0, data.length, offset); sftp.status(id, STATUS_CODE.OK) })
        sftp.on('FSTAT', (id, h) => sftp.attrs(id, attrsOf(fs.fstatSync(get(h).fd))))
        sftp.on('FSETSTAT', (id) => sftp.status(id, STATUS_CODE.OK))
        sftp.on('CLOSE', (id, h) => { const o = get(h); if (o && o.fd !== undefined) fs.closeSync(o.fd); handles.delete(h.readUInt32BE(0)); sftp.status(id, STATUS_CODE.OK) })
        sftp.on('MKDIR', (id, p) => { try { fs.mkdirSync(local(p)); sftp.status(id, STATUS_CODE.OK) } catch (e) { fail(id, e) } })
        sftp.on('RMDIR', (id, p) => { try { fs.rmdirSync(local(p)); sftp.status(id, STATUS_CODE.OK) } catch (e) { fail(id, e) } })
        sftp.on('REMOVE', (id, p) => { try { fs.unlinkSync(local(p)); sftp.status(id, STATUS_CODE.OK) } catch (e) { fail(id, e) } })
        sftp.on('RENAME', (id, a, b) => { try { fs.renameSync(local(a), local(b)); sftp.status(id, STATUS_CODE.OK) } catch (e) { fail(id, e) } })
        sftp.on('SETSTAT', (id, p, attrs) => { try { if (attrs.mode !== undefined) fs.chmodSync(local(p), attrs.mode & 0o7777); sftp.status(id, STATUS_CODE.OK) } catch (e) { fail(id, e) } })
      })
    })
  })
  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, close: () => new Promise((r) => { for (const c of clients) c.end(); server.close(() => r()) }) }))
  )
}

module.exports = { startSftpServer }
