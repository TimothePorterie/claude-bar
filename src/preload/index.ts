import { contextBridge, ipcRenderer } from 'electron'

export type QuotaErrorType = 'network' | 'auth' | 'rate_limit' | 'server' | 'unknown'

export interface QuotaError {
  type: QuotaErrorType
  message: string
  retryable: boolean
}

export interface QuotaPeriod {
  utilization: number
  resetsAt: Date
  resetsIn: string
  resetProgress: number
}

export interface ExtraUsageInfo {
  isEnabled: boolean
  usedCredits: number
  monthlyLimit: number
  currency: string
}

export interface QuotaInfo {
  fiveHour: QuotaPeriod
  sevenDay: QuotaPeriod
  sevenDayOpus?: QuotaPeriod
  extraUsage?: ExtraUsageInfo
  lastUpdated: Date
  error?: QuotaError
}

export interface Settings {
  refreshInterval: number
  launchAtLogin: boolean
  authMode: 'app' | 'cli'
}

export interface UserInfo {
  email?: string
  name?: string
  subscriptionType?: string
}

const api = {
  // Quota operations
  getQuota: (): Promise<QuotaInfo | null> => ipcRenderer.invoke('get-quota'),
  refreshQuota: (): Promise<QuotaInfo | null> => ipcRenderer.invoke('refresh-quota'),
  onQuotaUpdated: (callback: (quota: QuotaInfo) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, quota: QuotaInfo): void => callback(quota)
    ipcRenderer.on('quota-updated', handler)
    return () => ipcRenderer.removeListener('quota-updated', handler)
  },

  // Credentials
  hasCredentials: (): Promise<boolean> => ipcRenderer.invoke('has-credentials'),
  getUserInfo: (): Promise<UserInfo | null> => ipcRenderer.invoke('get-user-info'),

  // Errors
  getLastError: (): Promise<QuotaError | null> => ipcRenderer.invoke('get-last-error'),
  onQuotaError: (callback: (error: QuotaError) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: QuotaError): void => callback(error)
    ipcRenderer.on('quota-error', handler)
    return () => ipcRenderer.removeListener('quota-error', handler)
  },

  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('get-settings'),
  setRefreshInterval: (seconds: number): Promise<boolean> =>
    ipcRenderer.invoke('set-refresh-interval', seconds),
  setLaunchAtLogin: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-launch-at-login', enabled),
  setAuthMode: (mode: 'app' | 'cli'): Promise<boolean> =>
    ipcRenderer.invoke('set-auth-mode', mode),

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

  // Updates
  checkForUpdates: (): Promise<boolean> => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (): Promise<boolean> => ipcRenderer.invoke('download-update'),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke('install-update'),
  getUpdateStatus: (): Promise<{ status: string; version?: string; progress?: number; error?: string }> =>
    ipcRenderer.invoke('get-update-status'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  onUpdateStatusChanged: (callback: (state: { status: string; version?: string; progress?: number; error?: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: { status: string; version?: string; progress?: number; error?: string }): void => callback(state)
    ipcRenderer.on('update-status-changed', handler)
    return () => ipcRenderer.removeListener('update-status-changed', handler)
  },

  // Navigation
  openSettings: (): Promise<boolean> => ipcRenderer.invoke('open-settings'),

  // Window
  reportContentHeight: (height: number): void => {
    ipcRenderer.send('popup-content-height', height)
  }
}

contextBridge.exposeInMainWorld('claudeBar', api)

declare global {
  interface Window {
    claudeBar: typeof api
  }
}
