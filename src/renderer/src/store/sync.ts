import { create } from 'zustand'
import type { SyncStatus } from '@shared/ipc'
import { useVault } from './vault'

export const useSync = create<{ status: SyncStatus | null }>(() => ({ status: null }))

void window.api.sync.status().then((status) => useSync.setState({ status }))
window.api.sync.onStatus((status) => useSync.setState({ status }))
window.api.sync.onVaultChanged(() => void useVault.getState().load())
