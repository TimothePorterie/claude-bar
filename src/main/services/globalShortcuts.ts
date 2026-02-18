import { globalShortcut, ipcMain } from 'electron'
import { logger } from './logger'
import { windowManager } from '../windows'
import { schedulerService } from './scheduler'
import { quotaService } from './quota-api'

/**
 * Service for registering global keyboard shortcuts
 * Allows quick actions from anywhere on macOS
 */
export class GlobalShortcutService {
  private shortcuts: Map<string, () => void> = new Map()
  private enabled = false

  constructor() {
    this.setupIpcHandlers()
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('global-shortcuts-set-enabled', (_event, enabled: boolean): boolean => {
      return this.setEnabled(enabled)
    })

    ipcMain.handle('global-shortcuts-get-enabled', (): boolean => {
      return this.enabled
    })
  }

  /**
   * Enable or disable all global shortcuts
   */
  setEnabled(enabled: boolean): boolean {
    if (this.enabled === enabled) return true

    try {
      if (enabled) {
        this.registerShortcuts()
      } else {
        this.unregisterShortcuts()
      }
      this.enabled = enabled
      logger.info(`Global shortcuts ${enabled ? 'enabled' : 'disabled'}`)
      return true
    } catch (error) {
      logger.error('Failed to toggle global shortcuts:', error)
      return false
    }
  }

  /**
   * Register all global shortcuts
   */
  private registerShortcuts(): void {
    // Cmd+Shift+R - Refresh quota
    this.register('Command+Shift+R', async () => {
      logger.debug('Global shortcut: Refresh quota')
      try {
        await quotaService.fetchQuota(true)
        windowManager.showPopup()
      } catch (error) {
        logger.error('Global shortcut refresh failed:', error)
      }
    })

    // Cmd+Shift+P - Toggle pause
    this.register('Command+Shift+P', () => {
      logger.debug('Global shortcut: Toggle pause')
      const status = schedulerService.getPauseStatus()
      if (status.paused) {
        schedulerService.resume()
      } else {
        schedulerService.pause(30) // Pause for 30 minutes by default
      }
      windowManager.showPopup()
    })

    // Cmd+Shift+O - Open popup
    this.register('Command+Shift+O', () => {
      logger.debug('Global shortcut: Open popup')
      windowManager.showPopup()
    })

    // Cmd+Shift+S - Open settings
    this.register('Command+Shift+S', () => {
      logger.debug('Global shortcut: Open settings')
      windowManager.showSettings()
    })
  }

  /**
   * Register a single global shortcut
   */
  private register(accelerator: string, callback: () => void): void {
    const registered = globalShortcut.register(accelerator, callback)
    if (registered) {
      this.shortcuts.set(accelerator, callback)
      logger.debug(`Registered global shortcut: ${accelerator}`)
    } else {
      logger.warn(`Failed to register global shortcut: ${accelerator}`)
    }
  }

  /**
   * Unregister all global shortcuts
   */
  private unregisterShortcuts(): void {
    this.shortcuts.clear()
    globalShortcut.unregisterAll()
    logger.debug('All global shortcuts unregistered')
  }

  /**
   * Clean up on app quit
   */
  dispose(): void {
    this.unregisterShortcuts()
  }
}

export const globalShortcutService = new GlobalShortcutService()
