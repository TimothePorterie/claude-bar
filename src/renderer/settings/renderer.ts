// Settings renderer script

// DOM elements
const statusIndicator = document.getElementById('statusIndicator') as HTMLElement
const statusText = document.getElementById('statusText') as HTMLElement
const statusEmail = document.getElementById('statusEmail') as HTMLElement
const notConnectedHelp = document.getElementById('notConnectedHelp') as HTMLElement
const refreshInterval = document.getElementById('refreshInterval') as HTMLSelectElement
const launchAtLogin = document.getElementById('launchAtLogin') as HTMLInputElement
const appVersion = document.getElementById('appVersion') as HTMLElement

async function loadConnectionStatus(): Promise<void> {
  try {
    const hasCredentials = await window.claudeBar.hasCredentials()

    if (hasCredentials) {
      statusIndicator.classList.add('connected')
      statusText.textContent = 'Connected'

      const userInfo = await window.claudeBar.getUserInfo()
      if (userInfo) {
        statusEmail.textContent = userInfo.email || userInfo.name || 'Authenticated'
      } else {
        statusEmail.textContent = 'Authenticated'
      }

      notConnectedHelp.style.display = 'none'
    } else {
      statusIndicator.classList.remove('connected')
      statusText.textContent = 'Not Connected'
      statusEmail.textContent = 'No credentials found'
      notConnectedHelp.style.display = 'block'
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

    // Set launch at login
    launchAtLogin.checked = settings.launchAtLogin
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

// Initial load
loadConnectionStatus()
loadSettings()
loadAppVersion()
