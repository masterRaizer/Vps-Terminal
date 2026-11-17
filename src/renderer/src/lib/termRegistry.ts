import type { Terminal } from '@xterm/xterm'
import type { SearchAddon } from '@xterm/addon-search'

export interface TermHandle {
  term: Terminal
  search: SearchAddon
}

/** Live xterm instances by tab id, so side panels can drive search, paste, etc. */
export const termRegistry = new Map<string, TermHandle>()
