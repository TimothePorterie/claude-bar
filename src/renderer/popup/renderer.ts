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

interface HistoryChartData {
  labels: string[]
  fiveHour: number[]
  sevenDay: number[]
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
const historyPeriod = document.getElementById('historyPeriod') as HTMLSelectElement
const chartCanvas = document.getElementById('chartCanvas') as HTMLCanvasElement
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

// Simple canvas chart drawing
function drawChart(data: HistoryChartData): void {
  const ctx = chartCanvas.getContext('2d')
  if (!ctx) return

  const width = chartCanvas.width
  const height = chartCanvas.height

  // Clear canvas
  ctx.clearRect(0, 0, width, height)

  // Detect dark mode
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const textColor = isDark ? '#888' : '#666'

  // Show message if not enough data
  if (data.labels.length < 2) {
    ctx.fillStyle = textColor
    ctx.font = '12px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Collecting data...', width / 2, height / 2)
    ctx.font = '10px -apple-system, sans-serif'
    ctx.fillText('History will appear after a few refreshes', width / 2, height / 2 + 16)
    return
  }

  const padding = { top: 10, right: 10, bottom: 20, left: 30 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'

  // Draw grid lines
  ctx.strokeStyle = gridColor
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartHeight / 4) * i
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(width - padding.right, y)
    ctx.stroke()
  }

  // Draw Y-axis labels
  ctx.fillStyle = textColor
  ctx.font = '10px -apple-system, sans-serif'
  ctx.textAlign = 'right'
  for (let i = 0; i <= 4; i++) {
    const value = 100 - i * 25
    const y = padding.top + (chartHeight / 4) * i + 3
    ctx.fillText(`${value}%`, padding.left - 5, y)
  }

  // Draw lines
  const pointCount = data.labels.length
  const xStep = chartWidth / (pointCount - 1 || 1)

  function drawLine(values: number[], color: string): void {
    if (!ctx) return
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    values.forEach((value, i) => {
      const x = padding.left + i * xStep
      const y = padding.top + chartHeight - (value / 100) * chartHeight
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.stroke()
  }

  // Draw 5-hour line (green)
  drawLine(data.fiveHour, '#22c55e')
  // Draw 7-day line (blue)
  drawLine(data.sevenDay, '#3b82f6')

  // Draw legend
  ctx.font = '9px -apple-system, sans-serif'
  ctx.textAlign = 'left'

  ctx.fillStyle = '#22c55e'
  ctx.fillRect(padding.left, height - 12, 8, 8)
  ctx.fillStyle = textColor
  ctx.fillText('5h', padding.left + 12, height - 5)

  ctx.fillStyle = '#3b82f6'
  ctx.fillRect(padding.left + 35, height - 12, 8, 8)
  ctx.fillStyle = textColor
  ctx.fillText('7d', padding.left + 47, height - 5)
}

async function loadHistory(hours: number): Promise<void> {
  try {
    const [chartData, stats] = await Promise.all([
      window.claudeBar.getHistoryChartData(hours),
      window.claudeBar.getHistoryStats(hours)
    ])

    if (chartData && chartData.labels.length > 0) {
      drawChart(chartData)
    }

    if (stats) {
      avgFiveHour.textContent = `${stats.avgFiveHour}%`
      avgSevenDay.textContent = `${stats.avgSevenDay}%`
      peakUsage.textContent = `${Math.max(stats.maxFiveHour, stats.maxSevenDay)}%`
    }
  } catch (error) {
    console.error('Failed to load history:', error)
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
      await loadHistory(parseInt(historyPeriod.value))
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
      await loadHistory(parseInt(historyPeriod.value))
    }
  } catch (error) {
    console.error('Failed to refresh quota:', error)
  } finally {
    refreshBtn.classList.remove('loading')
  }
}

// Event listeners
refreshBtn.addEventListener('click', refreshQuota)

historyPeriod.addEventListener('change', () => {
  loadHistory(parseInt(historyPeriod.value))
})

// Handle canvas resize
function resizeCanvas(): void {
  const container = chartCanvas.parentElement
  if (container) {
    chartCanvas.width = container.clientWidth
    chartCanvas.height = 80
  }
}

window.addEventListener('resize', () => {
  resizeCanvas()
  loadHistory(parseInt(historyPeriod.value))
})

// Initial load
resizeCanvas()
loadQuota()
