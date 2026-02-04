import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { quotaService } from './services/quota-api'
import { schedulerService } from './services/scheduler'
import { logger } from './services/logger'
import Store from 'electron-store'

type DisplayMode = 'standard' | 'detailed' | 'compact'

interface TraySettings {
  displayMode: DisplayMode
}

export class TrayManager {
  private tray: Tray | null = null
  private onShowPopup: (() => void) | null = null
  private onShowSettings: (() => void) | null = null
  private store: Store<TraySettings>

  constructor() {
    this.store = new Store<TraySettings>({
      name: 'tray-settings',
      defaults: {
        displayMode: 'standard'
      }
    })
  }

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
    this.updateTooltip()

    // Set initial title
    this.updateTitle()

    // Left click shows popup and refreshes quota
    this.tray.on('click', () => {
      if (this.onShowPopup) {
        this.onShowPopup()
      }
      schedulerService.refresh()
    })

    // Right click shows context menu
    this.tray.on('right-click', () => {
      this.showContextMenu()
    })

    // Listen for quota updates
    schedulerService.onRefresh(() => {
      this.updateTitle()
      this.updateIcon()
      this.updateTooltip()
    })

    logger.info('Tray created')
  }

  getDisplayMode(): DisplayMode {
    return this.store.get('displayMode')
  }

  setDisplayMode(mode: DisplayMode): void {
    this.store.set('displayMode', mode)
    this.updateTitle()
    logger.info(`Display mode changed to: ${mode}`)
  }

  updateTitle(): void {
    if (!this.tray) return

    const mode = this.getDisplayMode()
    let title: string

    switch (mode) {
      case 'detailed':
        title = quotaService.getDetailedTitle()
        break
      case 'compact':
        title = quotaService.getFormattedTitle(true)
        break
      default:
        title = quotaService.getFormattedTitle(false)
    }

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

  updateTooltip(): void {
    if (!this.tray) return
    this.tray.setToolTip(quotaService.getEnhancedTooltip())
  }

  private showContextMenu(): void {
    const currentMode = this.getDisplayMode()

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Refresh',
        click: () => {
          schedulerService.refresh()
        }
      },
      { type: 'separator' },
      {
        label: 'Display Mode',
        submenu: [
          {
            label: 'Standard (45% / 32%)',
            type: 'radio',
            checked: currentMode === 'standard',
            click: () => this.setDisplayMode('standard')
          },
          {
            label: 'Detailed (5h: 45% | 7d: 32%)',
            type: 'radio',
            checked: currentMode === 'detailed',
            click: () => this.setDisplayMode('detailed')
          },
          {
            label: 'Compact (45%)',
            type: 'radio',
            checked: currentMode === 'compact',
            click: () => this.setDisplayMode('compact')
          }
        ]
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
