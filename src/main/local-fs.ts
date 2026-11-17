import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, normalize } from 'node:path'
import type { FileEntry, Listing } from '@shared/files'

function localPath(p: unknown): string {
  if (typeof p !== 'string' || !p || p.includes('\0') || p.length > 4096 || !isAbsolute(p)) throw new Error('Неверный локальный путь')
  return normalize(p)
}

export const localHome = (): string => homedir()

/** Windows drive letters that exist. */
export function localRoots(): string[] {
  if (process.platform !== 'win32') return ['/']
  const roots: string[] = []
  for (let c = 65; c <= 90; c++) {
    const d = `${String.fromCharCode(c)}:\\`
    if (existsSync(d)) roots.push(d)
  }
  return roots
}

export async function localList(raw: unknown): Promise<Listing> {
  const path = localPath(raw)
  const names = await readdir(path)
  const entries: FileEntry[] = []
  await Promise.all(
    names.map(async (name) => {
      try {
        const st = await stat(join(path, name))
        entries.push({
          name,
          type: st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other',
          size: st.size,
          mtime: st.mtimeMs,
          mode: process.platform === 'win32' ? null : st.mode & 0o7777
        })
      } catch {
        /* unreadable entry (e.g. pagefile.sys) — skip */
      }
    })
  )
  return { path, entries }
}

export async function localMkdir(p: unknown): Promise<void> {
  await mkdir(localPath(p))
}
export async function localRename(a: unknown, b: unknown): Promise<void> {
  await rename(localPath(a), localPath(b))
}
export async function localRemove(p: unknown): Promise<void> {
  const path = localPath(p)
  if (localRoots().some((r) => normalize(r) === path) || path === homedir()) throw new Error('Этот каталог удалять нельзя')
  await rm(path, { recursive: true })
}
export { localPath }
