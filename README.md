# Claude Bar

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-lightgrey" alt="Platform: macOS">
  <img src="https://img.shields.io/badge/electron-28-blue" alt="Electron 28">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT">
</p>

<p align="center">
  <strong>Monitor your Claude Code quotas directly from the macOS menu bar.</strong>
</p>

<p align="center">
  <img src="assets/screenshot.png" alt="Claude Bar Screenshot" width="400">
</p>

---

## Features

### Core
- **In-App Login** — Log in directly from Claude Bar with OAuth (no CLI needed)
- **Menu Bar Display** — Shows your current quota usage right in the menu bar
- **Detailed Popup** — Click to see session (5h) and weekly (7d) quotas with progress bars
- **Smart Color Coding** — Progress bars change from green → orange → red as usage increases
- **Auto Refresh** — Configurable refresh interval (30s to 10min) with adaptive mode
- **Visual Feedback** — Pulse animation and toast notification on successful refresh
- **Rich Tooltips** — Hover for detailed info including trends and time estimates
- **Dark Mode** — Seamlessly adapts to your macOS appearance
- **Lightweight** — Runs quietly in the background with minimal resource usage
- **Native Feel** — Uses macOS vibrancy effects for a native look

### Display Modes
Choose your preferred menu bar format (right-click → Display Mode):
- **Standard**: `45% / 32%`
- **Detailed**: `5h: 45%↑ | 7d: 32%→` (with trend indicators)
- **Compact**: `45%` (shows highest usage only)
- **Time Remaining**: `4h 30m` (time until session reset)
- **Minimal**: Icon only, no text

### Usage Statistics
- Track quota usage over time with persistent storage
- 24-hour statistics: average and peak values
- **Trend indicators**: ↑ rising, ↓ falling, → stable
- **Time to critical**: Estimates when you'll reach critical level
- **Reset progress bar**: Visual indicator of time elapsed in current period

### Pause Mode
Right-click → Pause to temporarily stop monitoring:
- Pause for 30 minutes, 1 hour, 2 hours, or indefinitely
- Notifications are suppressed while paused
- Menu bar shows pause status with remaining time

### Adaptive Refresh
When enabled (default), refresh rate increases automatically:
- **Normal**: Uses your configured interval
- **Warning (70%+)**: Refreshes 2x faster
- **Critical (90%+)**: Refreshes 4x faster

### Notifications
- **Customizable thresholds**: Set your own warning and critical levels (50-99%)
- Warning alert at configurable threshold (default 70%)
- Critical alert at configurable threshold (default 90%)
- Quota recovery notifications (when usage drops back to normal levels)
- Token refresh failure alerts (with cooldown to prevent spam)
- Toggle on/off in Settings

### Auto-Updates
- Automatic update checks on startup
- **Manual check button** in Settings (auto-hides during download and when update is ready)
- Background download with **gradient progress bar** and real-time percentage
- One-click install from Settings

## Requirements

- macOS 10.13 or later
- A Claude Pro or Max subscription

## Installation

### From DMG (Recommended)

