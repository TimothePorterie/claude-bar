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
const quotaCards = document.querySelector('.quota-cards') as HTMLElement
const footer = document.querySelector('.footer') as HTMLElement
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

function showConnectedState(): void {
  header.style.display = 'flex'
  quotaCards.style.display = 'flex'
  footer.style.display = 'block'
  notConnected.style.display = 'none'
}

function showNotConnectedState(): void {
  header.style.display = 'none'
  quotaCards.style.display = 'none'
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

async function loadQuota(): Promise<void> {
  try {
    const hasCredentials = await window.claudeBar.hasCredentials()

    if (!hasCredentials) {
      showNotConnectedState()
      return
    }

    showConnectedState()
    await loadUserInfo()

    const quota = await window.claudeBar.getQuota()

    if (quota) {
      updateQuotaDisplay(quota)
    } else {
      // API call failed but credentials exist
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
    }
  } catch (error) {
    console.error('Failed to refresh quota:', error)
  } finally {
    refreshBtn.classList.remove('loading')
  }
}

// Event listeners
refreshBtn.addEventListener('click', refreshQuota)

// Initial load
loadQuota()
