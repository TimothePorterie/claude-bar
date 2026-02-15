// Settings renderer script

// DOM elements
const connectionStatus = document.getElementById('connectionStatus') as HTMLElement
const statusIndicator = document.getElementById('statusIndicator') as HTMLElement
const statusText = document.getElementById('statusText') as HTMLElement
const statusEmail = document.getElementById('statusEmail') as HTMLElement
const authSourceBadge = document.getElementById('authSourceBadge') as HTMLElement
const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement
const notConnectedHelp = document.getElementById('notConnectedHelp') as HTMLElement
const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement
const authCodeSection = document.getElementById('authCodeSection') as HTMLElement
const authCodeInput = document.getElementById('authCodeInput') as HTMLInputElement
const validateBtn = document.getElementById('validateBtn') as HTMLButtonElement
const cancelLoginBtn = document.getElementById('cancelLoginBtn') as HTMLButtonElement
const authError = document.getElementById('authError') as HTMLElement
const refreshInterval = document.getElementById('refreshInterval') as HTMLSelectElement
const adaptiveRefresh = document.getElementById('adaptiveRefresh') as HTMLInputElement
const notificationsEnabled = document.getElementById('notificationsEnabled') as HTMLInputElement
const launchAtLogin = document.getElementById('launchAtLogin') as HTMLInputElement
const warningThreshold = document.getElementById('warningThreshold') as HTMLInputElement
const warningValue = document.getElementById('warningValue') as HTMLElement
const criticalThreshold = document.getElementById('criticalThreshold') as HTMLInputElement
const criticalValue = document.getElementById('criticalValue') as HTMLElement
const showTimeToCritical = document.getElementById('showTimeToCritical') as HTMLInputElement
const showSparkline = document.getElementById('showSparkline') as HTMLInputElement
const appVersion = document.getElementById('appVersion') as HTMLElement
const updateText = document.getElementById('updateText') as HTMLElement
const updateProgress = document.getElementById('updateProgress') as HTMLElement
const updateProgressBar = document.getElementById('updateProgressBar') as HTMLElement
const updateBtn = document.getElementById('updateBtn') as HTMLButtonElement
const checkBtn = document.getElementById('checkBtn') as HTMLButtonElement
const authModeSelect = document.getElementById('authMode') as HTMLSelectElement

let downloadingVersion: string | null = null

function showConnectedUI(
  email: string,
  authSource: string
): void {
  connectionStatus.style.display = 'flex'
  statusIndicator.classList.add('connected')
  statusText.textContent = 'Connected'
  statusEmail.textContent = email

  // Show auth source badge
  if (authSource === 'app') {
    authSourceBadge.textContent = 'via Claude Bar'
    authSourceBadge.style.display = 'inline'
  } else {
    authSourceBadge.textContent = 'via CLI'
    authSourceBadge.style.display = 'inline'
  }

  // Only show logout button in app mode (CLI logout is managed by CLI)
  const currentMode = authModeSelect.value
  logoutBtn.style.display = (authSource === 'app' && currentMode === 'app') ? 'block' : 'none'
  notConnectedHelp.style.display = 'none'
  authCodeSection.style.display = 'none'
}

function showNotConnectedUI(): void {
  connectionStatus.style.display = 'flex'
  statusIndicator.classList.remove('connected')
  statusText.textContent = 'Not Connected'
  statusEmail.textContent = 'No credentials found'
  authSourceBadge.style.display = 'none'
  logoutBtn.style.display = 'none'
  authCodeSection.style.display = 'none'

  // Show appropriate connection help based on auth mode
  const mode = authModeSelect.value
  notConnectedHelp.style.display = 'block'
  if (mode === 'cli') {
    // In CLI mode, hide login button, show CLI instructions
    loginBtn.style.display = 'none'
    const hint = notConnectedHelp.querySelector('.hint') as HTMLElement | null
    if (hint) hint.style.display = 'block'
  } else {
    // In app mode, show login button
    loginBtn.style.display = 'inline-block'
    const hint = notConnectedHelp.querySelector('.hint') as HTMLElement | null
    if (hint) hint.style.display = 'none'
  }
}

function showWaitingForCodeUI(): void {
  notConnectedHelp.style.display = 'none'
  authCodeSection.style.display = 'block'
  authCodeInput.value = ''
  authError.style.display = 'none'
  authCodeInput.focus()
}

