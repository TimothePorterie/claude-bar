import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'
import { trayManager } from './tray'

export class WindowManager {
  private popupWindow: BrowserWindow | null = null
  private settingsWindow: BrowserWindow | null = null

  createPopupWindow(): BrowserWindow {
    // Close existing popup if any
    if (this.popupWindow && !this.popupWindow.isDestroyed()) {
      this.popupWindow.close()
    }

    const trayBounds = trayManager.getBounds()
    const display = screen.getDisplayNearestPoint({
      x: trayBounds?.x ?? 0,
      y: trayBounds?.y ?? 0
    })

    const popupWidth = 320
    const popupHeight = 380

    // Position popup below the tray icon
    let x = trayBounds ? Math.round(trayBounds.x - popupWidth / 2 + trayBounds.width / 2) : 100
    let y = trayBounds ? trayBounds.y + trayBounds.height + 5 : 30

    // Ensure popup stays within screen bounds
    const displayBounds = display.workArea
    if (x + popupWidth > displayBounds.x + displayBounds.width) {
      x = displayBounds.x + displayBounds.width - popupWidth - 10
    }
    if (x < displayBounds.x) {
      x = displayBounds.x + 10
    }

    this.popupWindow = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x,
      y,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      transparent: true,
      vibrancy: 'popover',
      visualEffectState: 'active',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    // Load the popup HTML
    if (app.isPackaged) {
      this.popupWindow.loadFile(join(__dirname, '../renderer/popup/index.html'))
    } else {
      const url = process.env.ELECTRON_RENDERER_URL
      if (url) {
        this.popupWindow.loadURL(`${url}/popup/index.html`)
      } else {
        this.popupWindow.loadFile(join(__dirname, '../renderer/popup/index.html'))
      }
    }

    // Hide when loses focus
    this.popupWindow.on('blur', () => {
      if (this.popupWindow && !this.popupWindow.isDestroyed()) {
        this.popupWindow.hide()
      }
    })

    this.popupWindow.once('ready-to-show', () => {
      this.popupWindow?.show()
    })

    return this.popupWindow
  }

  showPopup(): void {
    if (!this.popupWindow || this.popupWindow.isDestroyed()) {
      this.createPopupWindow()
    } else if (this.popupWindow.isVisible()) {
      this.popupWindow.hide()
    } else {
      // Reposition in case tray moved
      const trayBounds = trayManager.getBounds()
      if (trayBounds) {
        const popupBounds = this.popupWindow.getBounds()
        const x = Math.round(trayBounds.x - popupBounds.width / 2 + trayBounds.width / 2)
        const y = trayBounds.y + trayBounds.height + 5
        this.popupWindow.setPosition(x, y)
      }
      this.popupWindow.show()
    }
  }

  createSettingsWindow(): BrowserWindow {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.focus()
      return this.settingsWindow
    }

    this.settingsWindow = new BrowserWindow({
      width: 450,
      height: 400,
      title: 'Claude Bar Settings',
      resizable: false,
      minimizable: true,
      maximizable: false,
      show: false,
      titleBarStyle: 'hiddenInset',
      vibrancy: 'window',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    // Load the settings HTML
    if (app.isPackaged) {
      this.settingsWindow.loadFile(join(__dirname, '../renderer/settings/index.html'))
    } else {
      const url = process.env.ELECTRON_RENDERER_URL
      if (url) {
        this.settingsWindow.loadURL(`${url}/settings/index.html`)
      } else {
        this.settingsWindow.loadFile(join(__dirname, '../renderer/settings/index.html'))
      }
    }

    this.settingsWindow.once('ready-to-show', () => {
      this.settingsWindow?.show()
    })

    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null
    })

    return this.settingsWindow
  }

  showSettings(): void {
    this.createSettingsWindow()
  }

  closeAll(): void {
    if (this.popupWindow && !this.popupWindow.isDestroyed()) {
      this.popupWindow.close()
    }
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.close()
    }
  }
}

export const windowManager = new WindowManager()
