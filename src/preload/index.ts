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
  notificationsEnabled: boolean
}

export interface UserInfo {
  email?: string
  name?: string
  subscriptionType?: string
}

export interface HistoryEntry {
  timestamp: number
  fiveHour: number
  sevenDay: number
}

export interface HistoryChartData {
  labels: string[]
  fiveHour: number[]
  sevenDay: number[]
}

export interface HistoryStats {
  avgFiveHour: number
  avgSevenDay: number
  maxFiveHour: number
  maxSevenDay: number
  minFiveHour: number
  minSevenDay: number
  entryCount: number
}

export interface UpdateStatus {
  available: boolean
  downloaded: boolean
  version: string | null
}

const api = {
  // Quota operations
  getQuota: (): Promise<QuotaInfo | null> => ipcRenderer.invoke('get-quota'),
  refreshQuota: (): Promise<QuotaInfo | null> => ipcRenderer.invoke('refresh-quota'),
  getCachedQuota: (): Promise<QuotaInfo | null> => ipcRenderer.invoke('get-cached-quota'),
  onQuotaUpdated: (callback: (quota: QuotaInfo) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, quota: QuotaInfo): void => callback(quota)
    ipcRenderer.on('quota-updated', handler)
    return () => ipcRenderer.removeListener('quota-updated', handler)
  },

  // Credentials
  hasCredentials: (): Promise<boolean> => ipcRenderer.invoke('has-credentials'),
  getUserInfo: (): Promise<UserInfo | null> => ipcRenderer.invoke('get-user-info'),

  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('get-settings'),
  setRefreshInterval: (seconds: number): Promise<boolean> =>
    ipcRenderer.invoke('set-refresh-interval', seconds),
  setLaunchAtLogin: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-launch-at-login', enabled),
  setNotificationsEnabled: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-notifications-enabled', enabled),

  // App info
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  // History
  getHistory: (hours?: number): Promise<HistoryEntry[]> => ipcRenderer.invoke('get-history', hours),
  getHistoryChartData: (hours: number): Promise<HistoryChartData> =>
    ipcRenderer.invoke('get-history-chart-data', hours),
  getHistoryStats: (hours: number): Promise<HistoryStats | null> =>
    ipcRenderer.invoke('get-history-stats', hours),
  clearHistory: (): Promise<boolean> => ipcRenderer.invoke('clear-history'),

  // Updates
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('check-for-updates'),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('get-update-status'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('install-update'),

  // Logs
  getLogPath: (): Promise<string> => ipcRenderer.invoke('get-log-path')
}

contextBridge.exposeInMainWorld('claudeBar', api)

// TypeScript declaration for window.claudeBar
declare global {
  interface Window {
    claudeBar: typeof api
  }
}
