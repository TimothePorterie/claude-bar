# Claude Bar - Technical Documentation

This document provides technical context for AI assistants and developers working on Claude Bar.

## Project Overview

**Claude Bar** is a macOS menu bar application built with Electron that monitors Claude Code quotas in real-time. It displays session (5-hour) and weekly (7-day) quota usage directly from the menu bar.

- **Platform**: macOS 10.13+
- **Framework**: Electron 28 + electron-vite 2.0
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
    ├── quota-api.ts      # Anthropic API integration with retry logic
    ├── settings-store.ts # Shared settings store (electron-store singleton)
    ├── scheduler.ts      # Auto-refresh timer
    ├── logger.ts         # Persistent logging with electron-log
    ├── notifications.ts  # macOS system notifications
    ├── history.ts        # Usage history tracking
    └── updater.ts        # Auto-update functionality

Preload
└── index.ts              # Secure IPC bridge (contextBridge)

Renderer
├── popup/                # Main quota display window
│   ├── index.html        # With skeleton loading & history chart
│   ├── renderer.ts
│   └── styles.css
└── settings/             # Settings configuration window
    ├── index.html        # With notifications toggle & update status
    ├── renderer.ts
    └── styles.css

Tests
└── tests/                # Vitest unit tests
    ├── history.test.ts
    ├── notifications.test.ts
    └── quota-api.test.ts
