import { describe, expect, it } from 'vitest'
import { parseTarget } from '../src/renderer/src/lib/parseTarget'

describe('parseTarget', () => {
  it.each([
    ['example.com', { host: 'example.com' }],
    ['root@1.2.3.4', { username: 'root', host: '1.2.3.4' }],
    ['root@1.2.3.4:2222', { username: 'root', host: '1.2.3.4', port: 2222 }],
    ['ssh admin@vps.example -p 2200', { username: 'admin', host: 'vps.example', port: 2200 }],
    ['ssh -p 22 u@h', { username: 'u', host: 'h', port: 22 }],
    ['me@[2001:db8::1]:2022', { username: 'me', host: '2001:db8::1', port: 2022 }],
    ['user@corp@host', { username: 'user@corp', host: 'host' }]
  ])('%s', (input, expected) => {
    expect(parseTarget(input)).toEqual({ username: undefined, port: undefined, ...expected })
  })
})
