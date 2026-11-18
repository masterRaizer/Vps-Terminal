/** Snippet variables: {{name}} or {{name:default}}. Names: letters, digits, _ and -. */
const VAR = /\{\{\s*([\p{L}\p{N}_-]{1,40})\s*(?::([^}]*))?\}\}/gu

export interface SnippetVar {
  name: string
  defaultValue: string
}

export function snippetVars(command: string): SnippetVar[] {
  const seen = new Map<string, SnippetVar>()
  for (const m of command.matchAll(VAR)) if (!seen.has(m[1])) seen.set(m[1], { name: m[1], defaultValue: (m[2] ?? '').trim() })
  return [...seen.values()]
}

export function fillSnippet(command: string, values: Record<string, string>): string {
  // A default declared once applies to every occurrence of the variable.
  const defaults = Object.fromEntries(snippetVars(command).map((v) => [v.name, v.defaultValue]))
  return command.replace(VAR, (_all, name: string) => values[name] ?? defaults[name] ?? '')
}

/** Text to send to the shell: CRLF/LF normalised to CR so multi-line snippets run line by line. */
export function toShellInput(command: string, run: boolean): string {
  const body = command.replace(/\r\n?/g, '\n').replace(/\n+$/, '').replace(/\n/g, '\r')
  return run ? `${body}\r` : body
}
