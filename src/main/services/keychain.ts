import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from './logger'
import { notificationService } from './notifications'

const execAsync = promisify(exec)

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

export class KeychainService {
  private static readonly SERVICE_NAME = 'Claude Code-credentials'
  private static readonly TOKEN_REFRESH_URL = 'https://api.anthropic.com/api/oauth/token'
  private static readonly CLIENT_ID = 'claude-code'
  private isRefreshing = false
  private cachedCredentials: Credentials | null = null

  async getCredentials(): Promise<Credentials | null> {
    try {
      const { stdout } = await execAsync(
        `security find-generic-password -s "${KeychainService.SERVICE_NAME}" -w 2>/dev/null`
      )

      const jsonStr = stdout.trim()
      if (!jsonStr) {
        return null
      }

      const data = JSON.parse(jsonStr)

      // The credentials are stored under claudeAiOauth key
      const oauth = data.claudeAiOauth
      if (!oauth || !oauth.accessToken) {
        logger.error('No claudeAiOauth credentials found in Keychain data')
        return null
      }

      this.cachedCredentials = {
        accessToken: oauth.accessToken,
        refreshToken: oauth.refreshToken,
        expiresAt: oauth.expiresAt,
        accountUuid: data.accountUuid,
        emailAddress: data.emailAddress,
        displayName: data.displayName,
        subscriptionType: oauth.subscriptionType
      }

      return this.cachedCredentials
    } catch (error) {
      // Keychain item not found or access denied
      logger.error('Failed to read credentials from Keychain:', error)
      return null
    }
  }

  async hasCredentials(): Promise<boolean> {
    try {
      await execAsync(
        `security find-generic-password -s "${KeychainService.SERVICE_NAME}" 2>/dev/null`
      )
      return true
    } catch {
      return false
    }
  }

  async isTokenExpired(credentials: Credentials): Promise<boolean> {
    if (!credentials.expiresAt) {
      return false // Assume not expired if no expiration time
    }
    // Add 5 minute buffer before actual expiration
    return Date.now() > credentials.expiresAt - 5 * 60 * 1000
  }

  async getValidCredentials(): Promise<Credentials | null> {
    const credentials = await this.getCredentials()
    if (!credentials) return null

    // Check if token needs refresh
    if (await this.isTokenExpired(credentials)) {
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

    if (this.isRefreshing) {
      logger.debug('Token refresh already in progress')
      return this.cachedCredentials
    }

    this.isRefreshing = true

    try {
      const response = await fetch(KeychainService.TOKEN_REFRESH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: credentials.refreshToken,
          client_id: KeychainService.CLIENT_ID
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Token refresh failed: ${response.status} - ${errorText}`)
        notificationService.notifyTokenRefreshFailed()
        return null
      }

      const data = (await response.json()) as TokenRefreshResponse

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
      logger.error('Token refresh error:', error)
      notificationService.notifyTokenRefreshFailed()
      return null
    } finally {
      this.isRefreshing = false
    }
  }

  private async updateKeychainCredentials(credentials: Credentials): Promise<boolean> {
    try {
      // Read existing keychain data
      const { stdout } = await execAsync(
        `security find-generic-password -s "${KeychainService.SERVICE_NAME}" -w 2>/dev/null`
      )

      const data = JSON.parse(stdout.trim())

      // Update the oauth section
      data.claudeAiOauth = {
        ...data.claudeAiOauth,
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt
      }

      // Write back to keychain
      const jsonStr = JSON.stringify(data)
      const escapedJson = jsonStr.replace(/"/g, '\\"')

      await execAsync(
        `security delete-generic-password -s "${KeychainService.SERVICE_NAME}" 2>/dev/null || true`
      )
      await execAsync(
        `security add-generic-password -s "${KeychainService.SERVICE_NAME}" -a "${KeychainService.SERVICE_NAME}" -w "${escapedJson}"`
      )

      logger.info('Keychain credentials updated')
      return true
    } catch (error) {
      logger.error('Failed to update keychain credentials:', error)
      return false
    }
  }
}

export const keychainService = new KeychainService()
