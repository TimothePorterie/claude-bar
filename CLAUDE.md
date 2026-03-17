# Claude Bar - Technical Documentation

This document provides technical context for AI assistants and developers working on Claude Bar.

## Project Overview

**Claude Bar** is a macOS menu bar application built with Electron that monitors Claude Code quotas in real-time. It displays session (5-hour) and weekly (7-day) quota usage directly from the menu bar.

- **Platform**: macOS 10.13+
- **Framework**: Electron 40 + electron-vite 5.0
- **Language**: TypeScript 5.3
- **License**: MIT

## Architecture

```
Main Process (Electron)
├── index.ts              # App entry point, single instance lock
├── tray.ts               # Menu bar icon and context menu
├── windows.ts            # Popup and settings window management
├── ipc-handlers.ts       # IPC communication with renderer
└── services/
    ├── auth.ts           # In-app OAuth login (PKCE), token storage, refresh
    ├── keychain.ts       # macOS Keychain credential access + token refresh
    ├── quota-api.ts      # Anthropic API integration with retry logic + auth routing
    ├── settings-store.ts # Shared settings store (electron-store singleton)
    ├── scheduler.ts      # Auto-refresh timer
    ├── logger.ts         # Persistent logging with electron-log
    └── cli-probe.ts      # Alternative CLI-based quota probe (unused)

Preload
└── index.ts              # Secure IPC bridge (contextBridge)

Renderer
├── popup/                # Main quota display window
│   ├── index.html        # With skeleton loading
│   ├── renderer.ts
│   └── styles.css
└── settings/             # Settings configuration window
    ├── index.html
    ├── renderer.ts
    └── styles.css

Tests
└── tests/                # Vitest unit tests
    └── quota-api.test.ts
```

## Key Files

| File | Purpose |
|------|---------|
| `src/main/index.ts` | App lifecycle, single instance lock, dock hiding |
| `src/main/tray.ts` | Menu bar icon, title updates, context menu, display modes |
| `src/main/windows.ts` | Popup and settings windows, auto-fit content height |
| `src/main/services/auth.ts` | In-app OAuth login (PKCE flow), encrypted token storage, refresh |
| `src/main/services/keychain.ts` | CLI OAuth token access + automatic refresh |
| `src/main/services/quota-api.ts` | API calls with retry logic, auth source routing based on `authMode` |
| `src/main/services/settings-store.ts` | Shared electron-store singleton, avoids circular deps |
| `src/main/services/scheduler.ts` | Periodic refresh timer with rate limit cooldown |
| `src/main/services/logger.ts` | Persistent file logging |
| `src/preload/index.ts` | Exposes `window.claudeBar` API to renderer |

## Implemented Features

### Core Features
- In-app OAuth login (PKCE flow) — no CLI required
- Auth mode selection: `authMode` setting routes quota fetching to in-app OAuth or CLI Keychain
- Real-time quota monitoring (5-hour session + 7-day weekly)
- Menu bar icon with color-coded status (green/orange/red)
- Configurable auto-refresh (5min, 10min, 15min)
- Launch at login option
- Visual feedback (pulse animation + toast) on refresh
- Auto-fit popup window to content

### Display Modes (right-click menu)
- **Standard**: `45% / 32%`
- **Detailed**: `5h: 45% | 7d: 32%`
- **Compact**: `45%` (shows session usage)
- **Time Remaining**: `4h 30m` (time until session reset)
- **Minimal**: Icon only, no text

### Reset Progress Bar
- Shows time elapsed in current quota period
- Thin bar below each quota card
- Helps visualize when quota will roll over

### Token Management
- Two token sources: in-app (encrypted via safeStorage) and CLI Keychain
- User selects auth mode in Settings (no automatic fallback between sources)
- Automatic OAuth token refresh when expired
- Graceful handling on refresh failure
- Login/Logout UI in popup and settings windows

### Error Handling
- Single retry with token refresh on 401 errors
- Rate limit (429) handling with token rotation and cooldown
- Proactive throttling based on rate limit headers
- Detailed logging for debugging
- Contextual error UI with retry button and error-specific messages
- Error indicators in menu bar title and icon on failures
- Error types: network, auth, rate_limit, server, unknown

### Tooltips
Hover over menu bar icon to see:
- Session/Weekly usage percentages
- Time until reset for each quota
- Last updated timestamp

## Not Yet Implemented

The following features are planned but not yet present in the codebase:

- **Notifications service** (`notifications.ts`) — system notifications on threshold crossings
- **History service** (`history.ts`) — usage history tracking, charts, statistics
- **Auto-updater service** (`updater.ts`) — auto-update via electron-updater
- **Trend indicators** — usage direction arrows (↑↓→) in display
- **Adaptive refresh** — automatic interval adjustment based on quota level
- **Pause mode** — temporarily stop monitoring
- **Time-to-critical estimation** — predict when quota will hit critical
- **Configurable thresholds** — warning/critical thresholds are currently hardcoded (70%/90%)

## Data Flow

1. **Startup**: App loads settings, initializes logger and auth service, hides dock icon
2. **Credential Access**: `QuotaService` routes to `AuthService` or `KeychainService` based on `authMode` setting
3. **API Call**: `QuotaService` calls API with rate limit handling
4. **Display Update**: Tray title + tooltip + icon updated
5. **Popup Resize**: Window auto-fits to content height
6. **Auto-refresh**: Scheduler triggers at configured interval

