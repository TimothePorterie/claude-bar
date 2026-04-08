// Popup renderer script
import type { Locale } from '../../shared/i18n'
import { t, setLocale, applyI18n } from '../../shared/i18n'
import type { QuotaError, QuotaInfo } from '../../shared/types'

// DOM elements
const header = document.getElementById('header') as HTMLElement
const notConnected = document.getElementById('notConnected') as HTMLElement
const quotaCards = document.getElementById('quotaCards') as HTMLElement
const footer = document.getElementById('footer') as HTMLElement
const skeletonContainer = document.getElementById('skeletonContainer') as HTMLElement
const userName = document.getElementById('userName') as HTMLElement
const subscriptionBadge = document.getElementById('subscriptionBadge') as HTMLElement
const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement

const fiveHourValue = document.getElementById('fiveHourValue') as HTMLElement
const fiveHourProgress = document.getElementById('fiveHourProgress') as HTMLElement
const fiveHourReset = document.getElementById('fiveHourReset') as HTMLElement

const sevenDayValue = document.getElementById('sevenDayValue') as HTMLElement
const sevenDayProgress = document.getElementById('sevenDayProgress') as HTMLElement
const sevenDayReset = document.getElementById('sevenDayReset') as HTMLElement

const fiveHourResetProgress = document.getElementById('fiveHourResetProgress') as HTMLElement
const sevenDayResetProgress = document.getElementById('sevenDayResetProgress') as HTMLElement

const opusCard = document.getElementById('opusCard') as HTMLElement
const opusValue = document.getElementById('opusValue') as HTMLElement
const opusProgress = document.getElementById('opusProgress') as HTMLElement
const opusReset = document.getElementById('opusReset') as HTMLElement
const opusResetProgress = document.getElementById('opusResetProgress') as HTMLElement

const extraUsageEl = document.getElementById('extraUsage') as HTMLElement
const extraUsageValue = document.getElementById('extraUsageValue') as HTMLElement

const lastUpdated = document.getElementById('lastUpdated') as HTMLElement

// Error elements
const errorSection = document.getElementById('errorSection') as HTMLElement
const errorMessage = document.getElementById('errorMessage') as HTMLElement
const errorGuidance = document.getElementById('errorGuidance') as HTMLElement
const errorRetryBtn = document.getElementById('errorRetryBtn') as HTMLButtonElement
const errorLoginBtn = document.getElementById('errorLoginBtn') as HTMLButtonElement

function getProgressClass(utilization: number): string {
  if (utilization >= 90) return 'critical'
  if (utilization >= 70) return 'warning'
  return ''
}

function showError(error: QuotaError): void {
  errorMessage.textContent = error.message
  errorSection.style.display = 'flex'

  if (error.retryable) {
    errorSection.classList.add('warning')
    errorSection.classList.remove('error')
  } else {
    errorSection.classList.remove('warning')
  }

  errorRetryBtn.style.display = error.retryable ? 'block' : 'none'
  reportContentHeight()
}

function hideError(): void {
  errorSection.style.display = 'none'
  errorSection.classList.remove('standalone')
  reportContentHeight()
}

function formatCredits(cents: number, currency: string): string {
  const amount = cents / 100
  if (currency.toUpperCase() === 'USD') return `$${amount.toFixed(2)}`
  return `${amount.toFixed(2)} ${currency.toUpperCase()}`
}

