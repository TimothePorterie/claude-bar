import { ipcMain, app } from 'electron'
import { keychainService } from './services/keychain'
import { quotaService, QuotaInfo } from './services/quota-api'
import { schedulerService } from './services/scheduler'
import Store from 'electron-store'

interface StoreSchema {
  refreshInterval: number
  launchAtLogin: boolean
}

const store = new Store<StoreSchema>({
  defaults: {
    refreshInterval: 60,
    launchAtLogin: false
  }
})

export function setupIpcHandlers(): void {
  // Get quota data
  ipcMain.handle('get-quota', async (): Promise<QuotaInfo | null> => {
    return quotaService.fetchQuota()
  })

  // Force refresh quota
  ipcMain.handle('refresh-quota', async (): Promise<QuotaInfo | null> => {
    return quotaService.fetchQuota(true)
  })

  // Get cached quota (fast, no network)
  ipcMain.handle('get-cached-quota', (): QuotaInfo | null => {
    return quotaService.getCachedQuota()
  })

  // Check if credentials exist
  ipcMain.handle('has-credentials', async (): Promise<boolean> => {
    return keychainService.hasCredentials()
  })

  // Get user info from credentials
  ipcMain.handle('get-user-info', async (): Promise<{ email?: string; name?: string; subscriptionType?: string } | null> => {
    const credentials = await keychainService.getCredentials()
    if (!credentials) return null

    return {
      email: credentials.emailAddress,
      name: credentials.displayName,
      subscriptionType: credentials.subscriptionType
    }
  })

  // Settings handlers
  ipcMain.handle('get-settings', () => {
    return {
      refreshInterval: store.get('refreshInterval'),
      launchAtLogin: store.get('launchAtLogin')
    }
  })

  ipcMain.handle('set-refresh-interval', (_event, seconds: number) => {
    store.set('refreshInterval', seconds)
    schedulerService.setRefreshInterval(seconds)
    return true
  })

  ipcMain.handle('set-launch-at-login', (_event, enabled: boolean) => {
    store.set('launchAtLogin', enabled)
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true
    })
    return true
  })

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })
}

export function loadSettings(): void {
  const refreshInterval = store.get('refreshInterval')
  schedulerService.setRefreshInterval(refreshInterval)

  const launchAtLogin = store.get('launchAtLogin')
  app.setLoginItemSettings({
    openAtLogin: launchAtLogin,
    openAsHidden: true
  })
}
