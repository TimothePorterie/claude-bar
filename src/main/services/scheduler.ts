import { quotaService } from './quota-api'
import { logger } from './logger'

type RefreshCallback = () => void

export class SchedulerService {
  private intervalId: NodeJS.Timeout | null = null
  private rateLimitRetryId: NodeJS.Timeout | null = null
  private refreshIntervalMs: number = 300000
  private callbacks: Set<RefreshCallback> = new Set()

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

      // Check if we got rate limited (429) or proactively throttled (0 remaining)
      const cooldownMs = quotaService.getRateLimitRemainingMs()
      if (cooldownMs > 0) {
        // Stop the regular interval to avoid noise during cooldown
        this.stopInterval()

        // Trust the server's retry-after value + small 2s buffer
        const retryInMs = cooldownMs + 2000

        if (!this.rateLimitRetryId) {
          const lastError = quotaService.getLastError()
          const reason = lastError?.type === 'rate_limit' ? 'Rate limited (retry-after)' : 'Proactive throttle'
          logger.info(`${reason} — retry in ${Math.ceil(retryInMs / 1000)}s`)
          this.rateLimitRetryId = setTimeout(() => {
            this.rateLimitRetryId = null
            this.refresh()
          }, retryInMs)
        }
      } else {
        // Success — restart interval if needed
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
