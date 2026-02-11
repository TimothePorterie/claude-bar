import { autoUpdater } from 'electron-updater'
import { app } from 'electron'
import { logger } from './logger'
import { notificationService } from './notifications'

export class UpdaterService {
  private updateAvailable = false
  private updateDownloaded = false
  private latestVersion: string | null = null
  private progressCallback?: (percent: number) => void

  initialize(): void {
    // Don't run in development
    if (!app.isPackaged) {
      logger.info('Auto-updater disabled in development mode')
      return
    }

    // Configure auto-updater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    // Set up event handlers
    autoUpdater.on('checking-for-update', () => {
      logger.info('Checking for updates...')
    })

    autoUpdater.on('update-available', (info) => {
      logger.info(`Update available: ${info.version}`)
      this.updateAvailable = true
      this.latestVersion = info.version
      notificationService.notifyUpdateAvailable(info.version)
    })

    autoUpdater.on('update-not-available', (info) => {
      logger.info(`No update available. Current version: ${info.version}`)
      this.updateAvailable = false
    })

    autoUpdater.on('download-progress', (progress) => {
      logger.debug(`Download progress: ${Math.round(progress.percent)}%`)
      this.progressCallback?.(progress.percent)
    })

    autoUpdater.on('update-downloaded', (info) => {
      logger.info(`Update downloaded: ${info.version}`)
      this.updateDownloaded = true
      this.progressCallback?.(100)
      this.latestVersion = info.version
      notificationService.notifyUpdateReady(info.version)
    })

    autoUpdater.on('error', (error) => {
      logger.error('Auto-updater error:', error)
    })

    // Check for updates on startup (with delay)
    setTimeout(() => {
      this.checkForUpdates()
    }, 10000) // 10 seconds after startup

    // Check for updates periodically (every 4 hours)
    setInterval(
      () => {
        this.checkForUpdates()
      },
      4 * 60 * 60 * 1000
    )
  }

  async checkForUpdates(): Promise<void> {
    if (!app.isPackaged) {
      logger.debug('Skipping update check in development mode')
      return
    }

    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      logger.error('Failed to check for updates:', error)
    }
  }

  isUpdateAvailable(): boolean {
    return this.updateAvailable
  }

  isUpdateDownloaded(): boolean {
    return this.updateDownloaded
  }

  getLatestVersion(): string | null {
    return this.latestVersion
  }

  onDownloadProgress(callback: (percent: number) => void): void {
    this.progressCallback = callback
  }

  quitAndInstall(): void {
    if (this.updateDownloaded) {
      logger.info('Quitting and installing update...')
      autoUpdater.quitAndInstall()
    }
  }
}

export const updaterService = new UpdaterService()
