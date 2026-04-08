import Store from 'electron-store'

interface PersistedQuotaData {
  fiveHour: { utilization: number; resetsAt: string }
  sevenDay: { utilization: number; resetsAt: string }
  sevenDayOpus?: { utilization: number; resetsAt: string }
  fetchedAt: number
}

interface SettingsStoreSchema {
  refreshInterval: number
  launchAtLogin: boolean
  authMode: 'app' | 'cli'
  rateLimitedUntil: number
  lastQuotaData: PersistedQuotaData | null
  displayMode: string
}

export type { PersistedQuotaData }

export const settingsStore = new Store<SettingsStoreSchema>({
  defaults: {
    refreshInterval: 300,
    launchAtLogin: false,
    authMode: 'app' as const,
    rateLimitedUntil: 0,
    lastQuotaData: null,
    displayMode: 'standard'
  }
})

// Migrate: bump aggressive intervals (30s, 60s) to 300s to avoid rate limiting
const currentInterval = settingsStore.get('refreshInterval')
if (currentInterval < 120) {
  settingsStore.set('refreshInterval', 300)
}
