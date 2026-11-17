import type { VpsApi } from '../shared/ipc'

declare global {
  interface Window {
    api: VpsApi
  }
}

export {}
