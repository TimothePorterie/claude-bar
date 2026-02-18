// Popup renderer script

type QuotaErrorType = 'network' | 'auth' | 'rate_limit' | 'server' | 'unknown'

interface QuotaError {
  type: QuotaErrorType
  message: string
  retryable: boolean
}

interface QuotaInfo {
  fiveHour: {
    utilization: number
    resetsAt: Date
    resetsIn: string
    resetProgress: number
  }
  sevenDay: {
    utilization: number
    resetsAt: Date
    resetsIn: string
    resetProgress: number
  }
  lastUpdated: Date
  error?: QuotaError
}

type TrendDirection = 'up' | 'down' | 'stable'

interface TrendData {
  fiveHour: {
    direction: TrendDirection
    delta: number
  }
  sevenDay: {
    direction: TrendDirection
    delta: number
  }
}

interface TimeToThreshold {
  fiveHour: number | null
  sevenDay: number | null
}

// DOM elements
const header = document.getElementById('header') as HTMLElement
const notConnected = document.getElementById('notConnected') as HTMLElement
const quotaCards = document.getElementById('quotaCards') as HTMLElement
const footer = document.getElementById('footer') as HTMLElement
const skeletonContainer = document.getElementById('skeletonContainer') as HTMLElement
const historySection = document.getElementById('historySection') as HTMLElement
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

const fiveHourTrend = document.getElementById('fiveHourTrend') as HTMLElement
const sevenDayTrend = document.getElementById('sevenDayTrend') as HTMLElement

const lastUpdated = document.getElementById('lastUpdated') as HTMLElement

// History elements
const avgFiveHour = document.getElementById('avgFiveHour') as HTMLElement
const avgSevenDay = document.getElementById('avgSevenDay') as HTMLElement
const peakUsage = document.getElementById('peakUsage') as HTMLElement

// Time to critical elements
const timeToCritical = document.getElementById('timeToCritical') as HTMLElement
const ttcText = document.getElementById('ttcText') as HTMLElement

// Toast element
const toast = document.getElementById('toast') as HTMLElement

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

function getTrendSymbol(direction: TrendDirection): string {
  switch (direction) {
    case 'up':
      return '↑'
    case 'down':
      return '↓'
    case 'stable':
      return '→'
  }
}

function updateTrendIndicator(element: HTMLElement, direction: TrendDirection): void {
  element.textContent = getTrendSymbol(direction)
  element.className = `trend-indicator ${direction}`
}

async function loadTrendData(): Promise<void> {
  try {
    const trend = await window.claudeBar.getTrend(30)
    if (trend) {
      updateTrendIndicator(fiveHourTrend, trend.fiveHour.direction)
      updateTrendIndicator(sevenDayTrend, trend.sevenDay.direction)
    } else {
      fiveHourTrend.textContent = ''
      sevenDayTrend.textContent = ''
    }
  } catch (error) {
    console.error('Failed to load trend data:', error)
  }
}

