import { quotaService } from './quota-api'

type RefreshCallback = () => void

export class SchedulerService {
  private intervalId: NodeJS.Timeout | null = null
  private refreshIntervalMs: number = 60000 // Default 1 minute
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
