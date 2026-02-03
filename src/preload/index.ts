import { contextBridge, ipcRenderer } from 'electron'

export interface QuotaInfo {
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

export interface Settings {
  refreshInterval: number
  launchAtLogin: boolean
}

export interface UserInfo {
  email?: string
  name?: string
}

const api = {
  // Quota operations
  getQuota: (): Promise<QuotaInfo | null> => ipcRenderer.invoke('get-quota'),
  refreshQuota: (): Promise<QuotaInfo | null> => ipcRenderer.invoke('refresh-quota'),
  getCachedQuota: (): Promise<QuotaInfo | null> => ipcRenderer.invoke('get-cached-quota'),

  // Credentials
  hasCredentials: (): Promise<boolean> => ipcRenderer.invoke('has-credentials'),
  getUserInfo: (): Promise<UserInfo | null> => ipcRenderer.invoke('get-user-info'),

  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('get-settings'),
  setRefreshInterval: (seconds: number): Promise<boolean> =>
    ipcRenderer.invoke('set-refresh-interval', seconds),
  setLaunchAtLogin: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-launch-at-login', enabled),

  // App info
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version')
}

contextBridge.exposeInMainWorld('claudeBar', api)

// TypeScript declaration for window.claudeBar
declare global {
  interface Window {
    claudeBar: typeof api
  }
}
