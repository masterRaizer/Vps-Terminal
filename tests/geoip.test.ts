import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GeoIp } from '../src/main/geoip'

const geo = new GeoIp(join(__dirname, '..', 'resources', 'geoip'))

describe('GeoIp', () => {
  it.each([
    ['1.1.1.1', 'AU'],
    ['8.8.8.8', 'US'],
    ['77.88.8.8', 'RU'],
    ['2a02:6b8::feed:0ff', 'RU'],
    ['::ffff:8.8.8.8', 'US']
  ])('%s → %s', (ip, cc) => {
    expect(geo.countryOfIp(ip)).toBe(cc)
  })
  it('returns null for private and invalid input', () => {
    expect(geo.countryOfIp('10.0.0.1')).toBeNull()
    expect(geo.countryOfIp('192.168.1.1')).toBeNull()
    expect(geo.countryOfIp('not-an-ip')).toBeNull()
  })
  it('resolves localhost names without crashing', async () => {
    expect(await geo.countryOf('localhost')).toBeNull()
  })
})

import { countryFromLabel } from '../src/shared/countryHint'

describe('countryFromLabel', () => {
  it.each([
    ['VPS AE (UAE)', 'AE'],
    ['VPS NL (Amsterdam) [sync]', 'NL'],
    ['VPS SE (Stockholm)', 'SE'],
    ['VPS RU (St Petersburg)', 'RU'],
    ['нидерланды pl2go килмикс', 'NL'],
    ['германия дезган', 'DE'],
    ['Швеция киллмикс', 'SE'],
    ['finka', 'FI'],
    ['4 сдн финка', 'FI'],
    ['[IT] milan-01', 'IT'],
    ['IT backup box', null],
    ['router', null],
    ['prod-web-01', null],
    ['OK node', null]
  ])('%s → %s', (label, cc) => {
    expect(countryFromLabel(label)).toBe(cc)
  })
})

describe('DB-IP tables', () => {
  it('locates the user-reported hosts by geolocation, not registration', () => {
    expect(geo.countryOfIp('64.130.62.137')).toBe('NL')
    expect(geo.countryOfIp('45.8.93.181')).toBe('SE')
  })
})
