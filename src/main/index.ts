import { app, BrowserWindow, powerMonitor } from 'electron'
import { trayManager } from './tray'
import { windowManager } from './windows'
import { schedulerService } from './services/scheduler'
import { updaterService } from './services/updater'
import { authService } from './services/auth'
import { setupIpcHandlers, loadSettings } from './ipc-handlers'
import { logger } from './services/logger'

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    windowManager.showPopup()
  })

  if (app.dock) {
    app.dock.hide()
  }

  app.whenReady().then(() => {
    logger.info(`Claude Bar v${app.getVersion()} starting...`)

    // Initialize auth service
    authService.initialize()

    // Setup IPC handlers
    setupIpcHandlers()

    // Load saved settings
    loadSettings()

    // Create tray icon
    trayManager.create({
      onShowPopup: () => windowManager.showPopup(),
      onShowSettings: () => windowManager.showSettings()
    })

    // Initialize auto-updater
    updaterService.initialize()

    // Start the scheduler (delay to allow network initialization)
    setTimeout(() => {
      schedulerService.start()
      logger.info('Scheduler started after startup delay')
    }, 2000)

    // Check for updates after a short delay (don't block startup)
    setTimeout(() => {
      updaterService.checkForUpdates()
    }, 5000)

    // Refresh after wake from sleep (network needs a moment to reconnect)
    powerMonitor.on('resume', () => {
      logger.info('System resumed from sleep, scheduling refresh')
      setTimeout(() => schedulerService.refresh(), 2000)
    })

    logger.info('Claude Bar started successfully')
  })

  app.on('window-all-closed', (e: Event) => {
    e.preventDefault()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.showPopup()
    }
  })

  app.on('before-quit', () => {
    logger.info('Claude Bar shutting down...')
    schedulerService.stop()
    trayManager.destroy()
    windowManager.closeAll()
  })
}
