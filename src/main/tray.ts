import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { quotaService } from './services/quota-api'
import { schedulerService } from './services/scheduler'
import { updaterService } from './services/updater'
import { logger } from './services/logger'
import { windowManager } from './windows'
import { settingsStore } from './services/settings-store'

type DisplayMode = 'standard' | 'detailed' | 'compact' | 'minimal' | 'time-remaining'

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
    this.updateTooltip()
    this.updateTitle()

    // Left click shows popup (scheduler handles periodic refresh)
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
      this.updateTooltip()
      // Send updated quota to popup window
      const quota = quotaService.getCachedQuota()
      if (quota) {
        windowManager.sendToPopup('quota-updated', quota)
      }
      // Forward real errors to popup (not rate limits — those are transient)
      const error = quotaService.getLastError()
      if (error && !quota && error.type !== 'rate_limit') {
        windowManager.sendToPopup('quota-error', error)
      }
    })

    logger.info('Tray created')
  }

  private getDisplayMode(): DisplayMode {
    return (settingsStore.get('displayMode') as DisplayMode) || 'standard'
  }

  private setDisplayMode(mode: DisplayMode): void {
    settingsStore.set('displayMode', mode)
    this.updateTitle()
    logger.info(`Display mode changed to: ${mode}`)
  }

  updateTitle(): void {
    if (!this.tray) return

    // If no cached quota and there's a real error, show error indicator
    const lastError = quotaService.getLastError()
    if (!quotaService.getCachedQuota() && lastError && lastError.type !== 'rate_limit') {
      if (lastError.type === 'auth') {
        this.tray.setTitle('⚠ Login')
      } else {
        this.tray.setTitle('⚠ Error')
      }
      return
    }

    const quota = quotaService.getCachedQuota()
    if (!quota) {
      this.tray.setTitle('-- / --')
      return
    }

    const fiveHour = Math.round(quota.fiveHour.utilization)
    const sevenDay = Math.round(quota.sevenDay.utilization)
    const opus = quota.sevenDayOpus ? Math.round(quota.sevenDayOpus.utilization) : null
    const mode = this.getDisplayMode()

    switch (mode) {
      case 'detailed':
        if (opus !== null) {
          this.tray.setTitle(`5h: ${fiveHour}% | 7d: ${sevenDay}% | Opus: ${opus}%`)
        } else {
          this.tray.setTitle(`5h: ${fiveHour}% | 7d: ${sevenDay}%`)
        }
        break
      case 'compact':
        this.tray.setTitle(`${fiveHour}%`)
        break
      case 'minimal':
        this.tray.setTitle('')
        break
      case 'time-remaining':
        this.tray.setTitle(quota.fiveHour.resetsIn)
        break
      default: // standard
        this.tray.setTitle(`${fiveHour}% / ${sevenDay}%`)
    }
  }

  updateIcon(): void {
    if (!this.tray) return

    // Use warning icon if there's a real error and no cached data
    const lastError = quotaService.getLastError()
    if (!quotaService.getCachedQuota() && lastError && lastError.type !== 'rate_limit') {
      const iconPath = this.getIconPath('warning')
      const icon = nativeImage.createFromPath(iconPath)
      this.tray.setImage(icon)
      return
    }

    const level = quotaService.getQuotaLevel()
    const iconPath = this.getIconPath(level)
    const icon = nativeImage.createFromPath(iconPath)

    if (level === 'normal') {
      icon.setTemplateImage(true)
    }

    this.tray.setImage(icon)
  }

  updateTooltip(): void {
    if (!this.tray) return

    const quota = quotaService.getCachedQuota()
    if (!quota) {
      const lastError = quotaService.getLastError()
      if (lastError) {
        this.tray.setToolTip(`Claude Bar — ${lastError.message}`)
      } else {
        this.tray.setToolTip('Claude Bar — Click to view quotas')
      }
      return
    }

    const fiveHour = Math.round(quota.fiveHour.utilization)
    const sevenDay = Math.round(quota.sevenDay.utilization)
    const lines = [
      `Session: ${fiveHour}% (resets in ${quota.fiveHour.resetsIn})`,
      `Weekly: ${sevenDay}% (resets in ${quota.sevenDay.resetsIn})`
    ]
    if (quota.sevenDayOpus) {
      lines.push(`Opus: ${Math.round(quota.sevenDayOpus.utilization)}% (resets in ${quota.sevenDayOpus.resetsIn})`)
    }
    lines.push(`Updated: ${quota.lastUpdated.toLocaleTimeString()}`)
    this.tray.setToolTip(lines.join('\n'))
  }

  private showContextMenu(): void {
    const currentMode = this.getDisplayMode()

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Refresh',
        click: () => {
          schedulerService.refresh(true)
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
      {
        label: 'Check for Updates...',
        click: () => {
          updaterService.checkForUpdates()
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