function formatHoursToTime(hours: number): string {
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

async function loadTimeToCritical(): Promise<void> {
  try {
    // Check if feature is enabled in settings
    const settings = await window.claudeBar.getSettings()
    if (!settings.showTimeToCritical) {
      timeToCritical.style.display = 'none'
      reportContentHeight()
      return
    }

    const ttc = await window.claudeBar.getTimeToCritical()

    if (!ttc) {
      timeToCritical.style.display = 'none'
      reportContentHeight()
      return
    }

    // Show the smaller of the two estimates (if any)
    const estimates = [ttc.fiveHour, ttc.sevenDay].filter((v): v is number => v !== null)

    if (estimates.length === 0) {
      timeToCritical.style.display = 'none'
      reportContentHeight()
      return
    }

    const minTime = Math.min(...estimates)
    ttcText.textContent = `Est. critical in ~${formatHoursToTime(minTime)}`
    timeToCritical.style.display = 'flex'
    reportContentHeight()
  } catch (error) {
    console.error('Failed to load time to critical:', error)
    timeToCritical.style.display = 'none'
    reportContentHeight()
  }
}

function showSuccessFeedback(): void {
  // Add success animation to refresh button
  refreshBtn.classList.add('success')
  setTimeout(() => {
    refreshBtn.classList.remove('success')
  }, 600)

  // Show toast notification
  toast.classList.add('show')
  setTimeout(() => {
    toast.classList.remove('show')
  }, 2000)

  // Hide error section if visible
  hideError()
}

function showError(error: QuotaError): void {
  errorMessage.textContent = error.message
  errorSection.style.display = 'flex'

  // Use warning style for retryable errors
  if (error.retryable) {
    errorSection.classList.add('warning')
    errorSection.classList.remove('error')
  } else {
    errorSection.classList.remove('warning')
  }

  // Hide retry button for non-retryable errors
  errorRetryBtn.style.display = error.retryable ? 'block' : 'none'
  reportContentHeight()
}

function hideError(): void {
  errorSection.style.display = 'none'
  errorSection.classList.remove('standalone')
  reportContentHeight()
}

function updateQuotaDisplay(quota: QuotaInfo): void {
  // Update 5-hour quota
  const fiveHourUtil = Math.round(quota.fiveHour.utilization)
  fiveHourValue.textContent = `${fiveHourUtil}%`
  fiveHourProgress.style.width = `${fiveHourUtil}%`
  fiveHourProgress.className = `progress-fill ${getProgressClass(quota.fiveHour.utilization)}`
  fiveHourReset.textContent = quota.fiveHour.resetsIn
  fiveHourResetProgress.style.width = `${quota.fiveHour.resetProgress}%`

  // Update 7-day quota
  const sevenDayUtil = Math.round(quota.sevenDay.utilization)
  sevenDayValue.textContent = `${sevenDayUtil}%`
  sevenDayProgress.style.width = `${sevenDayUtil}%`
  sevenDayProgress.className = `progress-fill ${getProgressClass(quota.sevenDay.utilization)}`
  sevenDayReset.textContent = quota.sevenDay.resetsIn
  sevenDayResetProgress.style.width = `${quota.sevenDay.resetProgress}%`

  // Update last updated
  const updated = new Date(quota.lastUpdated)
  lastUpdated.textContent = `Last updated: ${updated.toLocaleTimeString()}`

  // Handle error state
  if (quota.error) {
    showError(quota.error)
  } else {
    hideError()
  }
}

function showLoadingState(): void {
  header.style.display = 'flex'
  skeletonContainer.style.display = 'flex'
  quotaCards.style.display = 'none'
  historySection.style.display = 'none'
  footer.style.display = 'none'
  notConnected.style.display = 'none'
  reportContentHeight()
}

function showConnectedState(): void {
  header.style.display = 'flex'
  skeletonContainer.style.display = 'none'
  quotaCards.style.display = 'flex'
  historySection.style.display = 'block'
  footer.style.display = 'block'
  notConnected.style.display = 'none'
  reportContentHeight()
}

function showNotConnectedState(): void {
  header.style.display = 'none'
  skeletonContainer.style.display = 'none'
  quotaCards.style.display = 'none'
  historySection.style.display = 'none'
  footer.style.display = 'none'
  notConnected.style.display = 'flex'
  errorSection.style.display = 'none'
  reportContentHeight()
}

function showFetchErrorState(error: QuotaError): void {
  // Show header (user may be "logged in" but token is bad), hide content sections
  header.style.display = 'flex'
  skeletonContainer.style.display = 'none'
  quotaCards.style.display = 'none'
  historySection.style.display = 'none'
  footer.style.display = 'none'
  notConnected.style.display = 'none'

  // Configure error section in standalone mode
  errorSection.classList.add('standalone')
  errorSection.style.display = 'flex'

  errorMessage.textContent = error.message

  // Contextual guidance and actions based on error type
  switch (error.type) {
    case 'auth':
      errorGuidance.textContent = 'Your session has expired or credentials are invalid.'
      errorRetryBtn.style.display = 'none'
      errorLoginBtn.style.display = 'inline-block'
      break
    case 'network':
      errorGuidance.textContent = 'Check your internet connection and try again.'
      errorRetryBtn.style.display = 'inline-block'
      errorLoginBtn.style.display = 'none'
      break
    case 'rate_limit':
      errorGuidance.textContent = 'Too many requests. Will retry automatically.'
      errorRetryBtn.style.display = 'inline-block'
      errorLoginBtn.style.display = 'none'
      break
    case 'server':
      errorGuidance.textContent = 'Anthropic servers are having issues.'
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
      userName.textContent = userInfo.name || userInfo.email || 'Claude User'
      subscriptionBadge.textContent = formatSubscriptionType(userInfo.subscriptionType)
    }
  } catch (error) {
    console.error('Failed to load user info:', error)
  }
}

