import { ipcMain, app, BrowserWindow } from 'electron'
import { keychainService } from './services/keychain'
import { authService } from './services/auth'
import { quotaService, QuotaInfo } from './services/quota-api'
import { schedulerService } from './services/scheduler'
import { historyService, HistoryEntry, TrendData, TimeToThreshold } from './services/history'
import { notificationService } from './services/notifications'
import { updaterService } from './services/updater'
import { logger } from './services/logger'
import { windowManager } from './windows'
import { settingsStore as store } from './services/settings-store'
export { getAuthMode } from './services/settings-store'

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

function isValidThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 50 && value <= 99
}

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

  // Check if credentials exist (respects authMode)
  ipcMain.handle('has-credentials', async (): Promise<boolean> => {
    try {
      const mode = store.get('authMode')
      if (mode === 'app') {
        return authService.hasTokens()
      } else {
        return await keychainService.hasCredentials()
      }
    } catch (error) {
      logger.error('IPC has-credentials error:', error)
      return false
    }
  })

  // Get user info from credentials (respects authMode)
  ipcMain.handle(
    'get-user-info',
    async (): Promise<{ email?: string; name?: string; subscriptionType?: string; authSource?: string } | null> => {
      try {
        const mode = store.get('authMode')

        if (mode === 'app') {
          if (!authService.hasTokens()) return null

          const authUserInfo = authService.getUserInfo()
          // Also try keychain for richer user info (email/name)
          const credentials = await keychainService.getCredentials()
          return {
            email: credentials?.emailAddress || authUserInfo?.email,
            name: credentials?.displayName || authUserInfo?.name,
            subscriptionType: credentials?.subscriptionType || authUserInfo?.subscriptionType,
            authSource: 'app'
          }
        } else {
          // CLI mode — keychain only
          const credentials = await keychainService.getCredentials()
          if (!credentials) return null

          return {
            email: credentials.emailAddress,
            name: credentials.displayName,
            subscriptionType: credentials.subscriptionType,
            authSource: 'cli'
          }
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
        notificationsEnabled: store.get('notificationsEnabled'),
        warningThreshold: store.get('warningThreshold'),
        criticalThreshold: store.get('criticalThreshold'),
        adaptiveRefresh: store.get('adaptiveRefresh'),
        showTimeToCritical: store.get('showTimeToCritical'),
        authMode: store.get('authMode')
      }
    } catch (error) {
      logger.error('IPC get-settings error:', error)
      return {
        refreshInterval: 60,
        launchAtLogin: false,
        notificationsEnabled: true,
        warningThreshold: 70,
        criticalThreshold: 90,
        adaptiveRefresh: true,
        showTimeToCritical: true,
        authMode: 'app'
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
      // Only set login item in production (requires signed app on macOS)
      if (app.isPackaged) {
        app.setLoginItemSettings({
          openAtLogin: enabled,
          openAsHidden: true
        })
      } else {
        logger.debug('Skipping setLoginItemSettings in development mode')
      }
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

  ipcMain.handle('get-thresholds', () => {
    try {
      return {
        warning: store.get('warningThreshold'),
        critical: store.get('criticalThreshold')
      }
    } catch (error) {
      logger.error('IPC get-thresholds error:', error)
      return { warning: 70, critical: 90 }
    }
  })

  ipcMain.handle('set-warning-threshold', (_event, threshold: unknown) => {
    if (!isValidThreshold(threshold)) {
      logger.warn(`Invalid warning threshold rejected: ${threshold}`)
      return false
    }

    const criticalThreshold = store.get('criticalThreshold')
    if (threshold >= criticalThreshold) {
      logger.warn(`Warning threshold (${threshold}) must be less than critical (${criticalThreshold})`)
      return false
    }

    try {
      store.set('warningThreshold', threshold)
      notificationService.setThresholds(threshold, criticalThreshold)
      logger.info(`Warning threshold set to ${threshold}%`)
      return true
    } catch (error) {
      logger.error('IPC set-warning-threshold error:', error)
      return false
    }
  })

  ipcMain.handle('set-critical-threshold', (_event, threshold: unknown) => {
    if (!isValidThreshold(threshold)) {
      logger.warn(`Invalid critical threshold rejected: ${threshold}`)
      return false
    }

    const warningThreshold = store.get('warningThreshold')
    if (threshold <= warningThreshold) {
      logger.warn(`Critical threshold (${threshold}) must be greater than warning (${warningThreshold})`)
      return false
    }

    try {
      store.set('criticalThreshold', threshold)
      notificationService.setThresholds(warningThreshold, threshold)
      logger.info(`Critical threshold set to ${threshold}%`)
      return true
    } catch (error) {
      logger.error('IPC set-critical-threshold error:', error)
      return false
    }
  })

  ipcMain.handle('set-adaptive-refresh', (_event, enabled: unknown) => {
    if (!isValidBoolean(enabled)) {
      logger.warn(`Invalid adaptive-refresh value rejected: ${enabled}`)
      return false
    }

    try {
      store.set('adaptiveRefresh', enabled)
      schedulerService.setAdaptiveEnabled(enabled)
      return true
    } catch (error) {
      logger.error('IPC set-adaptive-refresh error:', error)
      return false
    }
  })

  ipcMain.handle('set-show-time-to-critical', (_event, enabled: unknown) => {
    if (!isValidBoolean(enabled)) {
      logger.warn(`Invalid show-time-to-critical value rejected: ${enabled}`)
      return false
    }

    try {
      store.set('showTimeToCritical', enabled)
      return true
    } catch (error) {
      logger.error('IPC set-show-time-to-critical error:', error)
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

  ipcMain.handle('get-trend', (_event, lookbackMinutes?: unknown): TrendData | null => {
    try {
      const minutes = typeof lookbackMinutes === 'number' && lookbackMinutes > 0 ? lookbackMinutes : 30
      return historyService.getTrend(minutes)
    } catch (error) {
      logger.error('IPC get-trend error:', error)
      return null
    }
  })

  // Export history to CSV
  ipcMain.handle('export-history-csv', (_event, hours?: unknown): string => {
    try {
      const h = typeof hours === 'number' && hours > 0 ? hours : undefined
      return historyService.exportToCSV(h)
    } catch (error) {
      logger.error('IPC export-history-csv error:', error)
      return ''
    }
  })

  ipcMain.handle('pause-monitoring', (_event, durationMinutes?: unknown) => {
    try {
      const duration = typeof durationMinutes === 'number' && durationMinutes > 0 ? durationMinutes : undefined
      schedulerService.pause(duration)
      notificationService.setPaused(true)
      return true
    } catch (error) {
      logger.error('IPC pause-monitoring error:', error)
      return false
    }
  })

  ipcMain.handle('resume-monitoring', () => {
    try {
      schedulerService.resume()
      notificationService.setPaused(false)
      return true
    } catch (error) {
      logger.error('IPC resume-monitoring error:', error)
      return false
    }
  })

  ipcMain.handle('get-pause-status', () => {
    try {
      return schedulerService.getPauseStatus()
    } catch (error) {
      logger.error('IPC get-pause-status error:', error)
      return { paused: false, resumeAt: null, remainingMs: null }
    }
  })

  ipcMain.handle('get-time-to-critical', (): TimeToThreshold | null => {
    try {
      const criticalThreshold = store.get('criticalThreshold')
      return historyService.estimateTimeToThreshold(criticalThreshold)
    } catch (error) {
      logger.error('IPC get-time-to-critical error:', error)
      return null
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

  // Auth handlers
  ipcMain.handle('auth-start-login', async (): Promise<boolean> => {
    try {
      return await authService.startLogin()
    } catch (error) {
      logger.error('IPC auth-start-login error:', error)
      return false
    }
  })

  ipcMain.handle(
    'auth-submit-code',
    async (_event, code: unknown): Promise<{ success: boolean; error?: string }> => {
      if (typeof code !== 'string') {
        return { success: false, error: 'Invalid code format.' }
      }
      try {
        return await authService.submitCode(code)
      } catch (error) {
        logger.error('IPC auth-submit-code error:', error)
        return { success: false, error: 'An unexpected error occurred.' }
      }
    }
  )

  ipcMain.handle('auth-logout', (): boolean => {
    try {
      authService.logout()
      return true
    } catch (error) {
      logger.error('IPC auth-logout error:', error)
      return false
    }
  })

  ipcMain.handle('auth-get-state', (): string => {
    try {
      return authService.getState()
    } catch (error) {
      logger.error('IPC auth-get-state error:', error)
      return 'unauthenticated'
    }
  })

  // Auth mode handlers
  ipcMain.handle('get-auth-mode', (): string => {
    try {
      return store.get('authMode')
    } catch (error) {
      logger.error('IPC get-auth-mode error:', error)
      return 'app'
    }
  })

  ipcMain.handle('set-auth-mode', (_event, mode: unknown): boolean => {
    if (mode !== 'app' && mode !== 'cli') {
      logger.warn(`Invalid auth mode rejected: ${mode}`)
      return false
    }

    try {
      store.set('authMode', mode)
      logger.info(`Auth mode set to: ${mode}`)
      return true
    } catch (error) {
      logger.error('IPC set-auth-mode error:', error)
      return false
    }
  })

  // Get last error
  ipcMain.handle('get-last-error', () => {
    try {
      return quotaService.getLastError()
    } catch (error) {
      logger.error('IPC get-last-error error:', error)
      return null
    }
  })

  // Open settings window from popup
  ipcMain.handle('open-settings', () => {
    try {
      windowManager.showSettings()
      return true
    } catch (error) {
      logger.error('IPC open-settings error:', error)
      return false
    }
  })

  // Forward download progress to all renderer windows
  updaterService.onDownloadProgress((percent) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('update-download-progress', percent)
      }
    })
  })

  // Forward auth state changes to all renderer windows
  authService.onStateChange((state) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('auth-state-changed', state)
      }
    })
  })
}

export function loadSettings(): void {
  try {
    const refreshInterval = store.get('refreshInterval')
    if (isValidRefreshInterval(refreshInterval)) {
      schedulerService.setRefreshInterval(refreshInterval)
    }

    const launchAtLogin = store.get('launchAtLogin')
    if (isValidBoolean(launchAtLogin) && app.isPackaged) {
      // Only set login item in production (requires signed app on macOS)
      app.setLoginItemSettings({
        openAtLogin: launchAtLogin,
        openAsHidden: true
      })
    }

    const notificationsEnabled = store.get('notificationsEnabled')
    if (isValidBoolean(notificationsEnabled)) {
      notificationService.setEnabled(notificationsEnabled)
    }

    // Load threshold settings
    const warningThreshold = store.get('warningThreshold')
    const criticalThreshold = store.get('criticalThreshold')
    if (isValidThreshold(warningThreshold) && isValidThreshold(criticalThreshold)) {
      notificationService.setThresholds(warningThreshold, criticalThreshold)
    }

    // Load adaptive refresh setting
    const adaptiveRefresh = store.get('adaptiveRefresh')
    if (isValidBoolean(adaptiveRefresh)) {
      schedulerService.setAdaptiveEnabled(adaptiveRefresh)
    }

    logger.info('Settings loaded')
  } catch (error) {
    logger.error('Failed to load settings:', error)
  }
}
