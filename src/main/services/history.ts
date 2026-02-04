import Store from 'electron-store'
import { logger } from './logger'

export interface HistoryEntry {
  timestamp: number
  fiveHour: number
  sevenDay: number
}

export type TrendDirection = 'up' | 'down' | 'stable'

export interface TrendData {
  fiveHour: {
    direction: TrendDirection
    delta: number // change per hour
  }
  sevenDay: {
    direction: TrendDirection
    delta: number // change per hour
  }
}

export interface TimeToThreshold {
  fiveHour: number | null // hours until threshold, null if not applicable
  sevenDay: number | null // hours until threshold, null if not applicable
}

interface HistoryStoreSchema {
  entries: HistoryEntry[]
}

const MAX_ENTRIES = 1000 // ~16 hours at 1 minute intervals, or ~7 days at 10 minute intervals

export class HistoryService {
  private store: Store<HistoryStoreSchema>

  constructor() {
    this.store = new Store<HistoryStoreSchema>({
      name: 'quota-history',
      defaults: {
        entries: []
      }
    })
  }

  addEntry(fiveHour: number, sevenDay: number): void {
    const entries = this.store.get('entries')
    const now = Date.now()

    // Avoid duplicates within 30 seconds
    const lastEntry = entries[entries.length - 1]
    if (lastEntry && now - lastEntry.timestamp < 30000) {
      return
    }

    entries.push({
      timestamp: now,
      fiveHour: Math.round(fiveHour * 100) / 100,
      sevenDay: Math.round(sevenDay * 100) / 100
    })

    // Trim old entries
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES)
    }

    this.store.set('entries', entries)
    logger.debug(`History entry added: 5h=${fiveHour}%, 7d=${sevenDay}%`)
  }

  getEntries(since?: number): HistoryEntry[] {
    const entries = this.store.get('entries')
    if (!since) return entries
    return entries.filter((e) => e.timestamp >= since)
  }

  getEntriesForPeriod(hours: number): HistoryEntry[] {
    const since = Date.now() - hours * 60 * 60 * 1000
    return this.getEntries(since)
  }

  getLatestEntry(): HistoryEntry | null {
    const entries = this.store.get('entries')
    return entries.length > 0 ? entries[entries.length - 1] : null
  }

  clearHistory(): void {
    this.store.set('entries', [])
    logger.info('History cleared')
  }

  getStats(hours: number): {
    avgFiveHour: number
    avgSevenDay: number
    maxFiveHour: number
    maxSevenDay: number
    minFiveHour: number
    minSevenDay: number
    entryCount: number
  } | null {
    const entries = this.getEntriesForPeriod(hours)

    if (entries.length === 0) return null

    const fiveHourValues = entries.map((e) => e.fiveHour)
    const sevenDayValues = entries.map((e) => e.sevenDay)

    return {
      avgFiveHour: Math.round((fiveHourValues.reduce((a, b) => a + b, 0) / fiveHourValues.length) * 10) / 10,
      avgSevenDay: Math.round((sevenDayValues.reduce((a, b) => a + b, 0) / sevenDayValues.length) * 10) / 10,
      maxFiveHour: Math.max(...fiveHourValues),
      maxSevenDay: Math.max(...sevenDayValues),
      minFiveHour: Math.min(...fiveHourValues),
      minSevenDay: Math.min(...sevenDayValues),
      entryCount: entries.length
    }
  }

  getTrend(lookbackMinutes = 30): TrendData | null {
    const entries = this.getEntriesForPeriod(lookbackMinutes / 60)

    if (entries.length < 2) {
      return null
    }

    // Split entries into first and second half
    const midIndex = Math.floor(entries.length / 2)
    const firstHalf = entries.slice(0, midIndex)
    const secondHalf = entries.slice(midIndex)

    // Calculate averages for each half
    const avgFirstFiveHour = firstHalf.reduce((sum, e) => sum + e.fiveHour, 0) / firstHalf.length
    const avgSecondFiveHour = secondHalf.reduce((sum, e) => sum + e.fiveHour, 0) / secondHalf.length
    const avgFirstSevenDay = firstHalf.reduce((sum, e) => sum + e.sevenDay, 0) / firstHalf.length
    const avgSecondSevenDay = secondHalf.reduce((sum, e) => sum + e.sevenDay, 0) / secondHalf.length

    // Calculate time span in hours
    const timeSpanMs = entries[entries.length - 1].timestamp - entries[0].timestamp
    const timeSpanHours = timeSpanMs / (1000 * 60 * 60) || 1 // Avoid division by zero

    // Calculate delta per hour
    const fiveHourDelta = (avgSecondFiveHour - avgFirstFiveHour) / (timeSpanHours / 2)
    const sevenDayDelta = (avgSecondSevenDay - avgFirstSevenDay) / (timeSpanHours / 2)

    // Threshold for considering stable (±2% per hour)
    const STABLE_THRESHOLD = 2

    const getDirection = (delta: number): TrendDirection => {
      if (delta > STABLE_THRESHOLD) return 'up'
      if (delta < -STABLE_THRESHOLD) return 'down'
      return 'stable'
    }

    return {
      fiveHour: {
        direction: getDirection(fiveHourDelta),
        delta: Math.round(fiveHourDelta * 10) / 10
      },
      sevenDay: {
        direction: getDirection(sevenDayDelta),
        delta: Math.round(sevenDayDelta * 10) / 10
      }
    }
  }

  estimateTimeToThreshold(threshold: number): TimeToThreshold | null {
    const trend = this.getTrend(30)
    const latest = this.getLatestEntry()

    if (!trend || !latest) {
      return null
    }

    const calculateHoursToThreshold = (current: number, deltaPerHour: number): number | null => {
      // Only estimate if trending up and not already at/above threshold
      if (deltaPerHour <= 0 || current >= threshold) {
        return null
      }

      const remaining = threshold - current
      const hours = remaining / deltaPerHour

      // Cap at 24 hours - beyond that is too unreliable
      if (hours > 24) {
        return null
      }

      return Math.round(hours * 10) / 10 // Round to 1 decimal
    }

    return {
      fiveHour: calculateHoursToThreshold(latest.fiveHour, trend.fiveHour.delta),
      sevenDay: calculateHoursToThreshold(latest.sevenDay, trend.sevenDay.delta)
    }
  }

  // Get data formatted for chart display
  getChartData(hours: number): { labels: string[]; fiveHour: number[]; sevenDay: number[] } {
    const entries = this.getEntriesForPeriod(hours)

    // Sample data to have reasonable number of points (max 50)
    const maxPoints = 50
    const step = Math.max(1, Math.floor(entries.length / maxPoints))
    const sampledEntries = entries.filter((_, i) => i % step === 0)

    return {
      labels: sampledEntries.map((e) => {
        const date = new Date(e.timestamp)
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }),
      fiveHour: sampledEntries.map((e) => e.fiveHour),
      sevenDay: sampledEntries.map((e) => e.sevenDay)
    }
  }
}

export const historyService = new HistoryService()
