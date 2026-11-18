/**
 * Country from a host label: "VPS NL (Amsterdam)", "[AE] node", "германия дезган", "finka".
 * Labels are what people actually know about their servers; IP databases often see a hosting
 * company's registration country instead.
 */

// Two-letter words that are common in labels but should not be read as countries.
const NOT_COUNTRIES = new Set(['IT', 'IP', 'OK', 'OS', 'PC', 'DB', 'UI', 'VM', 'TV', 'AI', 'ID', 'NO', 'ME', 'IN', 'AM', 'PM', 'BY', 'TO', 'AS', 'IS', 'AT', 'SO', 'GO', 'MY', 'BE', 'DO', 'LA'])

const NAMES: Array<[RegExp, string]> = [
  [/нидерланд|голланд|netherlands|holland|amsterdam|амстердам/i, 'NL'],
  [/германи|germany|deutschland|frankfurt|франкфурт|berlin|берлин|nuremberg|нюрнберг/i, 'DE'],
  [/финлянд|финк|finland|finka|helsinki|хельсинки/i, 'FI'],
  [/швеци|sweden|stockholm|стокгольм/i, 'SE'],
  [/норвеги|norway|oslo|осло/i, 'NO'],
  [/росси|russia|moscow|москв|petersburg|петербург|спб/i, 'RU'],
  [/оаэ|эмират|\buae\b|emirates|dubai|дубай/i, 'AE'],
  [/польш|poland|warsaw|варшав/i, 'PL'],
  [/латви|latvia|riga|рига/i, 'LV'],
  [/литв|lithuania|vilnius|вильнюс/i, 'LT'],
  [/эстони|estonia|tallinn|таллин/i, 'EE'],
  [/турци|turkey|türkiye|istanbul|стамбул/i, 'TR'],
  [/франци|france|paris|париж/i, 'FR'],
  [/великобритан|англи|britain|england|\buk\b|london|лондон/i, 'GB'],
  [/сша|америк|\busa\b|united states|new york|нью-йорк/i, 'US'],
  [/казахстан|kazakhstan|almaty|алматы|астана|astana/i, 'KZ'],
  [/япони|japan|tokyo|токио/i, 'JP'],
  [/сингапур|singapore/i, 'SG'],
  [/швейцари|switzerland|zurich|цюрих/i, 'CH'],
  [/австри|austria|vienna|вена/i, 'AT'],
  [/чехи|czech|prague|прага/i, 'CZ'],
  [/испани|spain|madrid|мадрид/i, 'ES'],
  [/итали|italy|milan|милан/i, 'IT'],
  [/канад|canada|toronto|торонто/i, 'CA'],
  [/армени|armenia|yerevan|ереван/i, 'AM'],
  [/грузи|georgia|tbilisi|тбилиси/i, 'GE'],
  [/сербия|serbia|belgrade|белград/i, 'RS'],
  [/молдов|moldova|chisinau|кишин/i, 'MD'],
  [/гонконг|hong kong/i, 'HK']
]

let regions: Intl.DisplayNames | null = null
function isRegion(code: string): boolean {
  try {
    regions ??= new Intl.DisplayNames(['en'], { type: 'region' })
    const name = regions.of(code)
    return Boolean(name) && name !== code
  } catch {
    return false
  }
}

export function countryFromLabel(label: string | null | undefined): string | null {
  if (!label) return null
  // 1) An explicit ISO code: "[NL]", "(AE)" or a standalone upper-case word "VPS SE".
  for (const m of label.matchAll(/(?:^|[\s[(\-_/|])([A-Z]{2})(?=$|[\s\])\-_/|:,.])/g)) {
    const code = m[1]
    const bracketed = /[[(]$/.test(label.slice(0, m.index! + m[0].length - 2))
    if ((bracketed || !NOT_COUNTRIES.has(code)) && isRegion(code)) return code
  }
  // 2) Country or city names (Russian and English).
  for (const [re, code] of NAMES) if (re.test(label)) return code
  return null
}
