import { keychainService, Credentials } from './keychain'
import { logger } from './logger'
import { notificationService } from './notifications'
import { historyService } from './history'

export interface QuotaData {
  utilization: number
  resets_at: string
}

export interface UsageResponse {
  five_hour: QuotaData
  seven_day: QuotaData
}

export interface QuotaInfo {
  fiveHour: {
    utilization: number
    resetsAt: Date
    resetsIn: string
  }
  sevenDay: {
    utilization: number
    resetsAt: Date
    resetsIn: string
  }
  lastUpdated: Date
}

interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
}

export class QuotaService {
  private static readonly API_URL = 'https://api.anthropic.com/api/oauth/usage'
  private static readonly BETA_HEADER = 'oauth-2025-04-20'
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 8000
  }

  private cachedQuota: QuotaInfo | null = null
  private lastFetchTime: number = 0
  private minFetchInterval = 30000 // 30 seconds minimum between fetches
  private previousFiveHourUtilization: number | null = null
  private previousSevenDayUtilization: number | null = null

  async fetchQuota(forceRefresh = false): Promise<QuotaInfo | null> {
    // Check cache
    if (!forceRefresh && this.cachedQuota && Date.now() - this.lastFetchTime < this.minFetchInterval) {
      logger.debug('Returning cached quota')
      return this.cachedQuota
    }

    // Use getValidCredentials which handles token refresh
    const credentials = await keychainService.getValidCredentials()
    if (!credentials || !credentials.accessToken) {
      logger.error('No credentials available')
      return null
    }

    try {
      const response = await this.fetchWithRetry(credentials)
      if (!response) return null

      const data = (await response.json()) as UsageResponse

      const newFiveHourReset = new Date(data.five_hour.resets_at)
      const newSevenDayReset = new Date(data.seven_day.resets_at)

      // Check for quota resets - detect when utilization drops significantly (>30%)
      // This indicates the rolling window has moved past high-usage periods
      const RESET_THRESHOLD = 30
      if (
        this.previousFiveHourUtilization !== null &&
        this.previousFiveHourUtilization >= 50 &&
        data.five_hour.utilization < this.previousFiveHourUtilization - RESET_THRESHOLD
      ) {
        notificationService.notifyQuotaReset('fiveHour')
      }
      if (
        this.previousSevenDayUtilization !== null &&
        this.previousSevenDayUtilization >= 50 &&
        data.seven_day.utilization < this.previousSevenDayUtilization - RESET_THRESHOLD
      ) {
        notificationService.notifyQuotaReset('sevenDay')
      }

      this.previousFiveHourUtilization = data.five_hour.utilization
      this.previousSevenDayUtilization = data.seven_day.utilization

      this.cachedQuota = {
        fiveHour: {
          utilization: data.five_hour.utilization,
          resetsAt: newFiveHourReset,
          resetsIn: this.formatTimeUntil(newFiveHourReset)
        },
        sevenDay: {
          utilization: data.seven_day.utilization,
          resetsAt: newSevenDayReset,
          resetsIn: this.formatTimeUntil(newSevenDayReset)
        },
        lastUpdated: new Date()
      }

      this.lastFetchTime = Date.now()

      // Record in history
      historyService.addEntry(data.five_hour.utilization, data.seven_day.utilization)

      // Check and send notifications
      notificationService.checkAndNotify(data.five_hour.utilization, data.seven_day.utilization)

      logger.info(
        `Quota fetched: 5h=${Math.round(data.five_hour.utilization)}%, 7d=${Math.round(data.seven_day.utilization)}%`
      )

      return this.cachedQuota
    } catch (error) {
      logger.error('Failed to fetch quota:', error)
      return null
    }
  }

  private async fetchWithRetry(
    credentials: Credentials,
    config: RetryConfig = QuotaService.DEFAULT_RETRY_CONFIG
  ): Promise<Response | null> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const response = await fetch(QuotaService.API_URL, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            'anthropic-beta': QuotaService.BETA_HEADER,
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          if (attempt > 0) {
            logger.info(`API call succeeded on attempt ${attempt + 1}`)
          }
          return response
        }

        const errorText = await response.text()

        if (response.status === 401) {
          logger.error('Authentication failed - token may be expired')
          // Try to refresh token and retry once
          const refreshed = await keychainService.refreshToken(credentials)
          if (refreshed) {
            credentials = refreshed
            continue
          }
          return null
        }

        // Don't retry for client errors (except 401, 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          logger.error(`API error: ${response.status} - ${errorText}`)
          return null
        }

        // Retry for server errors and rate limiting
        logger.warn(`API error (attempt ${attempt + 1}): ${response.status} - ${errorText}`)
        lastError = new Error(`HTTP ${response.status}: ${errorText}`)
      } catch (error) {
        lastError = error as Error
        logger.warn(`Network error (attempt ${attempt + 1}):`, error)
      }

      // Calculate delay with exponential backoff
      if (attempt < config.maxRetries) {
        const delay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay)
        logger.debug(`Retrying in ${delay}ms...`)
        await this.sleep(delay)
      }
    }

    logger.error(`All ${config.maxRetries + 1} attempts failed`, lastError)
    return null
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private formatTimeUntil(date: Date): string {
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()

    if (diffMs <= 0) {
      return 'Now'
    }

    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays > 0) {
      const remainingHours = diffHours % 24
      return `${diffDays}d ${remainingHours}h`
    }

    if (diffHours > 0) {
      const remainingMinutes = diffMinutes % 60
      return `${diffHours}h ${remainingMinutes}m`
    }

    return `${diffMinutes}m`
  }

  getCachedQuota(): QuotaInfo | null {
    return this.cachedQuota
  }

  getFormattedTitle(compact = false): string {
    if (!this.cachedQuota) {
      return compact ? '--' : '-- / --'
    }

    const fiveHour = Math.round(this.cachedQuota.fiveHour.utilization)
    const sevenDay = Math.round(this.cachedQuota.sevenDay.utilization)

    if (compact) {
      // Show the higher utilization in compact mode
      return `${Math.max(fiveHour, sevenDay)}%`
    }

    return `${fiveHour}% / ${sevenDay}%`
  }

  getDetailedTitle(): string {
    if (!this.cachedQuota) {
      return '5h: --% | 7d: --%'
    }

    const fiveHour = Math.round(this.cachedQuota.fiveHour.utilization)
    const sevenDay = Math.round(this.cachedQuota.sevenDay.utilization)

    return `5h: ${fiveHour}% | 7d: ${sevenDay}%`
  }

  getQuotaLevel(): 'normal' | 'warning' | 'critical' {
    if (!this.cachedQuota) {
      return 'normal'
    }

    const maxUtilization = Math.max(
      this.cachedQuota.fiveHour.utilization,
      this.cachedQuota.sevenDay.utilization
    )

    if (maxUtilization >= 90) {
      return 'critical'
    }

    if (maxUtilization >= 70) {
      return 'warning'
    }

    return 'normal'
  }

  getEnhancedTooltip(): string {
    if (!this.cachedQuota) {
      return 'Claude Bar - Click to view quotas'
    }

    const fiveHour = Math.round(this.cachedQuota.fiveHour.utilization)
    const sevenDay = Math.round(this.cachedQuota.sevenDay.utilization)
    const fiveHourReset = this.cachedQuota.fiveHour.resetsIn
    const sevenDayReset = this.cachedQuota.sevenDay.resetsIn

    const lines = [
      `Session: ${fiveHour}% (resets in ${fiveHourReset})`,
      `Weekly: ${sevenDay}% (resets in ${sevenDayReset})`,
      `Last updated: ${this.cachedQuota.lastUpdated.toLocaleTimeString()}`
    ]

    return lines.join('\n')
  }
}

export const quotaService = new QuotaService()
