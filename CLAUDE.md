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
    ├── keychain.ts       # macOS Keychain credential access + token refresh
    ├── quota-api.ts      # Anthropic API integration with retry logic
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
| `src/main/tray.ts` | Menu bar icon, title updates, context menu, display modes |
| `src/main/services/keychain.ts` | OAuth token access + automatic refresh |
| `src/main/services/quota-api.ts` | API calls with retry logic + notifications |
| `src/main/services/scheduler.ts` | Periodic refresh (default 60s) |
| `src/main/services/logger.ts` | Persistent file logging |
| `src/main/services/notifications.ts` | System notifications for quota alerts |
| `src/main/services/history.ts` | Usage history storage and chart data |
| `src/main/services/updater.ts` | Auto-update via electron-updater |
| `src/preload/index.ts` | Exposes `window.claudeBar` API to renderer |

## Features

### Core Features
- Real-time quota monitoring (5-hour session + 7-day weekly)
- Menu bar icon with color-coded status (green/orange/red)
- Configurable auto-refresh (30s to 10min)
- Launch at login option

### Display Modes (right-click menu)
- **Standard**: `45% / 32%`
- **Detailed**: `5h: 45% | 7d: 32%`
- **Compact**: `45%` (shows highest)

### Notifications
- Warning alert at 70% utilization
- Critical alert at 90% utilization
- Quota reset notifications
- Token refresh failure alerts

### Usage History
- Tracks quota over time with persistent storage
- Chart visualization (1h, 6h, 24h periods)
- Statistics: average, peak, min values

### Token Management
- Automatic OAuth token refresh when expired
- Updates Keychain with refreshed tokens
- Graceful fallback on refresh failure

### Error Handling
- Exponential backoff retry (up to 3 attempts)
- Automatic token refresh on 401 errors
- Detailed logging for debugging

### Auto-Updates
- Automatic update checks on startup
- Background download of updates
- One-click install from Settings

## Data Flow

1. **Startup**: App loads settings, initializes logger, hides dock icon
2. **Credential Access**: `KeychainService` reads/refreshes OAuth token
3. **API Call**: `QuotaService` calls API with retry logic
4. **History Recording**: Usage data stored for chart visualization
5. **Notification Check**: Alerts sent on threshold crossings
6. **Display Update**: Tray title + tooltip + icon updated
7. **Auto-refresh**: Scheduler triggers at configured interval

## API Integration

```typescript
// Quota Endpoint
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer {accessToken}
anthropic-beta: oauth-2025-04-20

// Token Refresh Endpoint
POST https://api.anthropic.com/api/oauth/token
Content-Type: application/x-www-form-urlencoded
grant_type=refresh_token&refresh_token={token}&client_id=claude-code
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
| Normal | 0-69% | Green | None |
| Warning | 70-89% | Orange | Warning alert |
| Critical | 90-100% | Red | Critical alert |

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
| `get-history` | renderer → main | Get usage history |
| `get-history-chart-data` | renderer → main | Get chart-ready data |
| `get-history-stats` | renderer → main | Get statistics |
| `clear-history` | renderer → main | Clear history data |
| `check-for-updates` | renderer → main | Check for app updates |
| `get-update-status` | renderer → main | Get update state |
| `install-update` | renderer → main | Install pending update |
| `get-log-path` | renderer → main | Get log file location |

## Settings (electron-store)

```typescript
{
  refreshInterval: number       // seconds, default: 60
  launchAtLogin: boolean        // default: false
  notificationsEnabled: boolean // default: true
  displayMode: 'standard' | 'detailed' | 'compact' // default: 'standard'
}
```

## Development Commands

```bash
npm run dev          # Development mode with hot reload
npm run build        # Build for production
npm run dist         # Create DMG (arm64 + x64)
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
- **Keychain**: Read/write access for token refresh
- **Auto-Update**: Signed updates from GitHub Releases

## File Locations

- **App Data**: `~/Library/Application Support/claude-bar/`
- **Settings**: `config.json` via electron-store
- **History**: `quota-history.json` via electron-store
- **Logs**: `logs/claude-bar.log` (max 5MB, rotated)
- **Credentials**: macOS Keychain (`Claude Code-credentials`)

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
