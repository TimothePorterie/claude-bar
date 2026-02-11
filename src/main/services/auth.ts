import { safeStorage, shell } from 'electron'
import crypto from 'crypto'
import Store from 'electron-store'
import { logger } from './logger'

export type AuthState = 'authenticated' | 'unauthenticated' | 'expired' | 'refreshing'

interface StoredTokens {
  accessToken: string // encrypted via safeStorage
  refreshToken: string // encrypted via safeStorage
  expiresAt: number
  scope?: string
}

interface StoredUserInfo {
  email?: string
  name?: string
  subscriptionType?: string
}

interface AuthStoreSchema {
  tokens: StoredTokens | null
  userInfo: StoredUserInfo | null
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

type StateChangeCallback = (state: AuthState) => void

// Redact tokens for safe logging
function redactToken(token: string): string {
  if (!token || token.length < 10) return '[REDACTED]'
  return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`
}

export class AuthService {
  private static readonly AUTH_URL = 'https://claude.ai/oauth/authorize'
  private static readonly TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
  private static readonly CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
  private static readonly REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback'
  private static readonly SCOPES = 'user:inference user:profile'

  private store: Store<AuthStoreSchema> | null = null
  private state: AuthState = 'unauthenticated'
  private codeVerifier: string | null = null
  private stateParam: string | null = null
  private isRefreshing = false
  private stateCallbacks: StateChangeCallback[] = []

  initialize(): void {
    this.store = new Store<AuthStoreSchema>({
      name: 'auth-store',
      defaults: {
        tokens: null,
        userInfo: null
      }
    })

    // Check if we have stored tokens
    const tokens = this.store.get('tokens')
    if (tokens) {
      try {
        // Verify we can decrypt tokens
        this.decryptToken(tokens.accessToken)
        if (tokens.expiresAt && Date.now() > tokens.expiresAt - 5 * 60 * 1000) {
          this.setState('expired')
        } else {
          this.setState('authenticated')
        }
      } catch {
        logger.warn('Failed to decrypt stored auth tokens, clearing')
        this.store.set('tokens', null)
        this.setState('unauthenticated')
      }
    }

    logger.info(`Auth service initialized, state: ${this.state}`)
  }

  async startLogin(): Promise<boolean> {
    try {
      // Generate PKCE code_verifier (43-128 chars, URL-safe)
      this.codeVerifier = this.generateCodeVerifier()
      const codeChallenge = this.generateCodeChallenge(this.codeVerifier)

      // Generate state parameter for CSRF protection
      this.stateParam = crypto.randomBytes(32).toString('hex')

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: AuthService.CLIENT_ID,
        redirect_uri: AuthService.REDIRECT_URI,
        scope: AuthService.SCOPES,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: this.stateParam
      })

      const authUrl = `${AuthService.AUTH_URL}?${params.toString()}`
      await shell.openExternal(authUrl)

      logger.info('OAuth login started, browser opened')
      return true
    } catch (error) {
      logger.error('Failed to start login:', error instanceof Error ? error.message : String(error))
      this.codeVerifier = null
      this.stateParam = null
      return false
    }
  }

  async submitCode(rawCode: string): Promise<{ success: boolean; error?: string }> {
    if (!this.codeVerifier) {
      return { success: false, error: 'No login in progress. Please click "Log In" first.' }
    }

    const trimmed = rawCode.trim()
    if (!trimmed || trimmed.length < 5) {
      return { success: false, error: 'Invalid authorization code.' }
    }

    // The callback page provides code#state — split on #
    let code: string
    let state: string | undefined
    const hashIndex = trimmed.indexOf('#')
    if (hashIndex !== -1) {
      code = trimmed.substring(0, hashIndex)
      state = trimmed.substring(hashIndex + 1)
    } else {
      code = trimmed
      state = undefined
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const body: Record<string, string> = {
        grant_type: 'authorization_code',
        code,
        client_id: AuthService.CLIENT_ID,
        redirect_uri: AuthService.REDIRECT_URI,
        code_verifier: this.codeVerifier
      }

      // Include state if present
      if (state) {
        body.state = state
      }

      const response = await fetch(AuthService.TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(body),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Token exchange failed: ${response.status} - ${errorText}`)
        this.codeVerifier = null
        this.stateParam = null
        return { success: false, error: `Authentication failed (${response.status}). Please try again.` }
      }

      const data = (await response.json()) as TokenResponse

      if (!data.access_token || !data.refresh_token) {
        logger.error('Token exchange returned incomplete data')
        this.codeVerifier = null
        this.stateParam = null
        return { success: false, error: 'Received incomplete token data.' }
      }

      // Store encrypted tokens
      this.storeTokens(data)

      // Fetch user info with the new token
      await this.fetchAndStoreUserInfo(data.access_token)

      this.codeVerifier = null
      this.stateParam = null
      this.setState('authenticated')

      logger.info(`OAuth login successful, token: ${redactToken(data.access_token)}`)
      return { success: true }
    } catch (error) {
      this.codeVerifier = null
      this.stateParam = null

      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Token exchange timed out')
        return { success: false, error: 'Request timed out. Please try again.' }
      }

      logger.error('Token exchange error:', error instanceof Error ? error.message : String(error))
      return { success: false, error: 'Network error. Please check your connection and try again.' }
    }
  }

  async refreshTokens(): Promise<boolean> {
    if (!this.store) return false

    const tokens = this.store.get('tokens')
    if (!tokens?.refreshToken) {
      logger.warn('No refresh token available for auth service')
      return false
    }

    if (this.isRefreshing) {
      logger.debug('Auth token refresh already in progress')
      return false
    }

    this.isRefreshing = true
    this.setState('refreshing')

    try {
      let refreshToken: string
      try {
        refreshToken = this.decryptToken(tokens.refreshToken)
      } catch {
        logger.error('Failed to decrypt refresh token')
        this.setState('expired')
        return false
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(AuthService.TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: AuthService.CLIENT_ID
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Auth token refresh failed: ${response.status} - ${errorText}`)
        this.setState('expired')
        return false
      }

      const data = (await response.json()) as TokenResponse

      if (!data.access_token || !data.refresh_token) {
        logger.error('Token refresh returned incomplete data')
        this.setState('expired')
        return false
      }

      this.storeTokens(data)
      this.setState('authenticated')

      logger.info('Auth token refreshed successfully')
      return true
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Auth token refresh timed out')
      } else {
        logger.error('Auth token refresh error:', error instanceof Error ? error.message : String(error))
      }
      this.setState('expired')
      return false
    } finally {
      this.isRefreshing = false
    }
  }

  async getValidAccessToken(): Promise<string | null> {
    if (!this.store) return null

    const tokens = this.store.get('tokens')
    if (!tokens) return null

    let accessToken: string
    try {
      accessToken = this.decryptToken(tokens.accessToken)
    } catch {
      logger.error('Failed to decrypt access token')
      return null
    }

    // Check if expired (with 5min buffer)
    if (tokens.expiresAt && Date.now() > tokens.expiresAt - 5 * 60 * 1000) {
      logger.info('Auth access token expired, attempting refresh...')
      const refreshed = await this.refreshTokens()
      if (!refreshed) return null

      // Re-read after refresh
      const updatedTokens = this.store.get('tokens')
      if (!updatedTokens) return null

      try {
        return this.decryptToken(updatedTokens.accessToken)
      } catch {
        return null
      }
    }

    return accessToken
  }

  logout(): void {
    if (!this.store) return

    this.store.set('tokens', null)
    this.store.set('userInfo', null)
    this.codeVerifier = null
    this.stateParam = null
    this.setState('unauthenticated')

    logger.info('User logged out from auth service')
  }

  getState(): AuthState {
    return this.state
  }

  getUserInfo(): StoredUserInfo | null {
    if (!this.store) return null
    return this.store.get('userInfo')
  }

  hasTokens(): boolean {
    if (!this.store) return false
    return this.store.get('tokens') !== null
  }

  onStateChange(callback: StateChangeCallback): void {
    this.stateCallbacks.push(callback)
  }

  isLoginInProgress(): boolean {
    return this.codeVerifier !== null
  }

  private setState(newState: AuthState): void {
    if (this.state === newState) return
    const oldState = this.state
    this.state = newState
    logger.debug(`Auth state: ${oldState} -> ${newState}`)
    for (const callback of this.stateCallbacks) {
      try {
        callback(newState)
      } catch (error) {
        logger.error('Auth state callback error:', error instanceof Error ? error.message : String(error))
      }
    }
  }

  private generateCodeVerifier(): string {
    // 32 random bytes -> 43 chars base64url
    return crypto.randomBytes(32).toString('base64url')
  }

  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url')
  }

  private encryptToken(token: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      logger.warn('safeStorage encryption not available, using base64 fallback')
      return Buffer.from(token).toString('base64')
    }
    return safeStorage.encryptString(token).toString('base64')
  }

  private decryptToken(encrypted: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(encrypted, 'base64').toString('utf-8')
    }
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  }

  private storeTokens(data: TokenResponse): void {
    if (!this.store) return

    this.store.set('tokens', {
      accessToken: this.encryptToken(data.access_token),
      refreshToken: this.encryptToken(data.refresh_token),
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: AuthService.SCOPES
    })
  }

  private async fetchAndStoreUserInfo(accessToken: string): Promise<void> {
    if (!this.store) return

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        // The usage endpoint doesn't return user info directly,
        // but we know the token is valid. Store basic info.
        // User info comes from the Keychain if available.
        logger.debug('Token verified via usage endpoint')
      }
    } catch {
      // Non-critical: user info fetch failed, token is still valid
      logger.debug('Could not fetch user info after login')
    }
  }
}

export const authService = new AuthService()