async function loadConnectionStatus(): Promise<void> {
  try {
    const hasCredentials = await window.claudeBar.hasCredentials()

    if (hasCredentials) {
      const userInfo = await window.claudeBar.getUserInfo()
      const email = userInfo?.email || userInfo?.name || 'Authenticated'
      const authSource = (userInfo as { authSource?: string } | null)?.authSource || authModeSelect.value
      showConnectedUI(email, authSource)
    } else {
      showNotConnectedUI()
    }
  } catch (error) {
    console.error('Failed to load connection status:', error)
    statusIndicator.classList.remove('connected')
    statusText.textContent = 'Error'
    statusEmail.textContent = 'Could not check credentials'
  }
}

async function loadSettings(): Promise<void> {
  try {
    const settings = await window.claudeBar.getSettings()

    // Set refresh interval
    refreshInterval.value = settings.refreshInterval.toString()

    // Set notifications
    notificationsEnabled.checked = settings.notificationsEnabled

    // Set adaptive refresh
    adaptiveRefresh.checked = settings.adaptiveRefresh

    // Set launch at login
    launchAtLogin.checked = settings.launchAtLogin

    // Set thresholds
    warningThreshold.value = settings.warningThreshold.toString()
    warningValue.textContent = `${settings.warningThreshold}%`
    criticalThreshold.value = settings.criticalThreshold.toString()
    criticalValue.textContent = `${settings.criticalThreshold}%`

    // Update slider constraints
    warningThreshold.max = (settings.criticalThreshold - 1).toString()
    criticalThreshold.min = (settings.warningThreshold + 1).toString()

    // Set show time to critical
    showTimeToCritical.checked = settings.showTimeToCritical

    // Set show sparkline
    showSparkline.checked = settings.showSparkline

    // Set auth mode
    if (settings.authMode) {
      authModeSelect.value = settings.authMode
    }
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
}

async function loadAppVersion(): Promise<void> {
  try {
    const version = await window.claudeBar.getAppVersion()
    appVersion.textContent = version
  } catch (error) {
    console.error('Failed to load app version:', error)
  }
}

async function checkForUpdates(): Promise<void> {
  try {
    updateText.textContent = 'Checking for updates...'
    checkBtn.disabled = true
    updateBtn.style.display = 'none'

    const status = await window.claudeBar.checkForUpdates()

    if (status.downloaded && status.version) {
      updateText.textContent = `Update ${status.version} ready to install`
      updateBtn.style.display = 'inline-block'
      updateProgress.style.display = 'none'
      checkBtn.style.display = 'none'
    } else if (status.available && status.version) {
      updateText.textContent = `Downloading update ${status.version}...`
      downloadingVersion = status.version
      updateProgress.style.display = 'block'
      checkBtn.style.display = 'none'
    } else {
      updateText.textContent = 'You are running the latest version'
      checkBtn.style.display = 'inline-block'
    }
  } catch (error) {
    console.error('Failed to check for updates:', error)
    updateText.textContent = 'Could not check for updates'
    checkBtn.style.display = 'inline-block'
  } finally {
    checkBtn.disabled = false
  }
}

// Event listeners
refreshInterval.addEventListener('change', async () => {
  const seconds = parseInt(refreshInterval.value, 10)
  try {
    await window.claudeBar.setRefreshInterval(seconds)
  } catch (error) {
    console.error('Failed to update refresh interval:', error)
  }
})

adaptiveRefresh.addEventListener('change', async () => {
  try {
    await window.claudeBar.setAdaptiveRefresh(adaptiveRefresh.checked)
  } catch (error) {
    console.error('Failed to update adaptive refresh:', error)
  }
})

notificationsEnabled.addEventListener('change', async () => {
  try {
    await window.claudeBar.setNotificationsEnabled(notificationsEnabled.checked)
  } catch (error) {
    console.error('Failed to update notifications setting:', error)
  }
})

launchAtLogin.addEventListener('change', async () => {
  try {
    await window.claudeBar.setLaunchAtLogin(launchAtLogin.checked)
  } catch (error) {
    console.error('Failed to update launch at login:', error)
  }
})

updateBtn.addEventListener('click', async () => {
  try {
    await window.claudeBar.installUpdate()
  } catch (error) {
    console.error('Failed to install update:', error)
  }
})

checkBtn.addEventListener('click', () => {
  checkForUpdates()
})

warningThreshold.addEventListener('input', () => {
  const value = parseInt(warningThreshold.value, 10)
  warningValue.textContent = `${value}%`
  // Update critical threshold minimum
  criticalThreshold.min = (value + 1).toString()
  if (parseInt(criticalThreshold.value, 10) <= value) {
    criticalThreshold.value = (value + 1).toString()
    criticalValue.textContent = `${value + 1}%`
  }
})

warningThreshold.addEventListener('change', async () => {
  const value = parseInt(warningThreshold.value, 10)
  try {
    await window.claudeBar.setWarningThreshold(value)
  } catch (error) {
    console.error('Failed to update warning threshold:', error)
  }
})

criticalThreshold.addEventListener('input', () => {
  const value = parseInt(criticalThreshold.value, 10)
  criticalValue.textContent = `${value}%`
  // Update warning threshold maximum
  warningThreshold.max = (value - 1).toString()
  if (parseInt(warningThreshold.value, 10) >= value) {
    warningThreshold.value = (value - 1).toString()
    warningValue.textContent = `${value - 1}%`
  }
})

criticalThreshold.addEventListener('change', async () => {
  const value = parseInt(criticalThreshold.value, 10)
  try {
    await window.claudeBar.setCriticalThreshold(value)
  } catch (error) {
    console.error('Failed to update critical threshold:', error)
  }
})

showTimeToCritical.addEventListener('change', async () => {
  try {
    await window.claudeBar.setShowTimeToCritical(showTimeToCritical.checked)
  } catch (error) {
    console.error('Failed to update show time to critical:', error)
  }
})

showSparkline.addEventListener('change', async () => {
  try {
    await window.claudeBar.setShowSparkline(showSparkline.checked)
  } catch (error) {
    console.error('Failed to update show sparkline:', error)
  }
})

// Auth mode change listener
authModeSelect.addEventListener('change', async () => {
  try {
    await window.claudeBar.setAuthMode(authModeSelect.value)
    // Reload connection status to reflect the new mode
    await loadConnectionStatus()
  } catch (error) {
    console.error('Failed to update auth mode:', error)
  }
})

// Auth event listeners
loginBtn.addEventListener('click', async () => {
  loginBtn.disabled = true
  try {
    const started = await window.claudeBar.startLogin()
    if (started) {
      showWaitingForCodeUI()
    }
  } catch (error) {
    console.error('Failed to start login:', error)
  } finally {
    loginBtn.disabled = false
  }
})

validateBtn.addEventListener('click', async () => {
  const code = authCodeInput.value.trim()
  if (!code) return

  validateBtn.disabled = true
  authError.style.display = 'none'

  try {
    const result = await window.claudeBar.submitAuthCode(code)
    if (result.success) {
      await loadConnectionStatus()
    } else {
      authError.textContent = result.error || 'Authentication failed.'
      authError.style.display = 'inline'
    }
  } catch (error) {
    console.error('Failed to submit auth code:', error)
    authError.textContent = 'An unexpected error occurred.'
    authError.style.display = 'inline'
  } finally {
    validateBtn.disabled = false
  }
})

authCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    validateBtn.click()
  }
})

