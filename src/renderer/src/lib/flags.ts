// Country flags from flag-icons (MIT), bundled as individual SVG assets.
const files = import.meta.glob('../../../../node_modules/flag-icons/flags/4x3/*.svg', {
  query: '?url',
  import: 'default',
  eager: true
}) as Record<string, string>

const byCode = new Map<string, string>()
for (const [path, url] of Object.entries(files)) {
  const m = /\/([a-z]{2})\.svg$/.exec(path)
  if (m) byCode.set(m[1].toUpperCase(), url)
}

export function flagUrl(cc: string | null | undefined): string | null {
  return cc ? (byCode.get(cc.toUpperCase()) ?? null) : null
}

let names: Intl.DisplayNames | null = null
export function countryName(cc: string): string {
  try {
    names ??= new Intl.DisplayNames(['ru'], { type: 'region' })
    return names.of(cc.toUpperCase()) ?? cc
  } catch {
    return cc
  }
}

/** All codes we have a flag for, sorted by Russian name. */
export function countryOptions(): Array<{ code: string; name: string }> {
  return [...byCode.keys()]
    .filter((c) => /^[A-Z]{2}$/.test(c) && c !== 'XX')
    .map((code) => ({ code, name: countryName(code) }))
    .filter((c) => c.name !== c.code)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}
