import { keychainService, Credentials } from './keychain'
import { authService } from './auth'
import { logger } from './logger'
import { settingsStore, PersistedQuotaData } from './settings-store'
import { t } from '../../shared/i18n'
export type { QuotaErrorType, QuotaError, QuotaPeriod, ExtraUsageInfo, QuotaInfo } from '../../shared/types'
import type { QuotaError, QuotaPeriod, QuotaInfo, ExtraUsageInfo } from '../../shared/types'

export interface QuotaData {
  utilization: number
  resets_at: string | null
}

export interface ExtraUsageData {
  is_enabled: boolean
  used_credits: number
  monthly_limit: number
  currency: string
}

export interface UsageResponse {
  five_hour: QuotaData
  seven_day: QuotaData
  seven_day_opus?: QuotaData
  extra_usage?: ExtraUsageData
}

const WARNING_THRESHOLD = 70
const CRITICAL_THRESHOLD = 90
const MIN_FETCH_INTERVAL_MS = 290000 // ~5min between scheduled calls; slack absorbs request latency vs setInterval ticks
const MIN_FORCE_INTERVAL_MS = 15000 // 15s absolute minimum even for manual refresh
const MIN_429_COOLDOWN_SEC = 120 // OAuth /usage returns retry-after: 0 which is misleading — use 2min floor

function isValidQuota(q: unknown): q is QuotaData {
  if (!q || typeof q !== 'object') return false
  const qObj = q as Record<string, unknown>
  return typeof qObj.utilization === 'number' && (typeof qObj.resets_at === 'string' || qObj.resets_at === null)
}

function isValidExtraUsage(e: unknown): e is ExtraUsageData {
  if (!e || typeof e !== 'object') return false
  const eObj = e as Record<string, unknown>
  return typeof eObj.is_enabled === 'boolean' && typeof eObj.used_credits === 'number' &&
    typeof eObj.monthly_limit === 'number' && typeof eObj.currency === 'string'
}

export function isValidUsageResponse(data: unknown): data is UsageResponse {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return isValidQuota(obj.five_hour) && isValidQuota(obj.seven_day)
}

