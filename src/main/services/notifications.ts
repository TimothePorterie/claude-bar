import { Notification, app } from 'electron'
import { logger } from './logger'

export type QuotaLevel = 'normal' | 'warning' | 'critical'

interface NotificationState {
  lastFiveHourLevel: QuotaLevel
  lastSevenDayLevel: QuotaLevel
  lastResetNotification: {
    fiveHour: number
    sevenDay: number
  }
}

interface Thresholds {
  warning: number
  critical: number
}

export class NotificationService {
  private state: NotificationState = {
    lastFiveHourLevel: 'normal',
    lastSevenDayLevel: 'normal',
    lastResetNotification: {
      fiveHour: 0,
      sevenDay: 0
    }
  }
  private enabled = true
  private paused = false
  private thresholds: Thresholds = {
    warning: 70,
    critical: 90
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    logger.info(`Notifications ${enabled ? 'enabled' : 'disabled'}`)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    logger.info(`Notifications ${paused ? 'paused' : 'resumed'}`)
  }

  isPaused(): boolean {
    return this.paused
  }

  setThresholds(warning: number, critical: number): void {
    this.thresholds = { warning, critical }
    logger.info(`Notification thresholds set: warning=${warning}%, critical=${critical}%`)
  }

  getThresholds(): Thresholds {
    return { ...this.thresholds }
  }

  getLevel(utilization: number): QuotaLevel {
    if (utilization >= this.thresholds.critical) return 'critical'
    if (utilization >= this.thresholds.warning) return 'warning'
    return 'normal'
  }

  private showNotification(title: string, body: string, urgency: 'low' | 'normal' | 'critical' = 'normal'): void {
    if (!this.enabled || this.paused) return

    try {
      const notification = new Notification({
        title,
        body,
        silent: urgency === 'low',
        urgency
      })

      notification.show()
      logger.info(`Notification shown: ${title}`)
    } catch (error) {
      logger.error('Failed to show notification:', error)
    }
  }

  checkAndNotify(fiveHourUtilization: number, sevenDayUtilization: number): void {
    const fiveHourLevel = this.getLevel(fiveHourUtilization)
    const sevenDayLevel = this.getLevel(sevenDayUtilization)

    // Check 5-hour quota transitions
    if (fiveHourLevel !== this.state.lastFiveHourLevel) {
      if (fiveHourLevel === 'warning' && this.state.lastFiveHourLevel === 'normal') {
        this.showNotification(
          'Session Quota Warning',
          `Your 5-hour quota is at ${Math.round(fiveHourUtilization)}% (threshold: ${this.thresholds.warning}%). Consider slowing down.`,
          'normal'
        )
      } else if (fiveHourLevel === 'critical') {
        this.showNotification(
          'Session Quota Critical',
          `Your 5-hour quota is at ${Math.round(fiveHourUtilization)}% (threshold: ${this.thresholds.critical}%)! You may be rate limited soon.`,
          'critical'
        )
      }
      this.state.lastFiveHourLevel = fiveHourLevel
    }

    // Check 7-day quota transitions
    if (sevenDayLevel !== this.state.lastSevenDayLevel) {
      if (sevenDayLevel === 'warning' && this.state.lastSevenDayLevel === 'normal') {
        this.showNotification(
          'Weekly Quota Warning',
          `Your 7-day quota is at ${Math.round(sevenDayUtilization)}% (threshold: ${this.thresholds.warning}%). You have limited usage remaining this week.`,
          'normal'
        )
      } else if (sevenDayLevel === 'critical') {
        this.showNotification(
          'Weekly Quota Critical',
          `Your 7-day quota is at ${Math.round(sevenDayUtilization)}% (threshold: ${this.thresholds.critical}%)! Very limited usage remaining.`,
          'critical'
        )
      }
      this.state.lastSevenDayLevel = sevenDayLevel
    }
  }

  notifyQuotaReset(type: 'fiveHour' | 'sevenDay'): void {
    const now = Date.now()
    const cooldown = 5 * 60 * 1000 // 5 minutes cooldown

    if (now - this.state.lastResetNotification[type] < cooldown) {
      return
    }

    this.state.lastResetNotification[type] = now

    if (type === 'fiveHour') {
      this.showNotification(
        'Session Quota Reset',
        'Your 5-hour session quota has been reset. You can use Claude at full capacity again!',
        'low'
      )
      this.state.lastFiveHourLevel = 'normal'
    } else {
      this.showNotification(
        'Weekly Quota Reset',
        'Your 7-day weekly quota has been reset. Full weekly allowance restored!',
        'low'
      )
      this.state.lastSevenDayLevel = 'normal'
    }
  }

  notifyTokenRefreshFailed(): void {
    this.showNotification(
      'Authentication Error',
      'Failed to refresh your OAuth token. Please run "claude login" to re-authenticate.',
      'critical'
    )
  }

  notifyUpdateAvailable(version: string): void {
    this.showNotification(
      'Update Available',
      `Claude Bar ${version} is available. The update will be installed automatically.`,
      'low'
    )
  }

  notifyUpdateReady(version: string): void {
    this.showNotification(
      'Update Ready',
      `Claude Bar ${version} has been downloaded. Restart the app to apply the update.`,
      'normal'
    )
  }
}

export const notificationService = new NotificationService()
