import type { HostKeyPrompt, SessionEvent } from '@shared/ipc'
import { useSessions } from '@/store/sessions'

type DataHandler = (data: string) => void
const dataHandlers = new Map<string, DataHandler>()
/** Output that arrived before the terminal registered its handler. */
const backlog = new Map<string, string[]>()

/** Status events can race ahead of connect() resolving with the session id. */
const pendingStatus = new Map<string, SessionEvent>()

let hostKeyListener: ((p: HostKeyPrompt) => void) | null = null
const queuedPrompts: HostKeyPrompt[] = []

window.api.ssh.onData((sessionId, data) => {
  const h = dataHandlers.get(sessionId)
  if (h) h(data)
  else backlog.set(sessionId, [...(backlog.get(sessionId) ?? []), data])
})

window.api.ssh.onStatus((ev: SessionEvent) => {
  const { tabs, patchTab } = useSessions.getState()
  const tab = tabs.find((t) => t.sessionId === ev.sessionId)
  if (tab) patchTab(tab.id, { status: ev.status, message: ev.message })
  else pendingStatus.set(ev.sessionId, ev)
  if (ev.status === 'closed') backlog.delete(ev.sessionId)
})

window.api.ssh.onHostKeyPrompt((p) => {
  if (hostKeyListener) hostKeyListener(p)
  else queuedPrompts.push(p)
})

export function claimStatus(sessionId: string): SessionEvent | undefined {
  const ev = pendingStatus.get(sessionId)
  pendingStatus.delete(sessionId)
  return ev
}

export function attachData(sessionId: string, h: DataHandler): () => void {
  dataHandlers.set(sessionId, h)
  for (const chunk of backlog.get(sessionId) ?? []) h(chunk)
  backlog.delete(sessionId)
  return () => {
    if (dataHandlers.get(sessionId) === h) dataHandlers.delete(sessionId)
  }
}

export function onHostKeyPrompt(cb: (p: HostKeyPrompt) => void): () => void {
  hostKeyListener = cb
  while (queuedPrompts.length) cb(queuedPrompts.shift()!)
  return () => {
    if (hostKeyListener === cb) hostKeyListener = null
  }
}
