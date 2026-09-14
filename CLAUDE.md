# Claude Bar - Technical Documentation

This document provides technical context for AI assistants and developers working on Claude Bar.

## Project Overview

**Claude Bar** is a macOS menu bar application built with Electron that monitors Claude Code quotas in real-time. It displays session (5-hour) and weekly (7-day) quota usage directly from the menu bar.

- **Platform**: macOS 10.13+
- **Framework**: Electron 42 + electron-vite 5.0
- **Language**: TypeScript 5.3
- **License**: MIT

## Architecture

```
Main Process (Electron)
├── index.ts              # App entry point, single instance lock, wake-from-sleep restart
├── tray.ts               # Menu bar icon and context menu
├── windows.ts            # Popup/settings windows, toggle + auto-hide, security hooks
├── ipc-handlers.ts       # IPC communication with renderer
└── services/
    ├── auth.ts           # In-app OAuth login (PKCE), token storage, refresh
    ├── keychain.ts       # READ-ONLY access to Claude Code's Keychain credentials
    ├── quota-api.ts      # Anthropic API integration, auth routing, cache, throttling
    ├── settings-store.ts # Shared settings store (electron-store singleton)
    ├── scheduler.ts      # Auto-refresh timer with error backoff
    ├── notifications.ts  # System notifications on threshold crossings
    ├── updater.ts        # Auto-update via electron-updater + GitHub Releases
    └── logger.ts         # Persistent logging with electron-log

Shared
├── types.ts              # QuotaInfo / QuotaError types shared main <-> renderer
└── i18n.ts               # en/fr strings, t(), applyI18n()

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
└── tests/                # Vitest unit tests (import real modules, mock electron/Keychain/store)
    ├── quota-api.test.ts
    └── notifications.test.ts
```

## Key Files

| File | Purpose |
|------|---------|
| `src/main/index.ts` | App lifecycle, single instance lock, dock hiding |
| `src/main/tray.ts` | Menu bar icon, title updates, context menu, display modes |
| `src/main/windows.ts` | Popup and settings windows, auto-fit height, toggle, auto-hide on Space/display change, CSP + navigation guard |
| `src/main/services/auth.ts` | In-app OAuth login (PKCE flow), encrypted token storage, refresh |
| `src/main/services/keychain.ts` | Reads Claude Code's Keychain credentials (never refreshes or writes) |
| `src/main/services/quota-api.ts` | API calls, auth source routing based on `authMode`, cached quota + last error |
| `src/main/services/notifications.ts` | Threshold notifications, levels persisted in `notifiedLevels` |
| `src/main/services/settings-store.ts` | Shared electron-store singleton, avoids circular deps |
| `src/main/services/scheduler.ts` | Periodic refresh timer with rate limit cooldown |
| `src/main/services/updater.ts` | Auto-update via electron-updater, download progress, install & restart |
| `src/main/services/logger.ts` | Persistent file logging |
| `src/preload/index.ts` | Exposes `window.claudeBar` API to renderer |

## Implemented Features

### Core Features
- In-app OAuth login (PKCE flow) — no CLI required
- Auth mode selection in Settings: `authMode` routes quota fetching, credential status and user info to in-app OAuth or CLI Keychain
- System notifications when a quota crosses warning/critical (once per level, persisted across restarts)
- English / French UI
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
- In-app mode: automatic OAuth token refresh when expired
- **CLI mode is read-only.** Claude Code owns the `Claude Code-credentials` Keychain item and rotates its tokens. Never refresh or write it from Claude Bar: refreshing rotates the CLI's refresh token and logs Claude Code out. An expired CLI token is reported as an auth error asking the user to run `claude`; on 401 the Keychain is re-read in case Claude Code rotated the token
- Login/Logout UI in popup and settings windows (logout hidden in CLI mode)
- Login, logout and auth mode change clear the cached quota and trigger a refresh

### Error Handling
- Single retry on 401 (in-app: token refresh; CLI: Keychain re-read)
- Rate limit (429): cooldown from `retry-after` (2 min floor, 1 h cap), persisted across restarts. No token rotation
- Proactive throttling based on rate limit headers
- `getCachedQuota()` carries the last error, so stale data is flagged (`⚠` prefix in the menu bar, warning icon, tooltip line, popup banner)
- Scheduler: exponential backoff on retryable errors; retry timers cleared on success and on wake from sleep
- Throttle: scheduled fetches need ~5 min since the last success (290 s, slack for request latency); manual refresh 15 s
- `five_hour.resets_at` can be `null` when no session window is active: displayed as `—`
- Error types: network, auth, rate_limit, server, unknown

### Auto-Updates
- Automatic update check on startup (5s delay)
- Manual check via Settings or tray context menu
- Background download with progress bar
- One-click install & restart from Settings
- Updates sourced from GitHub Releases (signed DMG + ZIP)

### Tooltips
Hover over menu bar icon to see:
- Session/Weekly usage percentages
- Time until reset for each quota
- Last updated timestamp

