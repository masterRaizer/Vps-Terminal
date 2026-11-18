import type { Snippet } from '@shared/vault'
import { fillSnippet, snippetVars, toShellInput } from '@shared/snippets'
import { useSessions } from '@/store/sessions'
import { askVars } from '@/components/SnippetVarsDialog'
import { termRegistry } from './termRegistry'

/** Sends a snippet (or a history command) to the active terminal pane. */
export async function sendToTerminal(snippet: Pick<Snippet, 'label' | 'command'> & { id?: string | null }, run: boolean, opts: { askVariables?: boolean } = {}): Promise<boolean> {
  const { tabs, activeId } = useSessions.getState()
  const tab = tabs.find((t) => t.id === activeId)
  if (!tab?.sessionId || tab.status !== 'ready') return false
  let command = snippet.command
  const vars = snippetVars(command)
  if (vars.length) {
    if (opts.askVariables === false) command = fillSnippet(command, {})
    else {
      const values = await askVars(snippet.label, vars)
      if (!values) return false
      command = fillSnippet(command, values)
    }
  }
  window.api.ssh.write(tab.sessionId, toShellInput(command, run))
  window.api.snippets.record(snippet.id ?? null, tab.hostId ?? null, command)
  termRegistry.get(tab.id)?.term.focus()
  return true
}
