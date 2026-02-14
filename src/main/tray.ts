import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { quotaService } from './services/quota-api'
import { historyService } from './services/history'
import { schedulerService } from './services/scheduler'
import { notificationService } from './services/notifications'
import { logger } from './services/logger'
import { windowManager } from './windows'
import Store from 'electron-store'

type DisplayMode = 'standard' | 'detailed' | 'compact' | 'minimal' | 'time-remaining'

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

  private getIconPath(type: 'normal' | 'warning' | 'critical' | 'paused' = 'normal'): string {
    const basePath = app.isPackaged
      ? join(process.resourcesPath, 'assets')
      : join(__dirname, '../../assets')

    switch (type) {
      case 'warning':
        return join(basePath, 'icon-warning.png')
      case 'critical':
        return join(basePath, 'icon-critical.png')
      case 'paused':
        // Use template icon for paused state (grayed out by macOS)
        return join(basePath, 'iconTemplate.png')
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
      // Send updated quota to popup window
      const quota = quotaService.getCachedQuota()
      if (quota) {
        windowManager.sendToPopup('quota-updated', quota)
      }
      // Forward errors to popup
      const error = quotaService.getLastError()
      if (error && !quota) {
        windowManager.sendToPopup('quota-error', error)
      }
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

  private getTrendSymbol(direction: 'up' | 'down' | 'stable'): string {
    switch (direction) {
      case 'up':
        return '↑'
      case 'down':
        return '↓'
      case 'stable':
        return '→'
    }
  }

  updateTitle(): void {
    if (!this.tray) return

    // Show paused indicator if monitoring is paused
    if (schedulerService.isPaused()) {
      const pauseStatus = schedulerService.getPauseStatus()
      if (pauseStatus.remainingMs) {
        const minutes = Math.ceil(pauseStatus.remainingMs / 60000)
        this.tray.setTitle(`⏸ ${minutes}m`)
      } else {
        this.tray.setTitle('⏸')
      }
      return
    }

    // If no cached quota and there's an error, show error indicator
    const lastError = quotaService.getLastError()
    if (!quotaService.getCachedQuota() && lastError) {
      if (lastError.type === 'auth') {
        this.tray.setTitle('⚠ Login')
      } else {
        this.tray.setTitle('⚠ Error')
      }
      return
    }

    const mode = this.getDisplayMode()
    let title: string

    switch (mode) {
      case 'detailed':
        title = this.getDetailedTitleWithTrend()
        break
      case 'compact':
        title = quotaService.getFormattedTitle(true)
        break
      case 'minimal':
        title = '' // Icon only, no text
        break
      case 'time-remaining':
        title = quotaService.getTimeRemainingTitle()
        break
      default:
        title = quotaService.getFormattedTitle(false)
    }

    this.tray.setTitle(title)
  }

  private getDetailedTitleWithTrend(): string {
    const baseTitle = quotaService.getDetailedTitle()
    const trend = historyService.getTrend(30)

    if (!trend) {
      return baseTitle
    }

    // Parse the base title and add trend indicators
    const fiveHourSymbol = this.getTrendSymbol(trend.fiveHour.direction)
    const sevenDaySymbol = this.getTrendSymbol(trend.sevenDay.direction)

    const quota = quotaService.getCachedQuota()
    if (!quota) {
      return baseTitle
    }

    const fiveHour = Math.round(quota.fiveHour.utilization)
    const sevenDay = Math.round(quota.sevenDay.utilization)

    return `5h: ${fiveHour}%${fiveHourSymbol} | 7d: ${sevenDay}%${sevenDaySymbol}`
  }

  updateIcon(): void {
    if (!this.tray) return

    // Use paused icon if monitoring is paused
    if (schedulerService.isPaused()) {
      const iconPath = this.getIconPath('paused')
      const icon = nativeImage.createFromPath(iconPath)
      icon.setTemplateImage(true)
      this.tray.setImage(icon)
      return
    }

    // Use warning icon if there's an error and no cached data
    const lastError = quotaService.getLastError()
    if (!quotaService.getCachedQuota() && lastError) {
      const iconPath = this.getIconPath('warning')
      const icon = nativeImage.createFromPath(iconPath)
      this.tray.setImage(icon)
      return
    }

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
    const isPaused = schedulerService.isPaused()

    const pauseSubmenu: Electron.MenuItemConstructorOptions[] = isPaused
      ? [
          {
            label: 'Resume Monitoring',
            click: () => {
              schedulerService.resume()
              notificationService.setPaused(false)
              this.updateIcon()
              this.updateTitle()
            }
          }
        ]
      : [
          {
            label: 'Pause 30 minutes',
            click: () => {
              schedulerService.pause(30)
              notificationService.setPaused(true)
              this.updateIcon()
              this.updateTitle()
            }
          },
          {
            label: 'Pause 1 hour',
            click: () => {
              schedulerService.pause(60)
              notificationService.setPaused(true)
              this.updateIcon()
              this.updateTitle()
            }
          },
          {
            label: 'Pause 2 hours',
            click: () => {
              schedulerService.pause(120)
              notificationService.setPaused(true)
              this.updateIcon()
              this.updateTitle()
            }
          },
          { type: 'separator' },
          {
            label: 'Pause indefinitely',
            click: () => {
              schedulerService.pause()
              notificationService.setPaused(true)
              this.updateIcon()
              this.updateTitle()
            }
          }
        ]

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Refresh',
        enabled: !isPaused,
        click: () => {
          schedulerService.refresh()
        }
      },
      { type: 'separator' },
      {
        label: isPaused ? 'Resume' : 'Pause',
        submenu: pauseSubmenu
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
          },
          {
            label: 'Time Remaining (4h 30m)',
            type: 'radio',
            checked: currentMode === 'time-remaining',
            click: () => this.setDisplayMode('time-remaining')
          },
          {
            label: 'Minimal (icon only)',
            type: 'radio',
            checked: currentMode === 'minimal',
            click: () => this.setDisplayMode('minimal')
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