## Not Yet Implemented

The following features are planned but not yet present in the codebase:

- **History service** (`history.ts`) — usage history tracking, charts, statistics
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
| `set-auth-mode` | renderer -> main | Set auth mode ('app' or 'cli'), clears cache and refreshes |
| `set-enable-notifications` | renderer -> main | Toggle threshold notifications |
| `set-language` | renderer -> main | Set UI language ('en' or 'fr'), recreates the popup |
| `get-last-error` | renderer -> main | Get last quota error |
| `auth-start-login` | renderer -> main | Start OAuth login (opens browser) |
| `auth-submit-code` | renderer -> main | Submit authorization code |
| `auth-logout` | renderer -> main | Clear in-app tokens |
| `auth-get-state` | renderer -> main | Get current auth state |
| `auth-state-changed` | main -> renderer | Broadcast auth state changes |
| `check-for-updates` | renderer -> main | Trigger update check |
| `download-update` | renderer -> main | Start downloading available update |
| `install-update` | renderer -> main | Install downloaded update & restart |
| `get-update-status` | renderer -> main | Get current update state |
| `get-app-version` | renderer -> main | Get app version string |
| `update-status-changed` | main -> renderer | Broadcast update status changes |
| `open-settings` | renderer -> main | Open settings window from popup |
| `popup-content-height` | renderer -> main | Report popup height for auto-fit |
| `quota-updated` | main -> renderer | Broadcast quota updates |
| `quota-error` | main -> renderer | Broadcast quota errors |

## Settings (electron-store)

```typescript
{
  refreshInterval: number       // seconds (300, 600, 900), default: 300
  launchAtLogin: boolean        // default: false, synced from system Login Items at startup
  authMode: 'app' | 'cli'       // default: 'app'
  enableNotifications: boolean  // default: true
  language: 'en' | 'fr'         // default: 'en'
  displayMode: 'standard' | 'detailed' | 'compact' | 'minimal' | 'time-remaining' // default: 'standard'
  rateLimitedUntil: number      // timestamp, internal use
  lastQuotaData: object | null  // persisted quota, internal use
  notifiedLevels: object        // last notified level per quota, internal use
}
```

## Development Commands

```bash
npm run dev          # Development mode with hot reload
npm run build        # Build for production
npm run dist         # Create DMG (arm64 + x64)
npm run release      # Build + publish to GitHub (DMGs + latest-mac.yml + blockmaps)
npm run typecheck    # tsc on app sources and electron.vite.config.ts
npm run test         # Run Vitest tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## CI

- `.github/workflows/ci.yml`: typecheck, tests and build on every PR and push to `main` (Ubuntu, no Electron binary)
- `.github/workflows/release.yml`: on `v*` tag, signed + notarized build published to GitHub Releases (macOS runner). The release is pre-created as a draft and published after upload: letting electron-builder create it produced duplicate releases (parallel uploads)
- Actions are pinned by commit SHA
- `electron-builder` must stay >= 26.16.1: older versions pass the wrong password to `security set-key-partition-list` and break CSC_LINK signing on macOS 26 runners

## Build Output

- DMGs built for both `arm64` and `x64` architectures
- Output in `release/` directory
- App ID: `com.claude-bar.app`

## Security Model

- **Electron fuses** (`electron-builder.json`): RunAsNode, NODE_OPTIONS and `--inspect` disabled; embedded asar integrity validation, only-load-from-asar and cookie encryption enabled
- **Entitlements**: only `allow-jit` and `network.client`
- **Context Isolation**: Enabled (renderer cannot access Node.js)
- **Node Integration**: Disabled in renderer
- **Preload Bridge**: All IPC via `contextBridge.exposeInMainWorld`
- **PKCE OAuth**: Authorization code flow with S256 code challenge
- **Encrypted Storage**: In-app tokens encrypted via macOS `safeStorage`
- **Keychain**: Read-only access to Claude Code's credentials
- **CSP**: `<meta>` tag in each renderer HTML (the `onHeadersReceived` header does not apply to `loadFile` pages); connect-src allows `api.anthropic.com` and `console.anthropic.com` only
- **Navigation**: `will-navigate` only allows `file:` and, in development, the exact dev server origin

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
- `electron-updater` - Auto-update functionality

**Dev:**
- `electron` ^42 - Desktop framework
- `electron-vite` ^5.0.0 - Build tooling (supports vite 5–7 only: vite 8 requires electron-vite 6)
- `electron-builder` ^26.16.1 - DMG packaging
- `typescript` ^5.3.0 - Type safety
- `vite` ^7 - Frontend bundler
- `vitest` ^4 - Unit testing framework

Local installs: npm's `allowScripts` blocks Electron's postinstall, so `node_modules/electron/dist` may be missing after `npm ci`. Run `npm install-scripts approve electron` once.

## Known Issues

- CSS includes styles for unimplemented trend indicators (`.trend-indicator`)
