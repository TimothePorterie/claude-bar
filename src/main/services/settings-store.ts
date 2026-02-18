import Store from 'electron-store'

interface SettingsStoreSchema {
  refreshInterval: number
  launchAtLogin: boolean
  notificationsEnabled: boolean
  warningThreshold: number
  criticalThreshold: number
  adaptiveRefresh: boolean
  showTimeToCritical: boolean
  authMode: 'app' | 'cli'
  globalShortcutsEnabled: boolean
}

export const settingsStore = new Store<SettingsStoreSchema>({
  defaults: {
    refreshInterval: 60,
    launchAtLogin: false,
    notificationsEnabled: true,
    warningThreshold: 70,
    criticalThreshold: 90,
    adaptiveRefresh: true,
    showTimeToCritical: true,
    authMode: 'app',
    globalShortcutsEnabled: false // Disabled by default (requires accessibility permissions)
  }
})

export function getAuthMode(): 'app' | 'cli' {
  return settingsStore.get('authMode')
}
