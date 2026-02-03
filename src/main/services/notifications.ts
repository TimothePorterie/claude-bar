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

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    logger.info(`Notifications ${enabled ? 'enabled' : 'disabled'}`)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  private getLevel(utilization: number): QuotaLevel {
    if (utilization >= 90) return 'critical'
    if (utilization >= 70) return 'warning'
    return 'normal'
  }

  private showNotification(title: string, body: string, urgency: 'low' | 'normal' | 'critical' = 'normal'): void {
    if (!this.enabled) return

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
          `Your 5-hour quota is at ${Math.round(fiveHourUtilization)}%. Consider slowing down.`,
          'normal'
        )
      } else if (fiveHourLevel === 'critical') {
        this.showNotification(
          'Session Quota Critical',
          `Your 5-hour quota is at ${Math.round(fiveHourUtilization)}%! You may be rate limited soon.`,
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
          `Your 7-day quota is at ${Math.round(sevenDayUtilization)}%. You have limited usage remaining this week.`,
          'normal'
        )
      } else if (sevenDayLevel === 'critical') {
        this.showNotification(
          'Weekly Quota Critical',
          `Your 7-day quota is at ${Math.round(sevenDayUtilization)}%! Very limited usage remaining.`,
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
