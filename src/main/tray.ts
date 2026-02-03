import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { quotaService } from './services/quota-api'
import { schedulerService } from './services/scheduler'

export class TrayManager {
  private tray: Tray | null = null
  private onShowPopup: (() => void) | null = null
  private onShowSettings: (() => void) | null = null

  private getIconPath(type: 'normal' | 'warning' | 'critical' = 'normal'): string {
    const basePath = app.isPackaged
      ? join(process.resourcesPath, 'assets')
      : join(__dirname, '../../assets')

    switch (type) {
      case 'warning':
        return join(basePath, 'icon-warning.png')
      case 'critical':
        return join(basePath, 'icon-critical.png')
      default:
        return join(basePath, 'iconTemplate.png')
    }
  }

  create(callbacks: { onShowPopup: () => void; onShowSettings: () => void }): void {
    this.onShowPopup = callbacks.onShowPopup
    this.onShowSettings = callbacks.onShowSettings

    const iconPath = this.getIconPath()
    const icon = nativeImage.createFromPath(iconPath)
    icon.setTemplateImage(true)

    this.tray = new Tray(icon)
    this.tray.setToolTip('Claude Bar - Click to view quotas')

    // Set initial title
    this.updateTitle()

    // Left click shows popup
    this.tray.on('click', () => {
      if (this.onShowPopup) {
        this.onShowPopup()
      }
    })

    // Right click shows context menu
    this.tray.on('right-click', () => {
      this.showContextMenu()
    })

    // Listen for quota updates
    schedulerService.onRefresh(() => {
      this.updateTitle()
      this.updateIcon()
    })
  }

  updateTitle(): void {
    if (!this.tray) return

    const title = quotaService.getFormattedTitle()
    this.tray.setTitle(title)
  }

  updateIcon(): void {
    if (!this.tray) return

    const level = quotaService.getQuotaLevel()
    const iconPath = this.getIconPath(level)
    const icon = nativeImage.createFromPath(iconPath)

    // Only set as template for normal icon
    if (level === 'normal') {
      icon.setTemplateImage(true)
    }

    this.tray.setImage(icon)
  }

  private showContextMenu(): void {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Refresh',
        click: () => {
          schedulerService.refresh()
        }
      },
      { type: 'separator' },
      {
        label: 'Settings...',
        click: () => {
          if (this.onShowSettings) {
            this.onShowSettings()
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Claude Bar',
        click: () => {
          app.quit()
        }
      }
    ])

    this.tray?.popUpContextMenu(contextMenu)
  }

  getBounds(): Electron.Rectangle | null {
    return this.tray?.getBounds() ?? null
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}

export const trayManager = new TrayManager()