cancelLoginBtn.addEventListener('click', () => {
  authCodeSection.style.display = 'none'
  notConnectedHelp.style.display = 'block'
})

logoutBtn.addEventListener('click', async () => {
  try {
    await window.claudeBar.logout()
    await loadConnectionStatus()
  } catch (error) {
    console.error('Failed to logout:', error)
  }
})

// Listen for auth state changes
window.claudeBar.onAuthStateChanged(async (state) => {
  if (state === 'authenticated' || state === 'unauthenticated') {
    await loadConnectionStatus()
  }
})

// Listen for download progress
window.claudeBar.onDownloadProgress((percent) => {
  const rounded = Math.round(percent)
  if (rounded >= 100) {
    updateProgress.style.display = 'none'
    updateText.textContent = `Update ${downloadingVersion || ''} ready to install`.trim()
    updateBtn.style.display = 'inline-block'
    checkBtn.style.display = 'none'
  } else {
    updateProgress.style.display = 'block'
    updateProgressBar.style.width = `${rounded}%`
    const versionLabel = downloadingVersion ? ` ${downloadingVersion}` : ''
    updateText.textContent = `Downloading update${versionLabel}... ${rounded}%`
    checkBtn.style.display = 'none'
  }
})

// Initial load
loadConnectionStatus()
loadSettings()
loadAppVersion()
checkForUpdates()
