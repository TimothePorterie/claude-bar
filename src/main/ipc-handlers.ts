import { ipcMain, app, BrowserWindow } from 'electron'
import { keychainService } from './services/keychain'
import { authService } from './services/auth'
import { quotaService, QuotaInfo } from './services/quota-api'
import { schedulerService } from './services/scheduler'
import { logger } from './services/logger'
import { windowManager } from './windows'
import { settingsStore as store } from './services/settings-store'

// Input validation helpers
const VALID_REFRESH_INTERVALS = [120, 300, 600] as const

function isValidRefreshInterval(value: unknown): value is number {
  return typeof value === 'number' && VALID_REFRESH_INTERVALS.includes(value as 120 | 300 | 600)
}

function isValidBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function setupIpcHandlers(): void {
  // Get quota data (cache only)
  ipcMain.handle('get-quota', async (): Promise<QuotaInfo | null> => {
    try {
      return quotaService.getCachedQuota()
    } catch (error) {
      logger.error('IPC get-quota error:', error)
      return null
    }
  })

  // Force refresh quota (bypass min-interval)
  ipcMain.handle('refresh-quota', async (): Promise<QuotaInfo | null> => {
    try {
      return await quotaService.fetchQuota(true)
    } catch (error) {
      logger.error('IPC refresh-quota error:', error)
      return null
    }
  })

  // Check if credentials exist
  ipcMain.handle('has-credentials', async (): Promise<boolean> => {
    try {
      return authService.hasTokens() || await keychainService.hasCredentials()
    } catch (error) {
      logger.error('IPC has-credentials error:', error)
      return false
    }
  })

  // Get user info
  ipcMain.handle(
    'get-user-info',
    async (): Promise<{ email?: string; name?: string; subscriptionType?: string } | null> => {
      try {
        if (authService.hasTokens()) {
          const authUserInfo = authService.getUserInfo()
          return {
            email: authUserInfo?.email,
            name: authUserInfo?.name,
            subscriptionType: authUserInfo?.subscriptionType
          }
        }

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
        launchAtLogin: store.get('launchAtLogin')
      }
    } catch (error) {
      logger.error('IPC get-settings error:', error)
      return {
        refreshInterval: 300,
        launchAtLogin: false
      }
    }
  })

  ipcMain.handle('set-refresh-interval', (_event, seconds: unknown) => {
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
    if (!isValidBoolean(enabled)) {
      logger.warn(`Invalid launch-at-login value rejected: ${enabled}`)
      return false
    }

    try {
      store.set('launchAtLogin', enabled)
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

  // Get last error
  ipcMain.handle('get-last-error', () => {
    try {
      return quotaService.getLastError()
    } catch (error) {
      logger.error('IPC get-last-error error:', error)
      return null
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
      app.setLoginItemSettings({
        openAtLogin: launchAtLogin,
        openAsHidden: true
      })
    }

    logger.info('Settings loaded')
  } catch (error) {
    logger.error('Failed to load settings:', error)
  }
}
