import { execFile } from 'child_process'
import { promisify } from 'util'
import { access, constants } from 'fs/promises'
import { logger } from './logger'

const execFileAsync = promisify(execFile)

export interface CliQuotaResult {
  sessionPercent: number | null
  weeklyPercent: number | null
  sessionReset: string | null
  weeklyReset: string | null
}

const CLAUDE_BINARY = 'claude'
const TIMEOUT_MS = 5000

// Common paths where claude binary might be installed
const SEARCH_PATHS = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  `${process.env.HOME}/.local/bin`,
  `${process.env.HOME}/.claude/local`,
  '/usr/bin'
]

// Cached binary path (reset when unavailability cache expires)
let cachedBinaryPath: string | null = null

async function findClaudeBinary(): Promise<string | null> {
  if (cachedBinaryPath) return cachedBinaryPath

  // Try `which` first
  try {
    const { stdout } = await execFileAsync('which', [CLAUDE_BINARY], { encoding: 'utf-8', timeout: 5000 })
    const path = stdout.trim()
    if (path) {
      cachedBinaryPath = path
      return path
    }
  } catch {
    // which failed, try known paths
  }

  for (const dir of SEARCH_PATHS) {
    const fullPath = `${dir}/${CLAUDE_BINARY}`
    try {
      await access(fullPath, constants.X_OK)
      cachedBinaryPath = fullPath
      return fullPath
    } catch {
      continue
    }
  }
  return null
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

function extractPercent(label: string, text: string): number | null {
  // Match patterns like "Current session     45%" or "Current session: 45%"
  const regex = new RegExp(`${label}[:\\s]+([\\d.]+)%`, 'i')
  const match = text.match(regex)
  if (match) return parseFloat(match[1])

  // Also try: "XX% used" near the label
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(label.toLowerCase())) {
      const pctMatch = lines[i].match(/([\d.]+)%/)
      if (pctMatch) return parseFloat(pctMatch[1])
      // Check next line too
      if (i + 1 < lines.length) {
        const nextMatch = lines[i + 1].match(/([\d.]+)%/)
        if (nextMatch) return parseFloat(nextMatch[1])
      }
    }
  }
  return null
}

function extractReset(label: string, text: string): string | null {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(label.toLowerCase())) {
      // Look for "Resets in Xh Ym" pattern in this or next lines
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const resetMatch = lines[j].match(/[Rr]esets?\s+in\s+([\dhm\s]+)/i)
        if (resetMatch) return resetMatch[1].trim()
      }
    }
  }
  return null
}

export function parseCliOutput(rawOutput: string): CliQuotaResult {
  const clean = stripAnsi(rawOutput)

  return {
    sessionPercent: extractPercent('current session', clean) ?? extractPercent('5.hour', clean) ?? extractPercent('session', clean),
    weeklyPercent: extractPercent('current week', clean) ?? extractPercent('7.day', clean) ?? extractPercent('weekly', clean),
    sessionReset: extractReset('session', clean),
    weeklyReset: extractReset('week', clean)
  }
}

// Cache "unavailable" status to avoid retrying every cycle
let cliUnavailable = false
let cliUnavailableUntil = 0
const CLI_UNAVAILABLE_CACHE_MS = 30 * 60 * 1000 // Re-check every 30 minutes

export async function probeCliUsage(): Promise<CliQuotaResult | null> {
  // Skip if we already know /usage isn't available
  if (cliUnavailable && Date.now() < cliUnavailableUntil) {
    return null
  }

  // Reset caches when unavailability period expires
  if (cliUnavailable) {
    cliUnavailable = false
    cachedBinaryPath = null
  }

  const binaryPath = findClaudeBinary()
  if (!binaryPath) {
    logger.debug('Claude CLI not found, skipping CLI probe')
    cliUnavailable = true
    cliUnavailableUntil = Date.now() + CLI_UNAVAILABLE_CACHE_MS
    return null
  }

  return new Promise((resolve) => {
    // Strip CLAUDECODE env var so the CLI doesn't think it's nested
    const env = { ...process.env }
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_OAUTH_TOKEN

    const proc = execFile(
      binaryPath,
      ['--print', '/usage'],
      {
        env,
        timeout: TIMEOUT_MS,
        encoding: 'utf-8',
        maxBuffer: 1024 * 64
      },
      (error, stdout, stderr) => {
        if (error) {
          // "Unknown skill" means /usage isn't available in this version — cache it
          if (stdout?.includes('Unknown skill') || stderr?.includes('Unknown skill')) {
            logger.debug('Claude CLI /usage not available in this version, disabling for 30min')
            cliUnavailable = true
            cliUnavailableUntil = Date.now() + CLI_UNAVAILABLE_CACHE_MS
          } else {
            logger.debug(`CLI probe failed: ${error.message}`)
          }
          resolve(null)
          return
        }

        const output = stdout || ''
        if (!output.trim() || output.includes('Unknown skill')) {
          logger.debug('CLI probe returned no usable data')
          cliUnavailable = true
          cliUnavailableUntil = Date.now() + CLI_UNAVAILABLE_CACHE_MS
          resolve(null)
          return
        }

        const result = parseCliOutput(output)
        if (result.sessionPercent === null && result.weeklyPercent === null) {
          logger.debug('CLI probe could not parse quota percentages')
          resolve(null)
          return
        }

        logger.info(`CLI probe success: session=${result.sessionPercent}%, weekly=${result.weeklyPercent}%`)
        resolve(result)
      }
    )

    // Safety: kill process if it hangs beyond timeout
    setTimeout(() => {
      try { proc.kill('SIGKILL') } catch { /* ignore */ }
    }, TIMEOUT_MS + 1000)
  })
}
