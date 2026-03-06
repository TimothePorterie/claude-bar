import { describe, it, expect } from 'vitest'

describe('QuotaService utilities', () => {
  describe('formatTimeUntil', () => {
    function formatTimeUntil(date: Date): string {
      const now = new Date()
      const diffMs = date.getTime() - now.getTime()

      if (diffMs <= 0) {
        return 'Now'
      }

      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays > 0) {
        const remainingHours = diffHours % 24
        return `${diffDays}d ${remainingHours}h`
      }

      if (diffHours > 0) {
        const remainingMinutes = diffMinutes % 60
        return `${diffHours}h ${remainingMinutes}m`
      }

      return `${diffMinutes}m`
    }

    it('should return "Now" for past dates', () => {
      const pastDate = new Date(Date.now() - 1000)
      expect(formatTimeUntil(pastDate)).toBe('Now')
    })

    it('should format minutes correctly', () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000 + 30 * 1000)
      expect(formatTimeUntil(futureDate)).toBe('30m')
    })

    it('should format hours and minutes correctly', () => {
      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000 + 30 * 1000)
      expect(formatTimeUntil(futureDate)).toBe('2h 30m')
    })

    it('should format days and hours correctly', () => {
      const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000 + 30 * 1000)
      expect(formatTimeUntil(futureDate)).toBe('2d 5h')
    })
  })

  describe('getQuotaLevel', () => {
    function getQuotaLevel(
      fiveHour: number,
      sevenDay: number
    ): 'normal' | 'warning' | 'critical' {
      const maxUtilization = Math.max(fiveHour, sevenDay)

      if (maxUtilization >= 90) return 'critical'
      if (maxUtilization >= 70) return 'warning'
      return 'normal'
    }

    it('should return normal for low utilization', () => {
      expect(getQuotaLevel(30, 25)).toBe('normal')
      expect(getQuotaLevel(69, 50)).toBe('normal')
    })

    it('should return warning for medium utilization', () => {
      expect(getQuotaLevel(70, 50)).toBe('warning')
      expect(getQuotaLevel(50, 75)).toBe('warning')
      expect(getQuotaLevel(89, 60)).toBe('warning')
    })

    it('should return critical for high utilization', () => {
      expect(getQuotaLevel(90, 50)).toBe('critical')
      expect(getQuotaLevel(50, 95)).toBe('critical')
      expect(getQuotaLevel(100, 100)).toBe('critical')
    })

    it('should use the maximum of both quotas', () => {
      expect(getQuotaLevel(50, 91)).toBe('critical')
      expect(getQuotaLevel(91, 50)).toBe('critical')
    })
  })

  describe('getFormattedTitle', () => {
    function getFormattedTitle(
      fiveHour: number | null,
      sevenDay: number | null
    ): string {
      if (fiveHour === null || sevenDay === null) {
        return '-- / --'
      }

      const fh = Math.round(fiveHour)
      const sd = Math.round(sevenDay)

      return `${fh}% / ${sd}%`
    }

    it('should return placeholder for null values', () => {
      expect(getFormattedTitle(null, null)).toBe('-- / --')
    })

    it('should format standard title correctly', () => {
      expect(getFormattedTitle(45.6, 32.3)).toBe('46% / 32%')
    })
  })
})