function updateQuotaDisplay(quota: QuotaInfo): void {
  const fiveHourUtil = Math.round(quota.fiveHour.utilization)
  fiveHourValue.textContent = `${fiveHourUtil}%`
  fiveHourProgress.style.width = `${fiveHourUtil}%`
  fiveHourProgress.className = `progress-fill ${getProgressClass(quota.fiveHour.utilization)}`
  fiveHourReset.textContent = quota.fiveHour.resetsIn
  fiveHourResetProgress.style.width = `${quota.fiveHour.resetProgress}%`

  const sevenDayUtil = Math.round(quota.sevenDay.utilization)
  sevenDayValue.textContent = `${sevenDayUtil}%`
  sevenDayProgress.style.width = `${sevenDayUtil}%`
  sevenDayProgress.className = `progress-fill ${getProgressClass(quota.sevenDay.utilization)}`
  sevenDayReset.textContent = quota.sevenDay.resetsIn
  sevenDayResetProgress.style.width = `${quota.sevenDay.resetProgress}%`

  // Opus weekly quota (Max plans)
  if (quota.sevenDayOpus) {
    const opusUtil = Math.round(quota.sevenDayOpus.utilization)
    opusValue.textContent = `${opusUtil}%`
    opusProgress.style.width = `${opusUtil}%`
    opusProgress.className = `progress-fill ${getProgressClass(quota.sevenDayOpus.utilization)}`
    opusReset.textContent = quota.sevenDayOpus.resetsIn
    opusResetProgress.style.width = `${quota.sevenDayOpus.resetProgress}%`
    opusCard.style.display = 'block'
  } else {
    opusCard.style.display = 'none'
  }

  // Extra usage / overage
  if (quota.extraUsage?.isEnabled) {
    const used = formatCredits(quota.extraUsage.usedCredits, quota.extraUsage.currency)
    if (quota.extraUsage.monthlyLimit > 0) {
      const limit = formatCredits(quota.extraUsage.monthlyLimit, quota.extraUsage.currency)
      extraUsageValue.textContent = `${used} / ${limit}`
    } else {
      extraUsageValue.textContent = `${used} (no limit)`
    }
    extraUsageEl.style.display = 'flex'
  } else {
    extraUsageEl.style.display = 'none'
  }

  const updated = new Date(quota.lastUpdated)
  lastUpdated.textContent = t('popup.lastUpdated', { time: updated.toLocaleTimeString() })

  // Show error banner for real errors, not for rate limits (cached data is still valid)
  if (quota.error && quota.error.type !== 'rate_limit') {
    showError(quota.error)
  } else {
    hideError()
  }
}

function showLoadingState(): void {
  header.style.display = 'flex'
  skeletonContainer.style.display = 'flex'
  quotaCards.style.display = 'none'
  footer.style.display = 'none'
  notConnected.style.display = 'none'
  reportContentHeight()
}

function showConnectedState(): void {
  header.style.display = 'flex'
  skeletonContainer.style.display = 'none'
  quotaCards.style.display = 'flex'
  footer.style.display = 'block'
  notConnected.style.display = 'none'
  reportContentHeight()
}

function showNotConnectedState(): void {
  header.style.display = 'none'
  skeletonContainer.style.display = 'none'
  quotaCards.style.display = 'none'
  footer.style.display = 'none'
  notConnected.style.display = 'flex'
  errorSection.style.display = 'none'
  reportContentHeight()
}

function showFetchErrorState(error: QuotaError): void {
  header.style.display = 'flex'
  skeletonContainer.style.display = 'none'
  quotaCards.style.display = 'none'
  footer.style.display = 'none'
  notConnected.style.display = 'none'

  errorSection.classList.add('standalone')
  errorSection.style.display = 'flex'

  errorMessage.textContent = error.message

  switch (error.type) {
    case 'auth':
      errorGuidance.textContent = t('error.authGuidance')
      errorRetryBtn.style.display = 'none'
      errorLoginBtn.style.display = 'inline-block'
      break
    case 'network':
      errorGuidance.textContent = t('error.networkGuidance')
      errorRetryBtn.style.display = 'inline-block'
      errorLoginBtn.style.display = 'none'
      break
    case 'rate_limit':
      errorGuidance.textContent = t('error.rateLimitGuidance')
      errorRetryBtn.style.display = 'inline-block'
      errorLoginBtn.style.display = 'none'
      break
    case 'server':
      errorGuidance.textContent = t('error.serverGuidance')
      errorRetryBtn.style.display = 'inline-block'
      errorLoginBtn.style.display = 'none'
      break
    default:
      errorGuidance.textContent = ''
      errorRetryBtn.style.display = 'inline-block'
      errorLoginBtn.style.display = 'none'
  }

  reportContentHeight()
}

function formatSubscriptionType(type?: string): string {
  if (!type) return 'Pro'

  switch (type.toLowerCase()) {
    case 'max':
    case 'claude_max':
      return 'Max'
    case 'pro':
    case 'claude_pro':
    default:
      return 'Pro'
  }
}

