import { Notification } from 'electron'
import { quotaService } from './quota-api'
import { settingsStore } from './settings-store'
import { logger } from './logger'
import { t } from '../../shared/i18n'

type QuotaLevel = 'normal' | 'warning' | 'critical'

const LEVEL_PRIORITY: Record<QuotaLevel, number> = { normal: 0, warning: 1, critical: 2 }

function getLevel(utilization: number): QuotaLevel {
  if (utilization >= 90) return 'critical'
  if (utilization >= 70) return 'warning'
  return 'normal'
}

export class NotificationService {
  private previousLevels: Map<string, QuotaLevel> = new Map()

  checkAndNotify(): void {
    if (!settingsStore.get('enableNotifications')) return

    const quota = quotaService.getCachedQuota()
    if (!quota) return

    this.checkPeriod(t('popup.session'), quota.fiveHour.utilization)
    this.checkPeriod(t('popup.weekly'), quota.sevenDay.utilization)
    if (quota.sevenDayOpus) {
      this.checkPeriod(t('popup.opus'), quota.sevenDayOpus.utilization)
    }
  }

  private checkPeriod(label: string, utilization: number): void {
    const newLevel = getLevel(utilization)
    const previousLevel = this.previousLevels.get(label) ?? 'normal'

    this.previousLevels.set(label, newLevel)

    // Only notify when crossing upward into warning or critical
    if (LEVEL_PRIORITY[newLevel] <= LEVEL_PRIORITY[previousLevel]) return

    const pct = Math.round(utilization)
    const title = t('notification.thresholdTitle', { label, pct })
    const body =
      newLevel === 'critical' ? t('notification.critical') : t('notification.warning')
    this.send(title, body)
  }

  private send(title: string, body: string): void {
    if (!Notification.isSupported()) return

    const notification = new Notification({ title: t('notification.prefix', { title }), body })
    notification.show()
    logger.info(`Notification: ${title}`)
  }

  reset(): void {
    this.previousLevels.clear()
  }
}

export const notificationService = new NotificationService()
