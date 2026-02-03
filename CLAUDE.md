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
    ├── keychain.ts       # macOS Keychain credential access
    ├── quota-api.ts      # Anthropic API integration
    └── scheduler.ts      # Auto-refresh timer

Preload
└── index.ts              # Secure IPC bridge (contextBridge)

Renderer
├── popup/                # Main quota display window
│   ├── index.html
│   ├── renderer.ts
│   └── styles.css
└── settings/             # Settings configuration window
    ├── index.html
    ├── renderer.ts
    └── styles.css
```

## Key Files

| File | Purpose |
|------|---------|
| `src/main/index.ts` | App lifecycle, single instance lock, dock hiding |
| `src/main/tray.ts` | Menu bar icon, title updates, context menu |
| `src/main/services/keychain.ts` | Reads OAuth token from `Claude Code-credentials` in Keychain |
| `src/main/services/quota-api.ts` | Fetches quota from `api.anthropic.com/api/oauth/usage` |
| `src/main/services/scheduler.ts` | Periodic refresh (default 60s) |
| `src/preload/index.ts` | Exposes `window.claudeBar` API to renderer |

## Data Flow

1. **Startup**: App loads settings from `electron-store`, hides dock icon, creates tray
2. **Credential Access**: `KeychainService` reads OAuth token via `security find-generic-password`
3. **API Call**: `QuotaService` calls Anthropic API with Bearer token
4. **Display Update**: Tray title shows `XX% / YY%`, icon color reflects quota level
5. **Auto-refresh**: Scheduler triggers refresh at configurable interval (30s-10min)

## API Integration

```typescript
// Endpoint
GET https://api.anthropic.com/api/oauth/usage

// Headers
Authorization: Bearer {accessToken}
anthropic-beta: oauth-2025-04-20

// Response
{
  five_hour: { utilization: number, resets_at: string },
  seven_day: { utilization: number, resets_at: string }
}
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

| Level | Utilization | Icon Color | Tray Icon |
|-------|-------------|------------|-----------|
| Normal | 0-69% | Green | `iconTemplate.png` |
| Warning | 70-89% | Orange | `icon-warning.png` |
| Critical | 90-100% | Red | `icon-critical.png` |

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `get-quota` | renderer → main | Get cached quota |
| `refresh-quota` | renderer → main | Force refresh |
| `has-credentials` | renderer → main | Check if logged in |
| `get-user-info` | renderer → main | Get user details |
| `get-settings` | renderer → main | Load settings |
| `set-settings` | renderer → main | Save settings |
| `get-app-info` | renderer → main | Get version info |

## Settings (electron-store)

```typescript
{
  refreshInterval: number  // seconds, default: 60
  launchAtLogin: boolean   // default: false
}
```

## Development Commands

```bash
npm run dev       # Development mode with hot reload
npm run build     # Build for production
npm run dist      # Create DMG (arm64 + x64)
```

## Build Output

- DMGs built for both `arm64` and `x64` architectures
- Output in `release/` directory
- App ID: `com.claude-bar.app`

## Security Model

- **Context Isolation**: Enabled (renderer cannot access Node.js)
- **Node Integration**: Disabled in renderer
- **Preload Bridge**: All IPC via `contextBridge.exposeInMainWorld`
- **Keychain**: Read-only access to Claude Code credentials

## File Locations

- **App Data**: `~/Library/Application Support/claude-bar/`
- **Settings**: Stored via electron-store in app data
- **Credentials**: macOS Keychain (`Claude Code-credentials`)

## Dependencies

**Runtime:**
- `electron-store` - Persistent settings storage

**Dev:**
- `electron` - Desktop framework
- `electron-vite` - Build tooling
- `electron-builder` - DMG packaging
- `typescript` - Type safety
- `vite` - Frontend bundler
