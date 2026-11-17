import type { Host } from '@shared/vault'
import { useSessions } from '@/store/sessions'
import { usePasswordPrompt } from '@/components/PasswordPrompt'

/** Opens a session for a saved host, asking for a password first if none is stored. */
export function connectHost(host: Host): void {
  if (host.auth === 'password' && !host.hasPassword) {
    usePasswordPrompt.getState().ask(host)
    return
  }
  useSessions.getState().openHostTab(host, false)
}
