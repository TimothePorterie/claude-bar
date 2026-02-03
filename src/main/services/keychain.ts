import { exec } from 'child_process'
import { promisify } from 'util'

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

export class KeychainService {
  private static readonly SERVICE_NAME = 'Claude Code-credentials'

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
        console.error('No claudeAiOauth credentials found in Keychain data')
        return null
      }

      return {
        accessToken: oauth.accessToken,
        refreshToken: oauth.refreshToken,
        expiresAt: oauth.expiresAt,
        accountUuid: data.accountUuid,
        emailAddress: data.emailAddress,
        displayName: data.displayName,
        subscriptionType: oauth.subscriptionType
      }
    } catch (error) {
      // Keychain item not found or access denied
      console.error('Failed to read credentials from Keychain:', error)
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
    return Date.now() > (credentials.expiresAt - 5 * 60 * 1000)
  }
}

export const keychainService = new KeychainService()
