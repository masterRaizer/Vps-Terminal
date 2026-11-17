/** File-manager types shared by main and renderer. */

export type EntryType = 'dir' | 'file' | 'link' | 'other'

export interface FileEntry {
  name: string
  type: EntryType
  size: number
  /** ms since epoch */
  mtime: number
  /** POSIX mode bits (permissions only), null when unknown (Windows). */
  mode: number | null
}

export interface Listing {
  path: string
  entries: FileEntry[]
}

export type TransferDir = 'upload' | 'download'
export type TransferStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'

export interface TransferEvent {
  id: string
  sftpId: string
  direction: TransferDir
  name: string
  transferred: number
  total: number
  status: TransferStatus
  message?: string
}

export function permString(mode: number | null, type: EntryType): string {
  if (mode === null) return ''
  const t = type === 'dir' ? 'd' : type === 'link' ? 'l' : '-'
  const bits = 'rwxrwxrwx'
  let s = t
  for (let i = 8; i >= 0; i--) s += mode & (1 << i) ? bits[8 - i] : '-'
  return s
}
