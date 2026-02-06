import { keychainService, Credentials } from './keychain'
import { logger } from './logger'
import { notificationService } from './notifications'
import { historyService } from './history'
import { schedulerService } from './scheduler'

export interface QuotaData {
  utilization: number
  resets_at: string
}

export interface UsageResponse {
  five_hour: QuotaData
  seven_day: QuotaData
}

export type QuotaErrorType = 'network' | 'auth' | 'rate_limit' | 'server' | 'unknown'

export interface QuotaError {
  type: QuotaErrorType
  message: string
  retryable: boolean
}

export interface QuotaInfo {
  fiveHour: {
    utilization: number
    resetsAt: Date
    resetsIn: string
    resetProgress: number // 0-100, percentage of time elapsed in the period
  }
  sevenDay: {
    utilization: number
    resetsAt: Date
    resetsIn: string
    resetProgress: number // 0-100, percentage of time elapsed in the period
  }
  lastUpdated: Date
  error?: QuotaError
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
  private lastSuccessfulFetch: number = 0
  private lastError: QuotaError | null = null
  private minFetchInterval = 30000 // 30 seconds minimum between fetches

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

      this.cachedQuota = {
        fiveHour: {
          utilization: data.five_hour.utilization,
          resetsAt: newFiveHourReset,
          resetsIn: this.formatTimeUntil(newFiveHourReset),
          resetProgress: this.calculateResetProgress(newFiveHourReset, 5)
        },
        sevenDay: {
          utilization: data.seven_day.utilization,
          resetsAt: newSevenDayReset,
          resetsIn: this.formatTimeUntil(newSevenDayReset),
          resetProgress: this.calculateResetProgress(newSevenDayReset, 7 * 24)
        },
        lastUpdated: new Date()
      }

      this.lastFetchTime = Date.now()
      this.lastSuccessfulFetch = Date.now()
      this.lastError = null

      // Record in history
      historyService.addEntry(data.five_hour.utilization, data.seven_day.utilization)

      // Check and send notifications
      notificationService.checkAndNotify(data.five_hour.utilization, data.seven_day.utilization)

      // Update scheduler with current quota level for adaptive refresh
      const level = this.getQuotaLevel()
      schedulerService.updateQuotaLevel(level)

      logger.info(
        `Quota fetched: 5h=${Math.round(data.five_hour.utilization)}%, 7d=${Math.round(data.seven_day.utilization)}%`
      )

      return this.cachedQuota
    } catch (error) {
      logger.error('Failed to fetch quota:', error)
      this.lastError = this.classifyError(error)

      // Return cached quota with error attached if available
      if (this.cachedQuota) {
        return { ...this.cachedQuota, error: this.lastError }
      }
      return null
    }
  }

  private classifyError(error: unknown): QuotaError {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('network') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) {
      return { type: 'network', message: 'Unable to connect. Check your internet connection.', retryable: true }
    }

    if (errorMessage.includes('401') || errorMessage.includes('authentication') || errorMessage.includes('token')) {
      return { type: 'auth', message: 'Authentication failed. Please run "claude login" again.', retryable: false }
    }

    if (errorMessage.includes('429') || errorMessage.includes('rate')) {
      return { type: 'rate_limit', message: 'Rate limited. Will retry automatically.', retryable: true }
    }

    if (errorMessage.includes('5')) {
      return { type: 'server', message: 'Server error. Will retry automatically.', retryable: true }
    }

    return { type: 'unknown', message: 'An unexpected error occurred.', retryable: true }
  }

  getLastError(): QuotaError | null {
    return this.lastError
  }

  getLastSuccessfulFetch(): number {
    return this.lastSuccessfulFetch
  }

  private async fetchWithRetry(
    credentials: Credentials,
    config: RetryConfig = QuotaService.DEFAULT_RETRY_CONFIG
  ): Promise<Response | null> {
    let lastError: Error | null = null
    let tokenRefreshAttempted = false

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
          if (tokenRefreshAttempted) {
            logger.error('Authentication failed after token refresh — giving up')
            return null
          }
          logger.error('Authentication failed - token may be expired')
          tokenRefreshAttempted = true
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

  private calculateResetProgress(resetsAt: Date, periodHours: number): number {
    const now = Date.now()
    const resetTime = resetsAt.getTime()
    const periodMs = periodHours * 60 * 60 * 1000
    const startTime = resetTime - periodMs

    // Calculate how much of the period has elapsed
    const elapsed = now - startTime
    const progress = Math.max(0, Math.min(100, (elapsed / periodMs) * 100))

    return Math.round(progress)
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

  getTimeRemainingTitle(): string {
    if (!this.cachedQuota) {
      return '--'
    }

    // Show time until session (5-hour) quota resets
    return this.cachedQuota.fiveHour.resetsIn
  }

  getQuotaLevel(): 'normal' | 'warning' | 'critical' {
    if (!this.cachedQuota) {
      return 'normal'
    }

    const maxUtilization = Math.max(
      this.cachedQuota.fiveHour.utilization,
      this.cachedQuota.sevenDay.utilization
    )

    // Use notification service's getLevel to respect user's threshold settings
    return notificationService.getLevel(maxUtilization)
  }

  getEnhancedTooltip(): string {
    if (!this.cachedQuota) {
      return 'Claude Bar - Click to view quotas'
    }

    const fiveHour = Math.round(this.cachedQuota.fiveHour.utilization)
    const sevenDay = Math.round(this.cachedQuota.sevenDay.utilization)
    const fiveHourReset = this.cachedQuota.fiveHour.resetsIn
    const sevenDayReset = this.cachedQuota.sevenDay.resetsIn

    // Get trend data
    const trend = historyService.getTrend(30)
    const fiveHourTrend = trend ? this.getTrendSymbol(trend.fiveHour.direction) : ''
    const sevenDayTrend = trend ? this.getTrendSymbol(trend.sevenDay.direction) : ''

    const lines = [
      `Session: ${fiveHour}%${fiveHourTrend} (resets in ${fiveHourReset})`,
      `Weekly: ${sevenDay}%${sevenDayTrend} (resets in ${sevenDayReset})`
    ]

    // Add time to critical if applicable
    const thresholds = notificationService.getThresholds()
    const ttc = historyService.estimateTimeToThreshold(thresholds.critical)
    if (ttc) {
      const estimates = [ttc.fiveHour, ttc.sevenDay].filter((v): v is number => v !== null)
      if (estimates.length > 0) {
        const minTime = Math.min(...estimates)
        lines.push(`Est. critical: ~${this.formatHoursShort(minTime)}`)
      }
    }

    // Add next refresh info
    const nextRefresh = schedulerService.getNextRefreshTime()
    const secondsUntilRefresh = Math.max(0, Math.round((nextRefresh.getTime() - Date.now()) / 1000))
    if (!schedulerService.isPaused()) {
      lines.push(`Next refresh: ${secondsUntilRefresh}s`)
    } else {
      const pauseStatus = schedulerService.getPauseStatus()
      if (pauseStatus.remainingMs) {
        const minutes = Math.ceil(pauseStatus.remainingMs / 60000)
        lines.push(`Paused (${minutes}m remaining)`)
      } else {
        lines.push('Paused')
      }
    }

    lines.push(`Last updated: ${this.cachedQuota.lastUpdated.toLocaleTimeString()}`)

    return lines.join('\n')
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

  private formatHoursShort(hours: number): string {
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`
    }
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    if (m === 0) {
      return `${h}h`
    }
    return `${h}h ${m}m`
  }
}

export const quotaService = new QuotaService()
