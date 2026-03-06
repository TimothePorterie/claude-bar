import { quotaService } from './quota-api'
import { logger } from './logger'

type RefreshCallback = () => void

export class SchedulerService {
  private intervalId: NodeJS.Timeout | null = null
  private rateLimitRetryId: NodeJS.Timeout | null = null
  private refreshIntervalMs: number = 300000
  private callbacks: Set<RefreshCallback> = new Set()
  private consecutive429s: number = 0

  setRefreshInterval(seconds: number): void {
    this.refreshIntervalMs = seconds * 1000
    if (this.intervalId) {
      this.stop()
      this.start()
    }
  }

  getRefreshInterval(): number {
    return this.refreshIntervalMs / 1000
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
    if (this.rateLimitRetryId) {
      clearTimeout(this.rateLimitRetryId)
      this.rateLimitRetryId = null
    }
  }

  async refresh(): Promise<void> {
    try {
      const quota = await quotaService.fetchQuota()

      // Check if we got rate limited
      const cooldownMs = quotaService.getRateLimitRemainingMs()
      if (cooldownMs > 0) {
        this.consecutive429s++
        // Stop the regular interval to avoid noise during cooldown
        this.stopInterval()

        // Exponential backoff: add extra margin on repeated 429s
        // 1st: retry-after + 5s, 2nd: retry-after + 15s, 3rd: retry-after + 45s, etc.
        const backoffMarginMs = Math.min(5000 * Math.pow(3, this.consecutive429s - 1), 300000)
        const retryInMs = cooldownMs + backoffMarginMs

        if (!this.rateLimitRetryId) {
          logger.info(`Rate limited (${this.consecutive429s}x) — retry in ${Math.ceil(retryInMs / 1000)}s (cooldown ${Math.ceil(cooldownMs / 1000)}s + backoff ${Math.ceil(backoffMarginMs / 1000)}s)`)
          this.rateLimitRetryId = setTimeout(() => {
            this.rateLimitRetryId = null
            this.refresh()
          }, retryInMs)
        }
      } else {
        // Success — reset backoff and restart interval if needed
        this.consecutive429s = 0
        this.restartInterval()
      }

      this.notifyCallbacks()
    } catch (error) {
      console.error('Scheduled refresh failed:', error)
      this.notifyCallbacks()
    }
  }

  private stopInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private restartInterval(): void {
    if (this.intervalId) return // Already running
    this.intervalId = setInterval(() => {
      this.refresh()
    }, this.refreshIntervalMs)
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