```

## Key Files

| File | Purpose |
|------|---------|
| `src/main/index.ts` | App lifecycle, single instance lock, dock hiding |
| `src/main/tray.ts` | Menu bar icon, title updates, context menu, display modes, pause menu |
| `src/main/windows.ts` | Popup and settings windows, auto-fit content height |
| `src/main/services/auth.ts` | In-app OAuth login (PKCE flow), encrypted token storage, refresh |
| `src/main/services/keychain.ts` | CLI OAuth token access + automatic refresh (fallback) |
| `src/main/services/quota-api.ts` | API calls with retry logic, auth source based on authMode setting |
| `src/main/services/settings-store.ts` | Shared electron-store singleton, avoids circular deps |
| `src/main/services/scheduler.ts` | Periodic refresh, adaptive intervals, pause/resume |
| `src/main/services/logger.ts` | Persistent file logging |
| `src/main/services/notifications.ts` | System notifications, customizable thresholds, pause support |
| `src/main/services/history.ts` | Usage history, trend calculation, time-to-threshold estimation |
| `src/main/services/updater.ts` | Auto-update via electron-updater, download progress callback |
| `src/preload/index.ts` | Exposes `window.claudeBar` API to renderer |

## Features

### Core Features
- In-app OAuth login (PKCE flow) — no CLI required
- Auth mode selection: choose between in-app OAuth or CLI Keychain (no auto-fallback)
- Real-time quota monitoring (5-hour session + 7-day weekly)
- Menu bar icon with color-coded status (green/orange/red)
- Configurable auto-refresh (30s to 10min) with adaptive mode
- Launch at login option
- Visual feedback (pulse animation + toast) on refresh
- Auto-fit popup window to content

### Display Modes (right-click menu)
- **Standard**: `45% / 32%`
- **Detailed**: `5h: 45%↑ | 7d: 32%→` (with trend indicators)
- **Compact**: `45%` (shows session usage)
- **Time Remaining**: `4h 30m` (time until session reset)
- **Minimal**: Icon only, no text

### Trend Indicators
- Analyzes usage over last 30 minutes
- Shows direction: ↑ (rising), ↓ (falling), → (stable)
- Displayed in popup, detailed mode title, and tooltip
- Threshold: ±2% per hour for stable

### Notifications
- Customizable warning threshold (50-99%, default: 70%)
- Customizable critical threshold (50-99%, default: 90%)
- Quota reset notifications
- Token refresh failure alerts
- Respects pause mode (suppressed while paused)

### Adaptive Refresh
- Automatically increases refresh rate based on quota level
- Normal: uses configured interval
- Warning: 2x faster (min 30s)
- Critical: 4x faster (min 15s)
- Toggle on/off in settings

### Pause Mode
- Temporarily stop monitoring and notifications
- Duration options: 30min, 1h, 2h, or indefinite
- Shows pause status in menu bar with countdown
- Auto-resume after duration expires

### Time to Critical
- Estimates when quota will reach critical level
- Based on current trend (delta per hour)
- Only shown when trending up and < 24h away
- Can be toggled off in settings

### Reset Progress Bar
- Shows time elapsed in current quota period
- Thin bar below each quota card
- Helps visualize when quota will roll over

### Usage History
- Tracks quota over time with persistent storage
- Chart visualization (1h, 6h, 24h periods)
- Statistics: average, peak, min values
- Trend calculation from historical data

### Enhanced Tooltips
Hover over menu bar icon to see:
- Session/Weekly usage with trend arrows
- Time until reset for each quota
- Estimated time to critical (if applicable)
- Next refresh countdown
- Pause status (if paused)
- Last updated timestamp

### Token Management
- Two token sources: in-app (encrypted via safeStorage) and CLI Keychain
- User selects auth mode in Settings (no automatic fallback between sources)
- Automatic OAuth token refresh when expired
- Graceful handling on refresh failure
- Login/Logout UI in popup and settings windows

### Error Handling
- Exponential backoff retry (up to 3 attempts)
- Automatic token refresh on 401 errors
- Detailed logging for debugging
- Contextual error UI with retry button and error-specific messages
- Error indicators in menu bar title (`!`) and icon (red) on silent failures
- Error types: network, auth, rate_limit, server, unknown

### Auto-Updates
- Automatic update checks on startup
- Background download with gradient progress bar (8px)
- Check button auto-hides during download and when update is ready
- One-click install from Settings

## Data Flow

1. **Startup**: App loads settings (including thresholds), initializes logger and auth service, hides dock icon
2. **Credential Access**: `AuthService` or `KeychainService` provides OAuth token (based on `authMode` setting)
3. **API Call**: `QuotaService` calls API with retry logic
4. **History Recording**: Usage data stored for trend analysis and charts
5. **Trend Calculation**: `HistoryService.getTrend()` analyzes last 30 min
6. **Notification Check**: Alerts sent on threshold crossings (respects pause mode)
7. **Adaptive Refresh**: Scheduler adjusts interval based on quota level
8. **Display Update**: Tray title (with trends) + tooltip + icon updated
9. **Popup Resize**: Window auto-fits to content height
10. **Auto-refresh**: Scheduler triggers at configured/adaptive interval

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

| Level | Utilization | Icon Color | Notification |
|-------|-------------|------------|--------------|
| Normal | Below warning threshold | Green | None |
| Warning | At/above warning threshold | Orange | Warning alert |
| Critical | At/above critical threshold | Red | Critical alert |

*Thresholds are customizable in Settings (default: warning=70%, critical=90%)*

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `get-quota` | renderer → main | Fetch quota (with cache) |
| `refresh-quota` | renderer → main | Force refresh |
| `get-cached-quota` | renderer → main | Get cached data only |
| `has-credentials` | renderer → main | Check login status |
| `get-user-info` | renderer → main | Get user details |
| `get-settings` | renderer → main | Load all settings |
| `set-refresh-interval` | renderer → main | Update refresh rate |
| `set-launch-at-login` | renderer → main | Update startup setting |
| `set-notifications-enabled` | renderer → main | Toggle notifications |
| `get-thresholds` | renderer → main | Get warning/critical thresholds |
| `set-warning-threshold` | renderer → main | Update warning threshold |
| `set-critical-threshold` | renderer → main | Update critical threshold |
| `set-adaptive-refresh` | renderer → main | Toggle adaptive refresh |
| `set-auth-mode` | renderer → main | Set auth mode ('app' or 'cli') |
| `set-show-time-to-critical` | renderer → main | Toggle time-to-critical display |
| `get-history` | renderer → main | Get usage history |
| `get-history-chart-data` | renderer → main | Get chart-ready data |
| `get-history-stats` | renderer → main | Get statistics |
| `clear-history` | renderer → main | Clear history data |
| `get-trend` | renderer → main | Get trend data (30min lookback) |
| `get-time-to-critical` | renderer → main | Get time estimate to critical |
| `pause-monitoring` | renderer → main | Pause with optional duration |
| `resume-monitoring` | renderer → main | Resume monitoring |
| `get-pause-status` | renderer → main | Get pause state |
| `check-for-updates` | renderer → main | Check for app updates |
| `get-update-status` | renderer → main | Get update state |
| `install-update` | renderer → main | Install pending update |
| `update-download-progress` | main → renderer | Broadcast download progress (percent) |
| `get-log-path` | renderer → main | Get log file location |
| `popup-content-height` | renderer → main | Report popup height for auto-fit |
| `auth-start-login` | renderer → main | Start OAuth login (opens browser) |
| `auth-submit-code` | renderer → main | Submit authorization code |
| `auth-logout` | renderer → main | Clear in-app tokens |
| `auth-get-state` | renderer → main | Get current auth state |
| `auth-state-changed` | main → renderer | Broadcast auth state changes |
| `open-settings` | renderer → main | Open settings window from popup |

## Settings (electron-store)

```typescript
{
  refreshInterval: number       // seconds, default: 60
  launchAtLogin: boolean        // default: false
  notificationsEnabled: boolean // default: true
  warningThreshold: number      // 50-99, default: 70
  criticalThreshold: number     // 50-99, default: 90
  adaptiveRefresh: boolean      // default: true
  showTimeToCritical: boolean   // default: true
  authMode: 'app' | 'cli'     // default: 'app'
  displayMode: 'standard' | 'detailed' | 'compact' | 'minimal' | 'time-remaining' // default: 'standard'
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
- **Keychain**: Read/write access for CLI token refresh (fallback)
- **CSP**: connect-src allows `api.anthropic.com` and `console.anthropic.com` only
- **Auto-Update**: Signed updates from GitHub Releases

## File Locations

- **App Data**: `~/Library/Application Support/claude-bar/`
- **Settings**: `config.json` via electron-store
- **History**: `quota-history.json` via electron-store
- **Logs**: `logs/claude-bar.log` (max 5MB, rotated)
- **Auth Tokens**: `auth-store.json` via electron-store (encrypted via safeStorage)
- **CLI Credentials**: macOS Keychain (`Claude Code-credentials`)

## Dependencies

**Runtime:**
- `electron-store` - Persistent settings and history storage
- `electron-log` - File-based logging
- `electron-updater` - Auto-update functionality

**Dev:**
- `electron` - Desktop framework
- `electron-vite` - Build tooling
- `electron-builder` - DMG packaging
- `typescript` - Type safety
- `vite` - Frontend bundler
- `vitest` - Unit testing framework
