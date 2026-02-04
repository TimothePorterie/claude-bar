// Popup renderer script

interface QuotaInfo {
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

const lastUpdated = document.getElementById('lastUpdated') as HTMLElement

// History elements
const avgFiveHour = document.getElementById('avgFiveHour') as HTMLElement
const avgSevenDay = document.getElementById('avgSevenDay') as HTMLElement
const peakUsage = document.getElementById('peakUsage') as HTMLElement

function getProgressClass(utilization: number): string {
  if (utilization >= 90) return 'critical'
  if (utilization >= 70) return 'warning'
  return ''
}

function updateQuotaDisplay(quota: QuotaInfo): void {
  // Update 5-hour quota
  const fiveHourUtil = Math.round(quota.fiveHour.utilization)
  fiveHourValue.textContent = `${fiveHourUtil}%`
  fiveHourProgress.style.width = `${fiveHourUtil}%`
  fiveHourProgress.className = `progress-fill ${getProgressClass(quota.fiveHour.utilization)}`
  fiveHourReset.textContent = quota.fiveHour.resetsIn

  // Update 7-day quota
  const sevenDayUtil = Math.round(quota.sevenDay.utilization)
  sevenDayValue.textContent = `${sevenDayUtil}%`
  sevenDayProgress.style.width = `${sevenDayUtil}%`
  sevenDayProgress.className = `progress-fill ${getProgressClass(quota.sevenDay.utilization)}`
  sevenDayReset.textContent = quota.sevenDay.resetsIn

  // Update last updated
  const updated = new Date(quota.lastUpdated)
  lastUpdated.textContent = `Last updated: ${updated.toLocaleTimeString()}`
}

function showLoadingState(): void {
  header.style.display = 'flex'
  skeletonContainer.style.display = 'flex'
  quotaCards.style.display = 'none'
  historySection.style.display = 'none'
  footer.style.display = 'none'
  notConnected.style.display = 'none'
}

function showConnectedState(): void {
  header.style.display = 'flex'
  skeletonContainer.style.display = 'none'
  quotaCards.style.display = 'flex'
  historySection.style.display = 'block'
  footer.style.display = 'block'
  notConnected.style.display = 'none'
}

function showNotConnectedState(): void {
  header.style.display = 'none'
  skeletonContainer.style.display = 'none'
  quotaCards.style.display = 'none'
  historySection.style.display = 'none'
  footer.style.display = 'none'
  notConnected.style.display = 'flex'
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

    if (quota) {
      showConnectedState()
      updateQuotaDisplay(quota)
      await loadHistoryStats()
    } else {
      // API call failed but credentials exist
      showConnectedState()
      lastUpdated.textContent = 'Failed to fetch quota'
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
    }
  } catch (error) {
    console.error('Failed to refresh quota:', error)
  } finally {
    refreshBtn.classList.remove('loading')
  }
}

// Event listeners
refreshBtn.addEventListener('click', refreshQuota)

// Listen for quota updates from main process (triggered by tray icon click)
window.claudeBar.onQuotaUpdated(async (quota) => {
  updateQuotaDisplay(quota)
  await loadHistoryStats()
})

// Initial load
loadQuota()