export function formatTimeUntil(date: Date): string {
  const diffMs = date.getTime() - Date.now()
  if (Number.isNaN(diffMs)) return '—'
  if (diffMs <= 0) return t('time.now')

  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`
  if (diffHours > 0) return `${diffHours}h ${diffMinutes % 60}m`
  return `${diffMinutes}m`
}

export function calculateResetProgress(resetsAt: Date, periodHours: number): number {
  const resetTime = resetsAt.getTime()
  if (Number.isNaN(resetTime)) return 0
  const periodMs = periodHours * 60 * 60 * 1000
  const elapsed = Date.now() - (resetTime - periodMs)
  return Math.round(Math.max(0, Math.min(100, (elapsed / periodMs) * 100)))
}

export class QuotaService {
  private static readonly API_URL = 'https://api.anthropic.com/api/oauth/usage'
  private static readonly BETA_HEADER = 'oauth-2025-04-20'

  private cachedQuota: QuotaInfo | null = null
  private lastFetchTime: number = 0
  private lastError: QuotaError | null = null
  private _wasThrottled = false
  private rateLimitedUntil: number
  private rateLimitRemaining: number | null = null
  private pendingFetch: Promise<QuotaInfo | null> | null = null

  constructor() {
    // Restore persisted rate limit, but clear if already expired
    const persisted = settingsStore.get('rateLimitedUntil')
    if (persisted > Date.now()) {
      this.rateLimitedUntil = persisted
      logger.info(`Restored rate limit cooldown: ${Math.ceil((persisted - Date.now()) / 1000)}s remaining`)
    } else {
      this.rateLimitedUntil = 0
      settingsStore.set('rateLimitedUntil', 0)
    }

    // Restore persisted quota data (if < 24h old)
    const lastQuota = settingsStore.get('lastQuotaData') as PersistedQuotaData | null
    if (lastQuota && Date.now() - lastQuota.fetchedAt < 24 * 60 * 60 * 1000) {
      const fiveHourReset = new Date(lastQuota.fiveHour.resetsAt ?? NaN)
      const sevenDayReset = new Date(lastQuota.sevenDay.resetsAt ?? NaN)
      this.cachedQuota = {
        fiveHour: {
          utilization: lastQuota.fiveHour.utilization,
          resetsAt: fiveHourReset,
          resetsIn: formatTimeUntil(fiveHourReset),
          resetProgress: calculateResetProgress(fiveHourReset, 5)
        },
        sevenDay: {
          utilization: lastQuota.sevenDay.utilization,
          resetsAt: sevenDayReset,
          resetsIn: formatTimeUntil(sevenDayReset),
          resetProgress: calculateResetProgress(sevenDayReset, 7 * 24)
        },
        lastUpdated: new Date(lastQuota.fetchedAt)
      }
      if (lastQuota.sevenDayOpus) {
        const opusReset = new Date(lastQuota.sevenDayOpus.resetsAt ?? NaN)
        this.cachedQuota.sevenDayOpus = {
          utilization: lastQuota.sevenDayOpus.utilization,
          resetsAt: opusReset,
          resetsIn: formatTimeUntil(opusReset),
          resetProgress: calculateResetProgress(opusReset, 7 * 24)
        }
      }
      this.lastFetchTime = lastQuota.fetchedAt
      logger.info(`Restored persisted quota: 5h=${Math.round(lastQuota.fiveHour.utilization)}%, 7d=${Math.round(lastQuota.sevenDay.utilization)}% (${Math.round((Date.now() - lastQuota.fetchedAt) / 60000)}min ago)`)
    }
  }

  async fetchQuota(force = false): Promise<QuotaInfo | null> {
    // If a fetch is already in progress, wait for its result (dedup concurrent calls)
    if (this.pendingFetch) {
      this._wasThrottled = false
      return this.pendingFetch
    }

    // Absolute minimum between API calls — prevents spam even on manual refresh
    if (this.cachedQuota && Date.now() - this.lastFetchTime < MIN_FORCE_INTERVAL_MS) {
      this._wasThrottled = true
      return this.getCachedQuota()!
    }

    // Enforce longer minimum for scheduled (non-forced) fetches
    if (!force && this.cachedQuota && Date.now() - this.lastFetchTime < MIN_FETCH_INTERVAL_MS) {
      this._wasThrottled = true
      return this.getCachedQuota()!
    }

    this._wasThrottled = false
    this.pendingFetch = this.doFetch()
    try {
      return await this.pendingFetch
    } finally {
      this.pendingFetch = null
    }
  }

  wasThrottled(): boolean {
    return this._wasThrottled
  }

  getThrottleRemainingMs(): number {
    const forceInterval = Math.max(0, MIN_FORCE_INTERVAL_MS - (Date.now() - this.lastFetchTime))
    const rateLimit = this.getRateLimitRemainingMs()
    return Math.max(forceInterval, rateLimit)
  }

  private async doFetch(): Promise<QuotaInfo | null> {
    if (Date.now() < this.rateLimitedUntil) {
      this._wasThrottled = true
      if (this.cachedQuota) {
        return this.getCachedQuota()!
      }
      // Cooldown restored at startup with nothing cached: surface it instead of an endless skeleton
      this.lastError = { type: 'rate_limit', message: this.formatRateLimitMessage(), retryable: true }
      return null
    }
    return this.doApiFetch()
  }

  /**
   * Resolve credentials based on the configured authMode.
   * - 'app': uses in-app OAuth tokens (authService)
   * - 'cli': reads Claude Code's Keychain tokens (never refreshed here)
   * Sets lastError when returning null.
   */
  private async getCredentials(): Promise<Credentials | null> {
    if (settingsStore.get('authMode') === 'app') {
      const accessToken = await authService.getValidAccessToken()
      if (!accessToken) {
        logger.error('No credentials available from in-app auth')
        this.lastError = { type: 'auth', message: t('error.noCredentials'), retryable: false }
        return null
      }
      const userInfo = authService.getUserInfo()
      return {
        accessToken,
        emailAddress: userInfo?.email,
        displayName: userInfo?.name,
        subscriptionType: userInfo?.subscriptionType
      }
    }

    const credentials = await keychainService.getCredentials()
    if (!credentials) {
      logger.error('No credentials available in Keychain')
      this.lastError = { type: 'auth', message: t('error.noCredentials'), retryable: false }
      return null
    }
    if (keychainService.isTokenExpired(credentials)) {
      logger.warn('CLI token expired — waiting for Claude Code to refresh it')
      this.lastError = { type: 'auth', message: t('error.cliTokenExpired'), retryable: true }
      return null
    }
    return credentials
  }

  /**
   * Get fresh credentials after a 401.
   * - 'app': refresh in-app tokens
   * - 'cli': re-read the Keychain in case Claude Code rotated the token
   */
  private async refreshCredentials(current: Credentials): Promise<Credentials | null> {
    if (settingsStore.get('authMode') === 'app') {
      if (!(await authService.refreshTokens())) return null
      return this.getCredentials()
    }

    const latest = await keychainService.getCredentials()
    if (!latest || latest.accessToken === current.accessToken || keychainService.isTokenExpired(latest)) {
      return null
    }
    return latest
  }

  private async doApiFetch(): Promise<QuotaInfo | null> {
    try {
      const credentials = await this.getCredentials()

      if (!credentials) return null

      const response = await this.fetchOnce(credentials)
      if (!response) {
        if (this.cachedQuota && this.lastError) {
          return { ...this.cachedQuota, error: this.lastError }
        }
        return null
      }

      const rawData = await response.json()
      if (!isValidUsageResponse(rawData)) {
        logger.error('Invalid API response shape:', JSON.stringify(rawData).slice(0, 200))
        this.lastError = { type: 'server', message: 'Unexpected API response format.', retryable: true }
        if (this.cachedQuota) return { ...this.cachedQuota, error: this.lastError }
        return null
      }
      const data = rawData

      const newFiveHourReset = new Date(data.five_hour.resets_at ?? NaN)
      const newSevenDayReset = new Date(data.seven_day.resets_at ?? NaN)

      this.cachedQuota = {
        fiveHour: {
          utilization: data.five_hour.utilization,
          resetsAt: newFiveHourReset,
          resetsIn: formatTimeUntil(newFiveHourReset),
          resetProgress: calculateResetProgress(newFiveHourReset, 5)
        },
        sevenDay: {
          utilization: data.seven_day.utilization,
          resetsAt: newSevenDayReset,
          resetsIn: formatTimeUntil(newSevenDayReset),
          resetProgress: calculateResetProgress(newSevenDayReset, 7 * 24)
        },
        lastUpdated: new Date()
      }

      // Parse optional Opus weekly quota (Max plans)
      if (isValidQuota(data.seven_day_opus)) {
        const opusReset = new Date(data.seven_day_opus.resets_at ?? NaN)
        this.cachedQuota.sevenDayOpus = {
          utilization: data.seven_day_opus.utilization,
          resetsAt: opusReset,
          resetsIn: formatTimeUntil(opusReset),
          resetProgress: calculateResetProgress(opusReset, 7 * 24)
        }
      }

      // Parse optional extra usage / overage info
      if (isValidExtraUsage(data.extra_usage)) {
        this.cachedQuota.extraUsage = {
          isEnabled: data.extra_usage.is_enabled,
          usedCredits: data.extra_usage.used_credits,
          monthlyLimit: data.extra_usage.monthly_limit,
          currency: data.extra_usage.currency
        }
      }

      this.lastFetchTime = Date.now()
      this.lastError = null
      // Only clear rate limit cooldown if we still have budget remaining
      if (this.rateLimitRemaining === null || this.rateLimitRemaining > 0) {
        this.rateLimitedUntil = 0
        settingsStore.set('rateLimitedUntil', 0)
      }

      // Persist quota data for next startup
      const persistedData: PersistedQuotaData = {
        fiveHour: { utilization: data.five_hour.utilization, resetsAt: data.five_hour.resets_at },
        sevenDay: { utilization: data.seven_day.utilization, resetsAt: data.seven_day.resets_at },
        fetchedAt: this.lastFetchTime
      }
      if (isValidQuota(data.seven_day_opus)) {
        persistedData.sevenDayOpus = { utilization: data.seven_day_opus.utilization, resetsAt: data.seven_day_opus.resets_at }
      }
      settingsStore.set('lastQuotaData', persistedData)

      const { sevenDayOpus, extraUsage } = this.cachedQuota
      const opusLog = sevenDayOpus ? `, opus=${Math.round(sevenDayOpus.utilization)}%` : ''
      const overageLog = extraUsage?.isEnabled ? `, overage=${(extraUsage.usedCredits / 100).toFixed(2)} ${extraUsage.currency}` : ''
      logger.info(
        `Quota fetched (API): 5h=${Math.round(data.five_hour.utilization)}%, 7d=${Math.round(data.seven_day.utilization)}%${opusLog}${overageLog}`
      )

      return this.cachedQuota
    } catch (error) {
      logger.error('Failed to fetch quota:', error)
      this.lastError = this.classifyError(error)

      if (this.cachedQuota) {
        return { ...this.cachedQuota, error: this.lastError }
      }
      return null
    }
  }

  /**
   * Single API call with one token-refresh retry on 401.
   * No exponential backoff, no multi-retry loop.
   */
  private async fetchOnce(credentials: Credentials): Promise<Response | null> {
    const doRequest = async (creds: Credentials): Promise<Response> => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      try {
        return await fetch(QuotaService.API_URL, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            'anthropic-beta': QuotaService.BETA_HEADER,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        })
      } finally {
        clearTimeout(timeoutId)
      }
    }

    try {
      let response = await doRequest(credentials)

      if (response.ok) {
        this.applyRateLimitHeaders(response)
        return response
      }

      // On 401, try refreshing token once
      if (response.status === 401) {
        logger.warn('Authentication failed — attempting token refresh')
        const refreshed = await this.refreshCredentials(credentials)
        if (refreshed) {
          response = await doRequest(refreshed)
          if (response.ok) {
            this.applyRateLimitHeaders(response)
            return response
          }
        }
        const cli = settingsStore.get('authMode') === 'cli'
        this.lastError = { type: 'auth', message: t(cli ? 'error.cliTokenExpired' : 'error.sessionExpired'), retryable: cli }
        return null
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after')
        const serverSec = retryAfter ? parseInt(retryAfter, 10) || 0 : 0
        const cooldownSec = Math.max(Math.min(serverSec, 3600), MIN_429_COOLDOWN_SEC)
        this.rateLimitedUntil = Date.now() + cooldownSec * 1000
        settingsStore.set('rateLimitedUntil', this.rateLimitedUntil)
        this.applyRateLimitHeaders(response)
        logger.warn(`Rate limited (429), cooldown ${cooldownSec}s (retry-after=${serverSec}s)`)
        this.lastError = { type: 'rate_limit', message: this.formatRateLimitMessage(), retryable: true }

        return null
      }

      // All other errors — no retry
      const errorText = await response.text()
      logger.error(`API error: ${response.status} - ${errorText.slice(0, 200)}`)
      this.lastError = this.classifyError(new Error(`HTTP ${response.status}: ${errorText}`))
      return null
    } catch (error) {
      logger.error('Network error:', error)
      this.lastError = this.classifyError(error)
      return null
    }
  }

  /**
   * Parse rate limit headers and proactively throttle when budget is exhausted.
   * Note: the OAuth /usage endpoint may not return these headers.
   */
  private applyRateLimitHeaders(response: Response): void {
    const remainingStr = response.headers.get('anthropic-ratelimit-requests-remaining')
    const resetStr = response.headers.get('anthropic-ratelimit-requests-reset')

    if (remainingStr != null) {
      this.rateLimitRemaining = parseInt(remainingStr, 10)
      logger.info(`Rate limit budget: remaining=${remainingStr}, reset=${resetStr ?? '?'}`)
    }

    // Proactive throttle: if no requests remain, pause until the reset time
    if (this.rateLimitRemaining != null && this.rateLimitRemaining <= 0 && resetStr) {
      const resetTime = new Date(resetStr).getTime()
      if (!isNaN(resetTime) && resetTime > Date.now()) {
        // Add a small buffer (5s) to avoid racing with the server clock
        const proactiveCooldownUntil = resetTime + 5000
        if (proactiveCooldownUntil > this.rateLimitedUntil) {
          this.rateLimitedUntil = proactiveCooldownUntil
          settingsStore.set('rateLimitedUntil', this.rateLimitedUntil)
          const cooldownSec = Math.ceil((proactiveCooldownUntil - Date.now()) / 1000)
          logger.warn(`Proactive throttle: 0 requests remaining, pausing API calls for ${cooldownSec}s until reset`)
        }
      }
    }
  }

  getRateLimitRemaining(): number | null {
    return this.rateLimitRemaining
  }

  private classifyError(error: unknown): QuotaError {
    // Check error type/name first, then fall back to message matching
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return { type: 'network', message: t('error.network'), retryable: true }
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return { type: 'network', message: t('error.timeout'), retryable: true }
    }

    // Node.js system errors (ENOTFOUND, ECONNREFUSED, ECONNRESET, etc.)
    if (error instanceof Error && 'code' in error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT') {
        return { type: 'network', message: t('error.network'), retryable: true }
      }
    }

    // HTTP status-based classification (from fetchOnce error wrapping)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const httpMatch = errorMessage.match(/^HTTP (\d{3}):/)
    if (httpMatch) {
      const status = parseInt(httpMatch[1], 10)
      if (status === 401 || status === 403) {
        return { type: 'auth', message: t('error.sessionExpiredSettings'), retryable: false }
      }
      if (status === 429) {
        return { type: 'rate_limit', message: t('error.rateLimited'), retryable: true }
      }
      if (status >= 500) {
        return { type: 'server', message: t('error.server'), retryable: true }
      }
    }

    return { type: 'unknown', message: t('error.unexpected'), retryable: true }
  }

  getLastError(): QuotaError | null {
    // Return dynamic message for rate limit errors
    if (this.lastError?.type === 'rate_limit' && this.rateLimitedUntil > 0) {
      return { ...this.lastError, message: this.formatRateLimitMessage() }
    }
    return this.lastError
  }

  getRateLimitRemainingMs(): number {
    return Math.max(0, this.rateLimitedUntil - Date.now())
  }

  private formatRateLimitMessage(): string {
    const remainingMs = this.getRateLimitRemainingMs()
    if (remainingMs <= 0) return t('error.rateLimitRetrying')
    const remainingSec = Math.ceil(remainingMs / 1000)
    if (remainingSec >= 60) {
      return t('error.rateLimitRetryMin', { min: Math.ceil(remainingSec / 60) })
    }
    return t('error.rateLimitRetrySec', { sec: remainingSec })
  }

  // Forget quota data from the previous account/auth source
  clear(): void {
    this.cachedQuota = null
    this.lastFetchTime = 0
    this.lastError = null
    settingsStore.set('lastQuotaData', null)
  }

  getCachedQuota(): QuotaInfo | null {
    if (!this.cachedQuota) return null
    // Recalculate time-dependent fields on every read
    const result: QuotaInfo = {
      ...this.cachedQuota,
      error: this.getLastError() ?? undefined,
      fiveHour: {
        ...this.cachedQuota.fiveHour,
        resetsIn: formatTimeUntil(this.cachedQuota.fiveHour.resetsAt),
        resetProgress: calculateResetProgress(this.cachedQuota.fiveHour.resetsAt, 5)
      },
      sevenDay: {
        ...this.cachedQuota.sevenDay,
        resetsIn: formatTimeUntil(this.cachedQuota.sevenDay.resetsAt),
        resetProgress: calculateResetProgress(this.cachedQuota.sevenDay.resetsAt, 7 * 24)
      }
    }
    if (this.cachedQuota.sevenDayOpus) {
      result.sevenDayOpus = {
        ...this.cachedQuota.sevenDayOpus,
        resetsIn: formatTimeUntil(this.cachedQuota.sevenDayOpus.resetsAt),
        resetProgress: calculateResetProgress(this.cachedQuota.sevenDayOpus.resetsAt, 7 * 24)
      }
    }
    return result
  }

  getQuotaLevel(): 'normal' | 'warning' | 'critical' {
    if (!this.cachedQuota) {
      return 'normal'
    }

    let maxUtilization = Math.max(
      this.cachedQuota.fiveHour.utilization,
      this.cachedQuota.sevenDay.utilization
    )
    if (this.cachedQuota.sevenDayOpus) {
      maxUtilization = Math.max(maxUtilization, this.cachedQuota.sevenDayOpus.utilization)
    }

    if (maxUtilization >= CRITICAL_THRESHOLD) return 'critical'
    if (maxUtilization >= WARNING_THRESHOLD) return 'warning'
    return 'normal'
  }
}

export const quotaService = new QuotaService()
