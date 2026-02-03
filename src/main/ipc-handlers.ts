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

// Input validation helpers
const VALID_REFRESH_INTERVALS = [30, 60, 120, 300, 600] as const
const MAX_HISTORY_HOURS = 168 // 7 days max

function isValidRefreshInterval(value: unknown): value is number {
  return typeof value === 'number' && VALID_REFRESH_INTERVALS.includes(value as 30 | 60 | 120 | 300 | 600)
}

function isValidBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isValidHistoryHours(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_HISTORY_HOURS
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
    try {
      return await quotaService.fetchQuota()
    } catch (error) {
      logger.error('IPC get-quota error:', error)
      return null
    }
  })

  // Force refresh quota
  ipcMain.handle('refresh-quota', async (): Promise<QuotaInfo | null> => {
    try {
      return await quotaService.fetchQuota(true)
    } catch (error) {
      logger.error('IPC refresh-quota error:', error)
      return null
    }
  })

  // Get cached quota (fast, no network)
  ipcMain.handle('get-cached-quota', (): QuotaInfo | null => {
    try {
      return quotaService.getCachedQuota()
    } catch (error) {
      logger.error('IPC get-cached-quota error:', error)
      return null
    }
  })

  // Check if credentials exist
  ipcMain.handle('has-credentials', async (): Promise<boolean> => {
    try {
      return await keychainService.hasCredentials()
    } catch (error) {
      logger.error('IPC has-credentials error:', error)
      return false
    }
  })

  // Get user info from credentials
  ipcMain.handle(
    'get-user-info',
    async (): Promise<{ email?: string; name?: string; subscriptionType?: string } | null> => {
      try {
        const credentials = await keychainService.getCredentials()
        if (!credentials) return null

        return {
          email: credentials.emailAddress,
          name: credentials.displayName,
          subscriptionType: credentials.subscriptionType
        }
      } catch (error) {
        logger.error('IPC get-user-info error:', error)
        return null
      }
    }
  )

  // Settings handlers
  ipcMain.handle('get-settings', () => {
    try {
      return {
        refreshInterval: store.get('refreshInterval'),
        launchAtLogin: store.get('launchAtLogin'),
        notificationsEnabled: store.get('notificationsEnabled')
      }
    } catch (error) {
      logger.error('IPC get-settings error:', error)
      return {
        refreshInterval: 60,
        launchAtLogin: false,
        notificationsEnabled: true
      }
    }
  })

  ipcMain.handle('set-refresh-interval', (_event, seconds: unknown) => {
    // Validate input
    if (!isValidRefreshInterval(seconds)) {
      logger.warn(`Invalid refresh interval rejected: ${seconds}`)
      return false
    }

    try {
      store.set('refreshInterval', seconds)
      schedulerService.setRefreshInterval(seconds)
      logger.info(`Refresh interval set to ${seconds}s`)
      return true
    } catch (error) {
      logger.error('IPC set-refresh-interval error:', error)
      return false
    }
  })

  ipcMain.handle('set-launch-at-login', (_event, enabled: unknown) => {
    // Validate input
    if (!isValidBoolean(enabled)) {
      logger.warn(`Invalid launch-at-login value rejected: ${enabled}`)
      return false
    }

    try {
      store.set('launchAtLogin', enabled)
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: true
      })
      logger.info(`Launch at login: ${enabled}`)
      return true
    } catch (error) {
      logger.error('IPC set-launch-at-login error:', error)
      return false
    }
  })

  ipcMain.handle('set-notifications-enabled', (_event, enabled: unknown) => {
    // Validate input
    if (!isValidBoolean(enabled)) {
      logger.warn(`Invalid notifications-enabled value rejected: ${enabled}`)
      return false
    }

    try {
      store.set('notificationsEnabled', enabled)
      notificationService.setEnabled(enabled)
      return true
    } catch (error) {
      logger.error('IPC set-notifications-enabled error:', error)
      return false
    }
  })

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  // History handlers
  ipcMain.handle('get-history', (_event, hours?: unknown): HistoryEntry[] => {
    try {
      if (hours !== undefined) {
        if (!isValidHistoryHours(hours)) {
          logger.warn(`Invalid history hours rejected: ${hours}`)
          return []
        }
        return historyService.getEntriesForPeriod(hours)
      }
      return historyService.getEntries()
    } catch (error) {
      logger.error('IPC get-history error:', error)
      return []
    }
  })

  ipcMain.handle(
    'get-history-chart-data',
    (_event, hours: unknown): { labels: string[]; fiveHour: number[]; sevenDay: number[] } => {
      // Validate input
      if (!isValidHistoryHours(hours)) {
        logger.warn(`Invalid history chart hours rejected: ${hours}`)
        return { labels: [], fiveHour: [], sevenDay: [] }
      }

      try {
        return historyService.getChartData(hours)
      } catch (error) {
        logger.error('IPC get-history-chart-data error:', error)
        return { labels: [], fiveHour: [], sevenDay: [] }
      }
    }
  )

  ipcMain.handle(
    'get-history-stats',
    (
      _event,
      hours: unknown
    ): {
      avgFiveHour: number
      avgSevenDay: number
      maxFiveHour: number
      maxSevenDay: number
      minFiveHour: number
      minSevenDay: number
      entryCount: number
    } | null => {
      // Validate input
      if (!isValidHistoryHours(hours)) {
        logger.warn(`Invalid history stats hours rejected: ${hours}`)
        return null
      }

      try {
        return historyService.getStats(hours)
      } catch (error) {
        logger.error('IPC get-history-stats error:', error)
        return null
      }
    }
  )

  ipcMain.handle('clear-history', () => {
    try {
      historyService.clearHistory()
      return true
    } catch (error) {
      logger.error('IPC clear-history error:', error)
      return false
    }
  })

  // Updater handlers
  ipcMain.handle('check-for-updates', async () => {
    try {
      await updaterService.checkForUpdates()
      return {
        available: updaterService.isUpdateAvailable(),
        downloaded: updaterService.isUpdateDownloaded(),
        version: updaterService.getLatestVersion()
      }
    } catch (error) {
      logger.error('IPC check-for-updates error:', error)
      return {
        available: false,
        downloaded: false,
        version: null
      }
    }
  })

  ipcMain.handle('get-update-status', () => {
    try {
      return {
        available: updaterService.isUpdateAvailable(),
        downloaded: updaterService.isUpdateDownloaded(),
        version: updaterService.getLatestVersion()
      }
    } catch (error) {
      logger.error('IPC get-update-status error:', error)
      return {
        available: false,
        downloaded: false,
        version: null
      }
    }
  })

  ipcMain.handle('install-update', () => {
    try {
      updaterService.quitAndInstall()
    } catch (error) {
      logger.error('IPC install-update error:', error)
    }
  })

  // Logger handlers
  ipcMain.handle('get-log-path', () => {
    try {
      return logger.getLogPath()
    } catch (error) {
      logger.error('IPC get-log-path error:', error)
      return ''
    }
  })
}

export function loadSettings(): void {
  try {
    const refreshInterval = store.get('refreshInterval')
    if (isValidRefreshInterval(refreshInterval)) {
      schedulerService.setRefreshInterval(refreshInterval)
    }

    const launchAtLogin = store.get('launchAtLogin')
    if (isValidBoolean(launchAtLogin)) {
      app.setLoginItemSettings({
        openAtLogin: launchAtLogin,
        openAsHidden: true
      })
    }

    const notificationsEnabled = store.get('notificationsEnabled')
    if (isValidBoolean(notificationsEnabled)) {
      notificationService.setEnabled(notificationsEnabled)
    }

    logger.info('Settings loaded')
  } catch (error) {
    logger.error('Failed to load settings:', error)
  }
}
