import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock electron-store
vi.mock('electron-store', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      let data: Record<string, unknown> = { entries: [] }
      return {
        get: (key: string) => data[key],
        set: (key: string, value: unknown) => {
          data[key] = value
        },
        clear: () => {
          data = { entries: [] }
        }
      }
    })
  }
})

// Mock logger
vi.mock('../src/main/services/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import { HistoryService } from '../src/main/services/history'

describe('HistoryService', () => {
  let historyService: HistoryService

  beforeEach(() => {
    historyService = new HistoryService()
  })

  describe('addEntry', () => {
    it('should add an entry to history', () => {
      historyService.addEntry(45.5, 32.1)
      const entries = historyService.getEntries()
      expect(entries.length).toBe(1)
      expect(entries[0].fiveHour).toBe(45.5)
      expect(entries[0].sevenDay).toBe(32.1)
    })

    it('should avoid duplicate entries within 30 seconds', () => {
      historyService.addEntry(45.5, 32.1)
      historyService.addEntry(46.0, 33.0) // Should be ignored (within 30s)
      const entries = historyService.getEntries()
      expect(entries.length).toBe(1)
    })

    it('should round values to 2 decimal places', () => {
      historyService.addEntry(45.556, 32.123)
      const entries = historyService.getEntries()
      expect(entries[0].fiveHour).toBe(45.56)
      expect(entries[0].sevenDay).toBe(32.12)
    })
  })

  describe('getLatestEntry', () => {
    it('should return null when no entries exist', () => {
      expect(historyService.getLatestEntry()).toBeNull()
    })

    it('should return the most recent entry', () => {
      historyService.addEntry(45.5, 32.1)
      const latest = historyService.getLatestEntry()
      expect(latest).not.toBeNull()
      expect(latest?.fiveHour).toBe(45.5)
    })
  })

  describe('clearHistory', () => {
    it('should clear all entries', () => {
      historyService.addEntry(45.5, 32.1)
      historyService.clearHistory()
      expect(historyService.getEntries().length).toBe(0)
    })
  })

  describe('getChartData', () => {
    it('should return empty arrays when no data', () => {
      const chartData = historyService.getChartData(1)
      expect(chartData.labels).toEqual([])
      expect(chartData.fiveHour).toEqual([])
      expect(chartData.sevenDay).toEqual([])
    })
  })
})
