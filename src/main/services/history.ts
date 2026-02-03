import Store from 'electron-store'
import { logger } from './logger'

export interface HistoryEntry {
  timestamp: number
  fiveHour: number
  sevenDay: number
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
