import { execFile } from 'child_process'
import { promisify } from 'util'
import { logger } from './logger'
import { notificationService } from './notifications'

const execFileAsync = promisify(execFile)

export interface Credentials {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  accountUuid?: string
  emailAddress?: string
  displayName?: string
  subscriptionType?: string
}

interface TokenRefreshResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

// Validate that a string looks like a valid OAuth token (alphanumeric + common token chars)
function isValidToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false
  // OAuth tokens are typically base64-like strings
  return /^[A-Za-z0-9_\-\.]+$/.test(token) && token.length > 10 && token.length < 5000
}

// Validate email format
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length < 256
}

// Sanitize string for safe logging (redact sensitive data)
function redactToken(token: string): string {
  if (!token || token.length < 10) return '[REDACTED]'
  return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`
}

// Prototype pollution-safe JSON parsing
function safeJsonParse(jsonStr: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    // Check for prototype pollution attempts (only own properties, not inherited)
    if (
      Object.hasOwn(parsed, '__proto__') ||
      Object.hasOwn(parsed, 'constructor') ||
      Object.hasOwn(parsed, 'prototype')
    ) {
      logger.warn('Potential prototype pollution attempt detected in JSON')
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export class KeychainService {
  private static readonly SERVICE_NAME = 'Claude Code-credentials'
  private static readonly TOKEN_REFRESH_URL = 'https://api.anthropic.com/api/oauth/token'
  private static readonly CLIENT_ID = 'claude-code'
  private isRefreshing = false
  private cachedCredentials: Credentials | null = null

  async getCredentials(): Promise<Credentials | null> {
    try {
      // Use execFile instead of exec to prevent command injection
      const { stdout } = await execFileAsync('security', [
        'find-generic-password',
        '-s',
        KeychainService.SERVICE_NAME,
        '-w'
      ])

      const jsonStr = stdout.trim()
      if (!jsonStr) {
        return null
      }

      const data = safeJsonParse(jsonStr)
      if (!data) {
        logger.error('Invalid or unsafe JSON in Keychain data')
        return null
      }

      const oauth = data.claudeAiOauth as Record<string, unknown> | undefined
      if (!oauth || typeof oauth !== 'object' || !oauth.accessToken) {
        logger.error('No claudeAiOauth credentials found in Keychain data')
        return null
      }

      const accessToken = String(oauth.accessToken)
      const refreshToken = oauth.refreshToken ? String(oauth.refreshToken) : undefined

      // Validate tokens
      if (!isValidToken(accessToken)) {
        logger.error('Invalid access token format in Keychain')
        return null
      }

      if (refreshToken && !isValidToken(refreshToken)) {
        logger.warn('Invalid refresh token format in Keychain')
      }

      this.cachedCredentials = {
        accessToken,
        refreshToken: refreshToken && isValidToken(refreshToken) ? refreshToken : undefined,
        expiresAt: typeof oauth.expiresAt === 'number' ? oauth.expiresAt : undefined,
        accountUuid: typeof data.accountUuid === 'string' ? data.accountUuid : undefined,
        emailAddress:
          typeof data.emailAddress === 'string' && isValidEmail(data.emailAddress)
            ? data.emailAddress
            : undefined,
        displayName: typeof data.displayName === 'string' ? data.displayName.slice(0, 100) : undefined,
        subscriptionType: typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : undefined
      }

      logger.debug(`Credentials loaded: token=${redactToken(accessToken)}`)
      return this.cachedCredentials
    } catch (error) {
      // Keychain item not found or access denied - this is expected for new users
      const errMsg = error instanceof Error ? error.message : String(error)
      if (!errMsg.includes('could not be found')) {
        logger.error('Failed to read credentials from Keychain:', errMsg)
      }
      return null
    }
  }

  async hasCredentials(): Promise<boolean> {
    try {
      await execFileAsync('security', [
        'find-generic-password',
        '-s',
        KeychainService.SERVICE_NAME
      ])
      return true
    } catch {
      return false
    }
  }

  isTokenExpired(credentials: Credentials): boolean {
    if (!credentials.expiresAt || typeof credentials.expiresAt !== 'number') {
      return false // Assume not expired if no expiration time
    }
    // Add 5 minute buffer before actual expiration
    return Date.now() > credentials.expiresAt - 5 * 60 * 1000
  }

  async getValidCredentials(): Promise<Credentials | null> {
    const credentials = await this.getCredentials()
    if (!credentials) return null

    // Check if token needs refresh
    if (this.isTokenExpired(credentials)) {
      logger.info('Access token expired, attempting refresh...')
      const refreshed = await this.refreshToken(credentials)
      if (refreshed) {
        return refreshed
      }
      logger.warn('Token refresh failed, using existing token')
    }

    return credentials
  }

  async refreshToken(credentials: Credentials): Promise<Credentials | null> {
    if (!credentials.refreshToken) {
      logger.warn('No refresh token available')
      return null
    }

    if (!isValidToken(credentials.refreshToken)) {
      logger.error('Invalid refresh token format')
      return null
    }

    if (this.isRefreshing) {
      logger.debug('Token refresh already in progress')
      return this.cachedCredentials
    }

    this.isRefreshing = true

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

      const response = await fetch(KeychainService.TOKEN_REFRESH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: credentials.refreshToken,
          client_id: KeychainService.CLIENT_ID
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Token refresh failed: ${response.status}`)
        notificationService.notifyTokenRefreshFailed()
        return null
      }

      let data: TokenRefreshResponse
      try {
        data = (await response.json()) as TokenRefreshResponse
      } catch {
        logger.error('Invalid JSON response from token refresh')
        return null
      }

      // Validate response tokens
      if (!isValidToken(data.access_token)) {
        logger.error('Invalid access token in refresh response')
        return null
      }

      if (!isValidToken(data.refresh_token)) {
        logger.error('Invalid refresh token in refresh response')
        return null
      }

      if (typeof data.expires_in !== 'number' || data.expires_in <= 0) {
        logger.error('Invalid expires_in in refresh response')
        return null
      }

      // Update credentials with new tokens
      const newCredentials: Credentials = {
        ...credentials,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000
      }

      // Update keychain with new credentials
      await this.updateKeychainCredentials(newCredentials)

      this.cachedCredentials = newCredentials
      logger.info('Token refreshed successfully')

      return newCredentials
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Token refresh timed out')
      } else {
        logger.error('Token refresh error:', error instanceof Error ? error.message : 'Unknown error')
      }
      notificationService.notifyTokenRefreshFailed()
      return null
    } finally {
      this.isRefreshing = false
    }
  }

  private async updateKeychainCredentials(credentials: Credentials): Promise<boolean> {
    try {
      // Read existing keychain data
      const { stdout } = await execFileAsync('security', [
        'find-generic-password',
        '-s',
        KeychainService.SERVICE_NAME,
        '-w'
      ])

      const data = safeJsonParse(stdout.trim())
      if (!data) {
        logger.error('Invalid or unsafe JSON in existing Keychain data')
        return false
      }

      // Update the oauth section
      const existingOauth = (data.claudeAiOauth as Record<string, unknown>) || {}
      data.claudeAiOauth = {
        ...existingOauth,
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt
      }

      // Write back to keychain using execFile with proper argument passing
      const jsonStr = JSON.stringify(data)

      // Delete existing entry first
      try {
        await execFileAsync('security', [
          'delete-generic-password',
          '-s',
          KeychainService.SERVICE_NAME
        ])
      } catch {
        // Entry might not exist, that's ok
      }

      // Add new entry - pass the JSON as the -w argument directly
      await execFileAsync('security', [
        'add-generic-password',
        '-s',
        KeychainService.SERVICE_NAME,
        '-a',
        KeychainService.SERVICE_NAME,
        '-w',
        jsonStr
      ])

      logger.info('Keychain credentials updated')
      return true
    } catch (error) {
      logger.error('Failed to update keychain credentials:', error instanceof Error ? error.message : 'Unknown error')
      return false
    }
  }
}

export const keychainService = new KeychainService()