async function loadUserInfo(): Promise<void> {
  try {
    const userInfo = await window.claudeBar.getUserInfo()
    if (userInfo) {
      userName.textContent = userInfo.name || userInfo.email || t('popup.defaultUser')
      subscriptionBadge.textContent = formatSubscriptionType(userInfo.subscriptionType)
    }
  } catch (error) {
    console.error('Failed to load user info:', error)
  }
}

async function loadQuota(): Promise<void> {
  try {
    // Check cache first — show data immediately if available (avoids skeleton flash)
    const cachedQuota = await window.claudeBar.getQuota()
    if (cachedQuota) {
      await loadUserInfo()
      showConnectedState()
      updateQuotaDisplay(cachedQuota)
      return
    }

    showLoadingState()

    const hasCredentials = await window.claudeBar.hasCredentials()

    if (!hasCredentials) {
      showNotConnectedState()
      return
    }

    await loadUserInfo()

    const lastError = await window.claudeBar.getLastError()
    if (lastError) {
      showFetchErrorState(lastError)
    } else {
      showLoadingState()
    }
  } catch (error) {
    console.error('Failed to load quota:', error)
    lastUpdated.textContent = t('error.loading')
  }
}

const toast = document.getElementById('toast') as HTMLElement
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(message: string, variant: 'info' | 'success' = 'success'): void {
  if (toastTimer) clearTimeout(toastTimer)
  toast.textContent = message
  toast.className = `toast ${variant} show`
  reportContentHeight()
  toastTimer = setTimeout(() => {
    toast.classList.remove('show')
    reportContentHeight()
  }, 2000)
}

async function refreshQuota(): Promise<void> {
  refreshBtn.classList.add('loading')
  refreshBtn.disabled = true

  try {
    // First, show refreshed cached data (with recalculated times)
    const cached = await window.claudeBar.getQuota()
    if (cached) {
      showConnectedState()
      updateQuotaDisplay(cached)
    }

    // Then attempt an API refresh (may return cache if min interval not elapsed)
    const result = await window.claudeBar.refreshQuota()
    if (result.throttled) {
      showToast(t('popup.throttled', { seconds: result.retryIn }), 'info')
    } else if (result.quota) {
      showConnectedState()
      updateQuotaDisplay(result.quota)
      hideError()
    }
  } catch (error) {
    console.error('Failed to refresh quota:', error)
  } finally {
    // Brief spin then stop — gives visible feedback even on instant cache return
    setTimeout(() => {
      refreshBtn.classList.remove('loading')
      refreshBtn.disabled = false
    }, 400)
  }
}

// Event listeners
refreshBtn.addEventListener('click', refreshQuota)
errorRetryBtn.addEventListener('click', refreshQuota)

const popupLoginBtn = document.getElementById('popupLoginBtn') as HTMLButtonElement | null
if (popupLoginBtn) {
  popupLoginBtn.addEventListener('click', () => {
    window.claudeBar.openSettings()
  })
}

errorLoginBtn.addEventListener('click', () => {
  window.claudeBar.openSettings()
})

// Listen for quota updates from main process
window.claudeBar.onQuotaUpdated(async (quota) => {
  showConnectedState()
  updateQuotaDisplay(quota)
})

// Listen for quota errors from main process
window.claudeBar.onQuotaError((error) => {
  showFetchErrorState(error)
})

// Listen for auth state changes
let initialLoadDone = false
window.claudeBar.onAuthStateChanged(async (state) => {
  if (state === 'authenticated') {
    if (initialLoadDone) {
      await loadQuota()
    }
  } else if (state === 'unauthenticated') {
    showNotConnectedState()
  }
})

// Report content height to resize window
function reportContentHeight(): void {
  requestAnimationFrame(() => {
    const container = document.querySelector('.popup-container') as HTMLElement
    if (container) {
      const height = container.scrollHeight + 4
      window.claudeBar.reportContentHeight(height)
    }
  })
}

// Initialize locale then load
async function init(): Promise<void> {
  const settings = await window.claudeBar.getSettings()
  setLocale(settings.language as Locale)
  applyI18n()
  await loadQuota()
  initialLoadDone = true
}

init()
