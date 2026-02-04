import { quotaService } from './quota-api'
import { notificationService, QuotaLevel } from './notifications'
import { logger } from './logger'

type RefreshCallback = () => void

export interface PauseStatus {
  paused: boolean
  resumeAt: number | null // timestamp when auto-resume, null if indefinite
  remainingMs: number | null
}

export class SchedulerService {
  private intervalId: NodeJS.Timeout | null = null
  private pauseTimeoutId: NodeJS.Timeout | null = null
  private refreshIntervalMs: number = 60000 // Default 1 minute
  private baseIntervalMs: number = 60000 // User-configured interval
  private callbacks: Set<RefreshCallback> = new Set()
  private adaptiveEnabled: boolean = true
  private currentQuotaLevel: QuotaLevel = 'normal'
  private paused: boolean = false
  private resumeAt: number | null = null

  setRefreshInterval(seconds: number): void {
    this.baseIntervalMs = seconds * 1000
    this.refreshIntervalMs = this.getAdaptiveInterval()
    if (this.intervalId) {
      this.stop()
      this.start()
    }
  }

  getRefreshInterval(): number {
    return this.refreshIntervalMs / 1000
  }

  getBaseRefreshInterval(): number {
    return this.baseIntervalMs / 1000
  }

  setAdaptiveEnabled(enabled: boolean): void {
    this.adaptiveEnabled = enabled
    logger.info(`Adaptive refresh ${enabled ? 'enabled' : 'disabled'}`)
    if (this.intervalId) {
      this.refreshIntervalMs = this.getAdaptiveInterval()
      this.stop()
      this.start()
    }
  }

  isAdaptiveEnabled(): boolean {
    return this.adaptiveEnabled
  }

  private getAdaptiveInterval(): number {
    if (!this.adaptiveEnabled) {
      return this.baseIntervalMs
    }

    switch (this.currentQuotaLevel) {
      case 'critical':
        // Refresh 4x faster at critical, minimum 15 seconds
        return Math.max(15000, Math.floor(this.baseIntervalMs / 4))
      case 'warning':
        // Refresh 2x faster at warning, minimum 30 seconds
        return Math.max(30000, Math.floor(this.baseIntervalMs / 2))
      default:
        return this.baseIntervalMs
    }
  }

  updateQuotaLevel(level: QuotaLevel): void {
    if (level === this.currentQuotaLevel) {
      return
    }

    const previousLevel = this.currentQuotaLevel
    this.currentQuotaLevel = level

    if (this.adaptiveEnabled) {
      const newInterval = this.getAdaptiveInterval()
      if (newInterval !== this.refreshIntervalMs) {
        logger.info(`Adaptive refresh: ${previousLevel} → ${level}, interval ${this.refreshIntervalMs / 1000}s → ${newInterval / 1000}s`)
        this.refreshIntervalMs = newInterval
        if (this.intervalId) {
          this.stop()
          this.start()
        }
      }
    }
  }

  getNextRefreshTime(): Date {
    return new Date(Date.now() + this.refreshIntervalMs)
  }

  pause(durationMinutes?: number): void {
    this.paused = true
    this.stop()

    // Clear any existing pause timeout
    if (this.pauseTimeoutId) {
      clearTimeout(this.pauseTimeoutId)
      this.pauseTimeoutId = null
    }

    if (durationMinutes && durationMinutes > 0) {
      this.resumeAt = Date.now() + durationMinutes * 60 * 1000
      this.pauseTimeoutId = setTimeout(() => {
        this.resume()
      }, durationMinutes * 60 * 1000)
      logger.info(`Monitoring paused for ${durationMinutes} minutes`)
    } else {
      this.resumeAt = null
      logger.info('Monitoring paused indefinitely')
    }

    this.notifyCallbacks()
  }

  resume(): void {
    if (this.pauseTimeoutId) {
      clearTimeout(this.pauseTimeoutId)
      this.pauseTimeoutId = null
    }

    this.paused = false
    this.resumeAt = null
    this.start()
    logger.info('Monitoring resumed')
  }

  isPaused(): boolean {
    return this.paused
  }

  getPauseStatus(): PauseStatus {
    if (!this.paused) {
      return { paused: false, resumeAt: null, remainingMs: null }
    }

    const remainingMs = this.resumeAt ? Math.max(0, this.resumeAt - Date.now()) : null
    return {
      paused: true,
      resumeAt: this.resumeAt,
      remainingMs
    }
  }

  onRefresh(callback: RefreshCallback): void {
    this.callbacks.add(callback)
  }

  offRefresh(callback: RefreshCallback): void {
    this.callbacks.delete(callback)
  }

  start(): void {
    if (this.intervalId) {
      return
    }

    // Initial fetch
    this.refresh()

    // Schedule recurring fetches
    this.intervalId = setInterval(() => {
      this.refresh()
    }, this.refreshIntervalMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  async refresh(): Promise<void> {
    try {
      await quotaService.fetchQuota(true)
      this.notifyCallbacks()
    } catch (error) {
      console.error('Scheduled refresh failed:', error)
    }
  }

  private notifyCallbacks(): void {
    for (const callback of this.callbacks) {
      try {
        callback()
      } catch (error) {
        console.error('Refresh callback error:', error)
      }
    }
  }
}

export const schedulerService = new SchedulerService()
