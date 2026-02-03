import { keychainService, Credentials } from './keychain'

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

export class QuotaService {
  private static readonly API_URL = 'https://api.anthropic.com/api/oauth/usage'
  private static readonly BETA_HEADER = 'oauth-2025-04-20'

  private cachedQuota: QuotaInfo | null = null
  private lastFetchTime: number = 0
  private minFetchInterval = 30000 // 30 seconds minimum between fetches

  async fetchQuota(forceRefresh = false): Promise<QuotaInfo | null> {
    // Check cache
    if (!forceRefresh && this.cachedQuota && Date.now() - this.lastFetchTime < this.minFetchInterval) {
      return this.cachedQuota
    }

    const credentials = await keychainService.getCredentials()
    if (!credentials || !credentials.accessToken) {
      console.error('No credentials available')
      return null
    }

    try {
      const response = await fetch(QuotaService.API_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'anthropic-beta': QuotaService.BETA_HEADER,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`API error: ${response.status} - ${errorText}`)

        if (response.status === 401) {
          // Token might be expired
          console.error('Authentication failed - token may be expired')
        }

        return null
      }

      const data = (await response.json()) as UsageResponse

      this.cachedQuota = {
        fiveHour: {
          utilization: data.five_hour.utilization,
          resetsAt: new Date(data.five_hour.resets_at),
          resetsIn: this.formatTimeUntil(new Date(data.five_hour.resets_at))
        },
        sevenDay: {
          utilization: data.seven_day.utilization,
          resetsAt: new Date(data.seven_day.resets_at),
          resetsIn: this.formatTimeUntil(new Date(data.seven_day.resets_at))
        },
        lastUpdated: new Date()
      }

      this.lastFetchTime = Date.now()
      return this.cachedQuota
    } catch (error) {
      console.error('Failed to fetch quota:', error)
      return null
    }
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

  getFormattedTitle(): string {
    if (!this.cachedQuota) {
      return '-- / --'
    }

    const fiveHour = Math.round(this.cachedQuota.fiveHour.utilization)
    const sevenDay = Math.round(this.cachedQuota.sevenDay.utilization)

    return `${fiveHour}% / ${sevenDay}%`
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
}

export const quotaService = new QuotaService()