async function loadHistoryStats(): Promise<void> {
  try {
    const stats = await window.claudeBar.getHistoryStats(24)

    if (stats) {
      avgFiveHour.textContent = `${stats.avgFiveHour}%`
      avgSevenDay.textContent = `${stats.avgSevenDay}%`
      peakUsage.textContent = `${Math.max(stats.maxFiveHour, stats.maxSevenDay)}%`
    }

    // Also load trend data and time to critical
    await Promise.all([loadTrendData(), loadTimeToCritical()])
  } catch (error) {
    console.error('Failed to load history stats:', error)
  }
}

async function loadQuota(): Promise<void> {
  try {
    showLoadingState()

    const hasCredentials = await window.claudeBar.hasCredentials()

    if (!hasCredentials) {
      showNotConnectedState()
      return
    }

    await loadUserInfo()

    const quota = await window.claudeBar.getQuota()

    if (quota && !quota.error) {
      showConnectedState()
      updateQuotaDisplay(quota)
      await loadHistoryStats()
    } else if (quota && quota.error) {
      // Got cached data with an error — show data but also the error banner
      showConnectedState()
      updateQuotaDisplay(quota)
      await loadHistoryStats()
    } else {
      // No data at all — show standalone error
      const lastError = await window.claudeBar.getLastError()
      if (lastError) {
        showFetchErrorState(lastError)
      } else {
        showFetchErrorState({ type: 'unknown', message: 'Failed to fetch quota.', retryable: true })
      }
    }
  } catch (error) {
    console.error('Failed to load quota:', error)
    lastUpdated.textContent = 'Error loading quota'
  }
}

async function refreshQuota(): Promise<void> {
  refreshBtn.classList.add('loading')

  try {
    const quota = await window.claudeBar.refreshQuota()
    if (quota) {
      updateQuotaDisplay(quota)
      await loadHistoryStats()
      showSuccessFeedback()
    }
  } catch (error) {
    console.error('Failed to refresh quota:', error)
  } finally {
    refreshBtn.classList.remove('loading')
  }
}

// Event listeners
refreshBtn.addEventListener('click', refreshQuota)
errorRetryBtn.addEventListener('click', refreshQuota)

// Login button in popup — opens Settings window
const popupLoginBtn = document.getElementById('popupLoginBtn') as HTMLButtonElement | null
if (popupLoginBtn) {
  popupLoginBtn.addEventListener('click', () => {
    window.claudeBar.openSettings()
  })
}

// Login button in error section — opens Settings window
errorLoginBtn.addEventListener('click', () => {
  window.claudeBar.openSettings()
})

// Listen for quota updates from main process (triggered by tray icon click)
window.claudeBar.onQuotaUpdated(async (quota) => {
  updateQuotaDisplay(quota)
  await loadHistoryStats()
})

// Listen for quota errors from main process
window.claudeBar.onQuotaError((error) => {
  showFetchErrorState(error)
})

// Listen for auth state changes to auto-refresh
window.claudeBar.onAuthStateChanged(async (state) => {
  if (state === 'authenticated') {
    await loadQuota()
  } else if (state === 'unauthenticated') {
    showNotConnectedState()
  }
})

// Report content height to resize window
function reportContentHeight(): void {
  // Wait for next frame to ensure DOM is updated
  requestAnimationFrame(() => {
    const container = document.querySelector('.popup-container') as HTMLElement
    if (container) {
      // Add small padding to ensure content fits
      const height = container.scrollHeight + 4
      window.claudeBar.reportContentHeight(height)
    }
  })
}

// Export history to CSV
const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement | null
if (exportBtn) {
  exportBtn.addEventListener('click', async () => {
    try {
      const csv = await window.claudeBar.exportHistoryCSV(24) // Export last 24h
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `claude-bar-history-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('History exported')
    } catch (error) {
      console.error('Failed to export history:', error)
      showToast('Export failed')
    }
  })
}

// Initial load
loadQuota()
