import { app, BrowserWindow } from 'electron'
import { trayManager } from './tray'
import { windowManager } from './windows'
import { schedulerService } from './services/scheduler'
import { setupIpcHandlers, loadSettings } from './ipc-handlers'

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
    schedulerService.stop()
    trayManager.destroy()
    windowManager.closeAll()
  })
}
