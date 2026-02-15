import { autoUpdater } from 'electron-updater'
import { app } from 'electron'
import { spawn } from 'child_process'
import { logger } from './logger'
import { notificationService } from './notifications'

export class UpdaterService {
  private updateAvailable = false
  private updateDownloaded = false
  private latestVersion: string | null = null
  private downloadedFilePath: string | null = null
  private progressCallback?: (percent: number) => void

  initialize(): void {
    // Don't run in development
    if (!app.isPackaged) {
      logger.info('Auto-updater disabled in development mode')
      return
    }

    // Configure auto-updater
    autoUpdater.autoDownload = true
    // Disable Squirrel.Mac auto-install — it fails silently without Developer ID signing
    autoUpdater.autoInstallOnAppQuit = false

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

      // Capture the downloaded zip path for manual installation
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const helper = (autoUpdater as any).downloadedUpdateHelper
        if (helper?.file) {
          this.downloadedFilePath = helper.file
        } else if (helper?.downloadedFileInfo?.file) {
          this.downloadedFilePath = helper.downloadedFileInfo.file
        }
      } catch {
        // Ignore — will try cache dir fallback in quitAndInstall
      }

      // Fallback: use downloadedFile from event info if available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!this.downloadedFilePath && (info as any).downloadedFile) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.downloadedFilePath = (info as any).downloadedFile
      }

      logger.info(`Downloaded update zip path: ${this.downloadedFilePath ?? 'unknown'}`)
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
    if (!this.updateDownloaded || !this.downloadedFilePath) {
      logger.warn('Cannot install update: no downloaded file available')
      return
    }

    logger.info('Installing update manually (bypassing Squirrel.Mac)...')

    // Determine the current .app bundle path from the executable path
    // e.g. /Applications/Claude Bar.app/Contents/MacOS/Claude Bar → /Applications/Claude Bar.app
    const appBundlePath = app.getPath('exe').replace(/\/Contents\/MacOS\/.*$/, '')
    logger.info(`App bundle path: ${appBundlePath}`)
    logger.info(`Downloaded zip: ${this.downloadedFilePath}`)

    // Spawn a detached bash script that:
    // 1. Waits for this process to exit
    // 2. Extracts the zip (ditto preserves macOS metadata)
    // 3. Replaces the .app with backup/restore on failure
    // 4. Relaunches the app
    const script = `
      sleep 1
      TEMP_DIR=$(mktemp -d)
      ditto -xk "${this.downloadedFilePath}" "$TEMP_DIR"
      NEW_APP=$(find "$TEMP_DIR" -name "*.app" -maxdepth 1 -print -quit)
      if [ -d "$NEW_APP" ]; then
        mv "${appBundlePath}" "${appBundlePath}.bak"
        if mv "$NEW_APP" "${appBundlePath}"; then
          rm -rf "${appBundlePath}.bak"
          open "${appBundlePath}"
        else
          mv "${appBundlePath}.bak" "${appBundlePath}"
        fi
      fi
      rm -rf "$TEMP_DIR"
    `

    const child = spawn('bash', ['-c', script], {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()

    app.exit(0)
  }
}

export const updaterService = new UpdaterService()
