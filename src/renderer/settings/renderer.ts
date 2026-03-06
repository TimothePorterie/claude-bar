// Settings renderer script

// DOM elements
const connectionStatus = document.getElementById('connectionStatus') as HTMLElement
const statusIndicator = document.getElementById('statusIndicator') as HTMLElement
const statusText = document.getElementById('statusText') as HTMLElement
const statusEmail = document.getElementById('statusEmail') as HTMLElement
const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement
const notConnectedHelp = document.getElementById('notConnectedHelp') as HTMLElement
const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement
const authCodeSection = document.getElementById('authCodeSection') as HTMLElement
const authCodeInput = document.getElementById('authCodeInput') as HTMLInputElement
const validateBtn = document.getElementById('validateBtn') as HTMLButtonElement
const cancelLoginBtn = document.getElementById('cancelLoginBtn') as HTMLButtonElement
const authError = document.getElementById('authError') as HTMLElement
const refreshInterval = document.getElementById('refreshInterval') as HTMLSelectElement
const launchAtLogin = document.getElementById('launchAtLogin') as HTMLInputElement

function showConnectedUI(email: string): void {
  connectionStatus.style.display = 'flex'
  statusIndicator.classList.add('connected')
  statusText.textContent = 'Connected'
  statusEmail.textContent = email
  logoutBtn.style.display = 'block'
  notConnectedHelp.style.display = 'none'
  authCodeSection.style.display = 'none'
}

function showNotConnectedUI(): void {
  connectionStatus.style.display = 'flex'
  statusIndicator.classList.remove('connected')
  statusText.textContent = 'Not Connected'
  statusEmail.textContent = 'No credentials found'
  logoutBtn.style.display = 'none'
  authCodeSection.style.display = 'none'
  notConnectedHelp.style.display = 'block'
  loginBtn.style.display = 'inline-block'
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
      showConnectedUI(email)
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
    refreshInterval.value = settings.refreshInterval.toString()
    launchAtLogin.checked = settings.launchAtLogin
  } catch (error) {
    console.error('Failed to load settings:', error)
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

launchAtLogin.addEventListener('change', async () => {
  try {
    await window.claudeBar.setLaunchAtLogin(launchAtLogin.checked)
  } catch (error) {
    console.error('Failed to update launch at login:', error)
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

// Initial load
loadConnectionStatus()
loadSettings()