## API Integration

```typescript
// Quota Endpoint
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer {accessToken}
anthropic-beta: oauth-2025-04-20

// Token Refresh Endpoint (CLI / Keychain)
POST https://api.anthropic.com/api/oauth/token
Content-Type: application/x-www-form-urlencoded
grant_type=refresh_token&refresh_token={token}&client_id=claude-code

// Token Exchange (In-App OAuth — PKCE)
POST https://console.anthropic.com/v1/oauth/token
Content-Type: application/x-www-form-urlencoded
grant_type=authorization_code&code={code}&client_id={app_client_id}&redirect_uri={redirect}&code_verifier={verifier}

// Token Refresh (In-App OAuth)
POST https://console.anthropic.com/v1/oauth/token
Content-Type: application/x-www-form-urlencoded
grant_type=refresh_token&refresh_token={token}&client_id={app_client_id}
```

## Keychain Structure

Credentials stored under `Claude Code-credentials`:
```json
{
  "claudeAiOauth": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1234567890,
    "subscriptionType": "pro" | "max"
  },
  "accountUuid": "...",
  "emailAddress": "...",
  "displayName": "..."
}
```

## Quota Levels

| Level | Utilization | Icon Color |
|-------|-------------|------------|
| Normal | < 70% | Green |
| Warning | >= 70% | Orange |
| Critical | >= 90% | Red |

*Thresholds are currently hardcoded in `quota-api.ts` (WARNING_THRESHOLD=70, CRITICAL_THRESHOLD=90)*

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `get-quota` | renderer -> main | Get cached quota data |
| `refresh-quota` | renderer -> main | Force refresh quota |
| `has-credentials` | renderer -> main | Check login status |
| `get-user-info` | renderer -> main | Get user details |
| `get-settings` | renderer -> main | Load all settings |
| `set-refresh-interval` | renderer -> main | Update refresh rate |
| `set-launch-at-login` | renderer -> main | Update startup setting |
| `set-auth-mode` | renderer -> main | Set auth mode ('app' or 'cli') |
| `get-last-error` | renderer -> main | Get last quota error |
| `auth-start-login` | renderer -> main | Start OAuth login (opens browser) |
| `auth-submit-code` | renderer -> main | Submit authorization code |
| `auth-logout` | renderer -> main | Clear in-app tokens |
| `auth-get-state` | renderer -> main | Get current auth state |
| `auth-state-changed` | main -> renderer | Broadcast auth state changes |
| `open-settings` | renderer -> main | Open settings window from popup |
| `popup-content-height` | renderer -> main | Report popup height for auto-fit |
| `quota-updated` | main -> renderer | Broadcast quota updates |
| `quota-error` | main -> renderer | Broadcast quota errors |

## Settings (electron-store)

```typescript
{
  refreshInterval: number       // seconds (300, 600, 900), default: 300
  launchAtLogin: boolean        // default: false
  authMode: 'app' | 'cli'     // default: 'app'
  displayMode: 'standard' | 'detailed' | 'compact' | 'minimal' | 'time-remaining' // default: 'standard'
  rateLimitedUntil: number      // timestamp, internal use
  lastQuotaData: object | null  // persisted quota, internal use
}
```

## Development Commands

```bash
npm run dev          # Development mode with hot reload
npm run build        # Build for production
npm run dist         # Create DMG (arm64 + x64)
npm run release      # Build + publish to GitHub (DMGs + latest-mac.yml + blockmaps)
npm run test         # Run Vitest tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## Build Output

- DMGs built for both `arm64` and `x64` architectures
- Output in `release/` directory
- App ID: `com.claude-bar.app`

## Security Model

- **Context Isolation**: Enabled (renderer cannot access Node.js)
- **Node Integration**: Disabled in renderer
- **Preload Bridge**: All IPC via `contextBridge.exposeInMainWorld`
- **PKCE OAuth**: Authorization code flow with S256 code challenge
- **Encrypted Storage**: In-app tokens encrypted via macOS `safeStorage`
- **Keychain**: Read/write access for CLI token refresh
- **CSP**: connect-src allows `api.anthropic.com` and `console.anthropic.com` only

## File Locations

- **App Data**: `~/Library/Application Support/claude-bar/`
- **Settings**: `config.json` via electron-store
- **Logs**: `logs/claude-bar.log` (max 5MB, rotated)
- **Auth Tokens**: `auth-store.json` via electron-store (encrypted via safeStorage)
- **CLI Credentials**: macOS Keychain (`Claude Code-credentials`)

## Dependencies

**Runtime:**
- `electron-store` - Persistent settings storage
- `electron-log` - File-based logging
- `electron-updater` - Auto-update functionality (not yet wired)

**Dev:**
- `electron` ^40.4.1 - Desktop framework
- `electron-vite` ^5.0.0 - Build tooling
- `electron-builder` ^26.7.0 - DMG packaging
- `typescript` ^5.3.0 - Type safety
- `vite` ^7.3.1 - Frontend bundler
- `vitest` ^4.0.0 - Unit testing framework

## Known Issues

- `cli-probe.ts` is dead code (defined but never imported)
- `openAsHidden` in `setLoginItemSettings()` is deprecated since Electron 29
- Tests re-implement utility functions locally instead of importing from source
- `console.error` used in `scheduler.ts` instead of project logger
- CSS includes styles for unimplemented features (history, trends, update progress)
