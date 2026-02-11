import { contextBridge, ipcRenderer } from 'electron'

export type QuotaErrorType = 'network' | 'auth' | 'rate_limit' | 'server' | 'unknown'

export interface QuotaError {
  type: QuotaErrorType
  message: string
  retryable: boolean
}

export interface QuotaInfo {
  fiveHour: {
    utilization: number
    resetsAt: Date
    resetsIn: string
    resetProgress: number
  }
  sevenDay: {
    utilization: number
    resetsAt: Date
    resetsIn: string
    resetProgress: number
  }
  lastUpdated: Date
  error?: QuotaError
}

export interface Settings {
  refreshInterval: number
  launchAtLogin: boolean
  notificationsEnabled: boolean
  warningThreshold: number
  criticalThreshold: number
  adaptiveRefresh: boolean
  showTimeToCritical: boolean
}

export interface Thresholds {
  warning: number
  critical: number
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

export type TrendDirection = 'up' | 'down' | 'stable'

export interface TrendData {
  fiveHour: {
    direction: TrendDirection
    delta: number
  }
  sevenDay: {
    direction: TrendDirection
    delta: number
  }
}

export interface TimeToThreshold {
  fiveHour: number | null
  sevenDay: number | null
}

export interface UpdateStatus {
  available: boolean
  downloaded: boolean
  version: string | null
}

export interface PauseStatus {
  paused: boolean
  resumeAt: number | null
  remainingMs: number | null
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

  // Thresholds
  getThresholds: (): Promise<Thresholds> => ipcRenderer.invoke('get-thresholds'),
  setWarningThreshold: (threshold: number): Promise<boolean> =>
    ipcRenderer.invoke('set-warning-threshold', threshold),
  setCriticalThreshold: (threshold: number): Promise<boolean> =>
    ipcRenderer.invoke('set-critical-threshold', threshold),

  // Adaptive refresh
  setAdaptiveRefresh: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-adaptive-refresh', enabled),

  // Time to critical display
  setShowTimeToCritical: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-show-time-to-critical', enabled),

  // Pause/Focus mode
  pauseMonitoring: (durationMinutes?: number): Promise<boolean> =>
    ipcRenderer.invoke('pause-monitoring', durationMinutes),
  resumeMonitoring: (): Promise<boolean> => ipcRenderer.invoke('resume-monitoring'),
  getPauseStatus: (): Promise<PauseStatus> => ipcRenderer.invoke('get-pause-status'),

  // App info
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  // History
  getHistory: (hours?: number): Promise<HistoryEntry[]> => ipcRenderer.invoke('get-history', hours),
  getHistoryChartData: (hours: number): Promise<HistoryChartData> =>
    ipcRenderer.invoke('get-history-chart-data', hours),
  getHistoryStats: (hours: number): Promise<HistoryStats | null> =>
    ipcRenderer.invoke('get-history-stats', hours),
  clearHistory: (): Promise<boolean> => ipcRenderer.invoke('clear-history'),
  getTrend: (lookbackMinutes?: number): Promise<TrendData | null> =>
    ipcRenderer.invoke('get-trend', lookbackMinutes),
  getTimeToCritical: (): Promise<TimeToThreshold | null> =>
    ipcRenderer.invoke('get-time-to-critical'),

  // Updates
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('check-for-updates'),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('get-update-status'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('install-update'),
  onDownloadProgress: (callback: (percent: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, percent: number): void => callback(percent)
    ipcRenderer.on('update-download-progress', handler)
    return () => ipcRenderer.removeListener('update-download-progress', handler)
  },

  // Logs
  getLogPath: (): Promise<string> => ipcRenderer.invoke('get-log-path'),

  // Auth
  startLogin: (): Promise<boolean> => ipcRenderer.invoke('auth-start-login'),
  submitAuthCode: (code: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('auth-submit-code', code),
  logout: (): Promise<boolean> => ipcRenderer.invoke('auth-logout'),
  getAuthState: (): Promise<string> => ipcRenderer.invoke('auth-get-state'),
  onAuthStateChanged: (callback: (state: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: string): void => callback(state)
    ipcRenderer.on('auth-state-changed', handler)
    return () => ipcRenderer.removeListener('auth-state-changed', handler)
  },

  // Navigation
  openSettings: (): Promise<boolean> => ipcRenderer.invoke('open-settings'),

  // Window
  reportContentHeight: (height: number): void => {
    ipcRenderer.send('popup-content-height', height)
  }
}

contextBridge.exposeInMainWorld('claudeBar', api)

// TypeScript declaration for window.claudeBar
declare global {
  interface Window {
    claudeBar: typeof api
  }
}
