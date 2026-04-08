// Settings renderer script
import type { Locale } from '../../shared/i18n'
import { t, setLocale, applyI18n } from '../../shared/i18n'

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
const language = document.getElementById('language') as HTMLSelectElement
const refreshInterval = document.getElementById('refreshInterval') as HTMLSelectElement
const enableNotifications = document.getElementById('enableNotifications') as HTMLInputElement
const launchAtLogin = document.getElementById('launchAtLogin') as HTMLInputElement

function showConnectedUI(email: string): void {
  connectionStatus.style.display = 'flex'
  statusIndicator.classList.add('connected')
  statusText.textContent = t('settings.connected')
  statusEmail.textContent = email
  logoutBtn.style.display = 'block'
  notConnectedHelp.style.display = 'none'
  authCodeSection.style.display = 'none'
}

function showNotConnectedUI(): void {
  connectionStatus.style.display = 'flex'
  statusIndicator.classList.remove('connected')
  statusText.textContent = t('settings.notConnected')
  statusEmail.textContent = t('settings.noCredentials')
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
    statusText.textContent = t('settings.error')
    statusEmail.textContent = t('settings.credentialsError')
  }
}

async function loadSettings(): Promise<void> {
  try {
    const settings = await window.claudeBar.getSettings()
    language.value = settings.language
    refreshInterval.value = settings.refreshInterval.toString()
    enableNotifications.checked = settings.enableNotifications
    launchAtLogin.checked = settings.launchAtLogin
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
}

// Event listeners
language.addEventListener('change', async () => {
  const lang = language.value as Locale
  try {
    await window.claudeBar.setLanguage(lang)
    setLocale(lang)
    applyI18n()
  } catch (error) {
    console.error('Failed to update language:', error)
  }
})

refreshInterval.addEventListener('change', async () => {
  const seconds = parseInt(refreshInterval.value, 10)
  try {
    await window.claudeBar.setRefreshInterval(seconds)
  } catch (error) {
    console.error('Failed to update refresh interval:', error)
  }
})

enableNotifications.addEventListener('change', async () => {
  try {
    await window.claudeBar.setEnableNotifications(enableNotifications.checked)
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
      authError.textContent = result.error || t('error.authFailed')
      authError.style.display = 'inline'
    }
  } catch (error) {
    console.error('Failed to submit auth code:', error)
    authError.textContent = t('error.unexpected')
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

// Update UI elements
const updateText = document.getElementById('updateText') as HTMLElement
const checkUpdateBtn = document.getElementById('checkUpdateBtn') as HTMLButtonElement
const installUpdateBtn = document.getElementById('installUpdateBtn') as HTMLButtonElement
const updateProgress = document.getElementById('updateProgress') as HTMLElement
const updateProgressBar = document.getElementById('updateProgressBar') as HTMLElement
const appVersion = document.getElementById('appVersion') as HTMLElement

function updateUpdateUI(state: { status: string; version?: string; progress?: number; error?: string }): void {
  checkUpdateBtn.disabled = false
  installUpdateBtn.style.display = 'none'
  updateProgress.style.display = 'none'
  updateProgress.classList.remove('indeterminate')

  switch (state.status) {
    case 'checking':
      updateText.textContent = t('settings.checkUpdatesHint')
      checkUpdateBtn.disabled = true
      updateProgress.style.display = 'block'
      updateProgress.classList.add('indeterminate')
      break
    case 'available':
      updateText.textContent = t('settings.versionAvailable', { version: state.version ?? '' })
      checkUpdateBtn.style.display = 'none'
      installUpdateBtn.style.display = 'inline-block'
      installUpdateBtn.textContent = t('settings.downloadInstall')
      break
    case 'not-available':
      updateText.textContent = t('settings.upToDate')
      break
    case 'downloading':
      updateText.textContent = t('settings.downloading', { progress: state.progress ?? 0 })
      checkUpdateBtn.style.display = 'none'
      updateProgress.style.display = 'block'
      updateProgressBar.style.width = `${state.progress ?? 0}%`
      break
    case 'downloaded':
      updateText.textContent = t('settings.versionReady', { version: state.version ?? '' })
      checkUpdateBtn.style.display = 'none'
      installUpdateBtn.style.display = 'inline-block'
      installUpdateBtn.textContent = t('settings.installRestart')
      break
    case 'error':
      updateText.textContent = state.error || t('settings.updateFailed')
      break
    default:
      updateText.textContent = t('settings.checkUpdatesHint')
  }
}

checkUpdateBtn.addEventListener('click', async () => {
  checkUpdateBtn.disabled = true
  try {
    await window.claudeBar.checkForUpdates()
  } catch (error) {
    console.error('Failed to check for updates:', error)
    checkUpdateBtn.disabled = false
  }
})

installUpdateBtn.addEventListener('click', async () => {
  installUpdateBtn.disabled = true
  try {
    const state = await window.claudeBar.getUpdateStatus()
    if (state.status === 'available') {
      await window.claudeBar.downloadUpdate()
    } else if (state.status === 'downloaded') {
      await window.claudeBar.installUpdate()
    }
  } catch (error) {
    console.error('Failed to install update:', error)
    installUpdateBtn.disabled = false
  }
})

// Listen for update status changes
window.claudeBar.onUpdateStatusChanged((state) => {
  updateUpdateUI(state)
})

// Load version and initial update state
async function loadUpdateInfo(): Promise<void> {
  try {
    const version = await window.claudeBar.getAppVersion()
    appVersion.textContent = t('settings.version', { version })

    const state = await window.claudeBar.getUpdateStatus()
    updateUpdateUI(state)
  } catch (error) {
    console.error('Failed to load update info:', error)
  }
}

// Initialize locale then load
async function init(): Promise<void> {
  const settings = await window.claudeBar.getSettings()
  setLocale(settings.language as Locale)
  applyI18n()
  language.value = settings.language
  refreshInterval.value = settings.refreshInterval.toString()
  enableNotifications.checked = settings.enableNotifications
  launchAtLogin.checked = settings.launchAtLogin
  loadConnectionStatus()
  loadUpdateInfo()
}

init()
