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
