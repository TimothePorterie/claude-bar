import { ipcMain, app } from 'electron'
import { keychainService } from './services/keychain'
import { quotaService, QuotaInfo } from './services/quota-api'
import { schedulerService } from './services/scheduler'
import { historyService, HistoryEntry } from './services/history'
import { notificationService } from './services/notifications'
import { updaterService } from './services/updater'
import { logger } from './services/logger'
import Store from 'electron-store'

interface StoreSchema {
  refreshInterval: number
  launchAtLogin: boolean
  notificationsEnabled: boolean
}

const store = new Store<StoreSchema>({
  defaults: {
    refreshInterval: 60,
    launchAtLogin: false,
    notificationsEnabled: true
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
  ipcMain.handle(
    'get-user-info',
    async (): Promise<{ email?: string; name?: string; subscriptionType?: string } | null> => {
      const credentials = await keychainService.getCredentials()
      if (!credentials) return null

      return {
        email: credentials.emailAddress,
        name: credentials.displayName,
        subscriptionType: credentials.subscriptionType
      }
    }
  )

  // Settings handlers
  ipcMain.handle('get-settings', () => {
    return {
      refreshInterval: store.get('refreshInterval'),
      launchAtLogin: store.get('launchAtLogin'),
      notificationsEnabled: store.get('notificationsEnabled')
    }
  })

  ipcMain.handle('set-refresh-interval', (_event, seconds: number) => {
    store.set('refreshInterval', seconds)
    schedulerService.setRefreshInterval(seconds)
    logger.info(`Refresh interval set to ${seconds}s`)
    return true
  })

  ipcMain.handle('set-launch-at-login', (_event, enabled: boolean) => {
    store.set('launchAtLogin', enabled)
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true
    })
    logger.info(`Launch at login: ${enabled}`)
    return true
  })

  ipcMain.handle('set-notifications-enabled', (_event, enabled: boolean) => {
    store.set('notificationsEnabled', enabled)
    notificationService.setEnabled(enabled)
    return true
  })

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  // History handlers
  ipcMain.handle('get-history', (_event, hours?: number): HistoryEntry[] => {
    if (hours) {
      return historyService.getEntriesForPeriod(hours)
    }
    return historyService.getEntries()
  })

  ipcMain.handle(
    'get-history-chart-data',
    (_event, hours: number): { labels: string[]; fiveHour: number[]; sevenDay: number[] } => {
      return historyService.getChartData(hours)
    }
  )

  ipcMain.handle(
    'get-history-stats',
    (
      _event,
      hours: number
    ): {
      avgFiveHour: number
      avgSevenDay: number
      maxFiveHour: number
      maxSevenDay: number
      minFiveHour: number
      minSevenDay: number
      entryCount: number
    } | null => {
      return historyService.getStats(hours)
    }
  )

  ipcMain.handle('clear-history', () => {
    historyService.clearHistory()
    return true
  })

  // Updater handlers
  ipcMain.handle('check-for-updates', async () => {
    await updaterService.checkForUpdates()
    return {
      available: updaterService.isUpdateAvailable(),
      downloaded: updaterService.isUpdateDownloaded(),
      version: updaterService.getLatestVersion()
    }
  })

  ipcMain.handle('get-update-status', () => {
    return {
      available: updaterService.isUpdateAvailable(),
      downloaded: updaterService.isUpdateDownloaded(),
      version: updaterService.getLatestVersion()
    }
  })

  ipcMain.handle('install-update', () => {
    updaterService.quitAndInstall()
  })

  // Logger handlers
  ipcMain.handle('get-log-path', () => {
    return logger.getLogPath()
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

  const notificationsEnabled = store.get('notificationsEnabled')
  notificationService.setEnabled(notificationsEnabled)

  logger.info('Settings loaded')
}
