import { app, BrowserWindow, powerMonitor } from 'electron'
import { trayManager } from './tray'
import { windowManager } from './windows'
import { schedulerService } from './services/scheduler'
import { setupIpcHandlers, loadSettings } from './ipc-handlers'
import { updaterService } from './services/updater'
import { logger } from './services/logger'

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  // Handle second instance
  app.on('second-instance', () => {
    // Show the popup when user tries to launch second instance
    windowManager.showPopup()
  })

  // Hide dock icon (we only want menu bar presence)
  if (app.dock) {
    app.dock.hide()
  }

  app.whenReady().then(() => {
    logger.info(`Claude Bar v${app.getVersion()} starting...`)

    // Setup IPC handlers
    setupIpcHandlers()

    // Load saved settings
    loadSettings()

    // Create tray icon
    trayManager.create({
      onShowPopup: () => windowManager.showPopup(),
      onShowSettings: () => windowManager.showSettings()
    })

    // Start the scheduler for automatic refresh
    schedulerService.start()

    // Initialize auto-updater
    updaterService.initialize()

    // Handle sleep/wake to avoid auth errors when Mac wakes up
    powerMonitor.on('suspend', () => {
      logger.info('System suspending — stopping scheduler')
      schedulerService.stop()
    })

    powerMonitor.on('resume', () => {
      logger.info('System resumed — restarting scheduler in 5s')
      setTimeout(() => {
        schedulerService.start()
        logger.info('Scheduler restarted after wake')
      }, 5000)
    })

    logger.info('Claude Bar started successfully')
  })

  // macOS: Keep app running when all windows are closed
  app.on('window-all-closed', (e: Event) => {
    e.preventDefault()
  })

  app.on('activate', () => {
    // On macOS, show popup when clicking dock icon (if visible)
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
