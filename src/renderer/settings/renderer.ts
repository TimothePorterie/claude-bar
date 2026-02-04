// Settings renderer script

// DOM elements
const statusIndicator = document.getElementById('statusIndicator') as HTMLElement
const statusText = document.getElementById('statusText') as HTMLElement
const statusEmail = document.getElementById('statusEmail') as HTMLElement
const notConnectedHelp = document.getElementById('notConnectedHelp') as HTMLElement
const refreshInterval = document.getElementById('refreshInterval') as HTMLSelectElement
const adaptiveRefresh = document.getElementById('adaptiveRefresh') as HTMLInputElement
const notificationsEnabled = document.getElementById('notificationsEnabled') as HTMLInputElement
const launchAtLogin = document.getElementById('launchAtLogin') as HTMLInputElement
const warningThreshold = document.getElementById('warningThreshold') as HTMLInputElement
const warningValue = document.getElementById('warningValue') as HTMLElement
const criticalThreshold = document.getElementById('criticalThreshold') as HTMLInputElement
const criticalValue = document.getElementById('criticalValue') as HTMLElement
const showTimeToCritical = document.getElementById('showTimeToCritical') as HTMLInputElement
const appVersion = document.getElementById('appVersion') as HTMLElement
const updateText = document.getElementById('updateText') as HTMLElement
const updateBtn = document.getElementById('updateBtn') as HTMLButtonElement

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
    const status = await window.claudeBar.getUpdateStatus()

    if (status.downloaded && status.version) {
      updateText.textContent = `Update ${status.version} ready to install`
      updateBtn.style.display = 'inline-block'
    } else if (status.available && status.version) {
      updateText.textContent = `Downloading update ${status.version}...`
      updateBtn.style.display = 'none'
    } else {
      updateText.textContent = 'You are running the latest version'
      updateBtn.style.display = 'none'
    }
  } catch (error) {
    console.error('Failed to check for updates:', error)
    updateText.textContent = 'Could not check for updates'
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

// Initial load
loadConnectionStatus()
loadSettings()
loadAppVersion()
checkForUpdates()
