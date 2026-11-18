import { utils } from 'ssh2'

/** ssh2's generator sometimes emits keys its parser rejects; tests need valid ones. */
export function genKeyPair(opts?: { passphrase?: string; cipher?: string; rounds?: number; comment?: string }): { private: string; public: string } {
  for (;;) {
    const pair = opts ? utils.generateKeyPairSync('ed25519', opts as never) : utils.generateKeyPairSync('ed25519')
    if (!(utils.parseKey(pair.private, opts?.passphrase) instanceof Error)) return pair
  }
}