1. Download the latest DMG from [Releases](https://github.com/TimothePorterie/claude-bar/releases):
   - **Apple Silicon (M1/M2/M3):** `Claude.Bar-x.x.x-arm64.dmg`
   - **Intel:** `Claude.Bar-x.x.x-x64.dmg`
2. Open the DMG and drag **Claude Bar** to your Applications folder
3. **Important (Apple Silicon):** The app is not notarized. Before first launch, run:
   ```bash
   xattr -cr /Applications/Claude\ Bar.app
   codesign --force --deep --sign - /Applications/Claude\ Bar.app
   ```
4. Launch Claude Bar from Applications

### From Source

```bash
# Clone the repository
git clone https://github.com/TimothePorterie/claude-bar.git
cd claude-bar

# Install dependencies
npm install

# Run in development mode
npm run dev

# Or build the DMG
npm run dist
```

## Setup

### Option 1: Log in from Claude Bar (Recommended)

1. Launch Claude Bar
2. Click the menu bar icon — the popup shows a **Log In** button
3. Click **Log In** — your browser opens to authenticate with Claude
4. Copy the authorization code and paste it back in Settings
5. Done! Claude Bar starts monitoring your quotas

### Option 2: Use Claude Code CLI credentials

If you already use Claude Code CLI, Claude Bar can reuse your existing credentials:

```bash
claude login
```

Claude Bar automatically detects credentials stored in the macOS Keychain. No additional configuration needed!

## Usage

| Action | Result |
|--------|--------|
| **Left-click** on menu bar icon | Opens quota popup and refreshes data |
| **Right-click** on menu bar icon | Shows context menu (Refresh, Settings, Quit) |

### Menu Bar Display

The menu bar shows two percentages:
- **First number**: Session quota (5-hour rolling window)
- **Second number**: Weekly quota (7-day rolling window)

### Quota Levels

| Usage | Color | Meaning |
|-------|-------|---------|
| Below warning | 🟢 Green | Normal usage |
| Warning level | 🟠 Orange | Approaching limit |
| Critical level | 🔴 Red | Near or at limit |

*Default thresholds: Warning at 70%, Critical at 90% (customizable in Settings)*

### Settings

Access settings via right-click → Settings:

- **Refresh Interval**: How often to fetch new quota data (30s - 10min)
- **Adaptive Refresh**: Automatically increase refresh rate at warning/critical levels
- **Authentication Method**: Choose between Claude Bar (OAuth) or CLI (Keychain)
- **Launch at Login**: Automatically start Claude Bar when you log in
- **Notifications**: Enable/disable system notifications for quota alerts
- **Alert Thresholds**: Customize warning (default 70%) and critical (default 90%) levels
- **Show "Est. critical" prediction**: Toggle the time-to-critical estimation display
- **Updates**: Check for updates manually and install with one click

## How It Works

Claude Bar authenticates via OAuth with the Anthropic API. You can either log in directly from the app (tokens encrypted via macOS `safeStorage`) or reuse Claude Code CLI credentials from the macOS Keychain. It periodically calls the Anthropic API to fetch your current usage:

```
GET https://api.anthropic.com/api/oauth/usage
```

No API keys or manual configuration required!

### Sleep/Wake & Cold Boot Handling

Claude Bar handles macOS sleep/wake and cold boot gracefully:
- Monitoring stops when the Mac goes to sleep
- Resumes automatically after wake (with a short delay for network reconnection)
- On cold boot (Launch at Login), startup is delayed to allow network initialization
- Network errors during token refresh are treated as transient (no false auth notifications)

### Token Management

Claude Bar automatically handles token refresh:
- Detects expired OAuth tokens
- Refreshes tokens using the refresh token
- Updates stored credentials (Keychain or encrypted store)
- Graceful fallback if refresh fails (with 30-minute cooldown on error notifications)

### Authentication Sources

Claude Bar supports two credential sources, selectable in Settings:

| Source | Storage | Token Refresh | Login/Logout |
|--------|---------|---------------|--------------|
| **Claude Bar (OAuth)** | Encrypted via `safeStorage` | Automatic | Via Settings |
| **CLI (Keychain)** | macOS Keychain | Automatic | Via `claude login` |

Choose your preferred method in **Settings → Authentication method**. No automatic fallback between sources — the selected method is the only one used.

### Security

- **Context Isolation**: Renderer cannot access Node.js
- **Preload Bridge**: All IPC via secure contextBridge
- **Encrypted Token Storage**: In-app tokens encrypted via macOS `safeStorage`
- **Keychain Storage**: CLI credentials stored in macOS Keychain
- **PKCE OAuth Flow**: Secure authorization code flow with code challenge
- **Signed Updates**: Auto-updates are signed and verified

## Development

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Create distributable DMG
npm run dist

# Build and publish release to GitHub (creates release, uploads DMGs + metadata)
npm run release
```

### Project Structure

```
claude-bar/
├── src/
│   ├── main/           # Electron main process
│   │   ├── services/   # Auth, Keychain, API, Scheduler, History, Notifications, Updater
│   │   ├── tray.ts     # Menu bar icon management
│   │   └── windows.ts  # Popup & Settings windows
│   ├── preload/        # Secure IPC bridge
│   └── renderer/       # UI (popup & settings)
├── tests/              # Vitest unit tests
├── assets/             # Icons
└── scripts/            # Icon generation scripts
```

### Running Tests

```bash
npm run test           # Run all tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
```

## Troubleshooting

### "Not Connected" message

Click **Log In** in the popup or Settings window to authenticate directly. Alternatively, authenticate via the CLI:
```bash
claude login
```
Then restart Claude Bar.

### Quota not updating

Try right-clicking the menu bar icon and selecting "Refresh". If the issue persists, check your internet connection.

### "Cannot open application" error

On Apple Silicon Macs, you may see this error because the app is not notarized. Run these commands in Terminal:
```bash
xattr -cr /Applications/Claude\ Bar.app
codesign --force --deep --sign - /Applications/Claude\ Bar.app
```
Then try opening the app again.

### App not starting

If the app fails to start, try removing it from Login Items and re-adding it through Settings.

## License

MIT License — see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/) and [electron-vite](https://electron-vite.org/)
- Inspired by the need to keep an eye on Claude Code usage without interrupting workflow

---

<p align="center">
  Made with ❤️ for Claude Code users
</p>
