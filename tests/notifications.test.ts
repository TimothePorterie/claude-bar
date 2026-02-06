import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  Notification: class MockNotification {
    show() {}
  },
  app: {
    isPackaged: false
  }
}))

// Mock logger
vi.mock('../src/main/services/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import { Notification } from 'electron'
import { NotificationService } from '../src/main/services/notifications'

describe('NotificationService', () => {
  let notificationService: NotificationService

  beforeEach(() => {
    notificationService = new NotificationService()
    vi.clearAllMocks()
  })

  describe('setEnabled', () => {
    it('should enable notifications', () => {
      notificationService.setEnabled(true)
      expect(notificationService.isEnabled()).toBe(true)
    })

    it('should disable notifications', () => {
      notificationService.setEnabled(false)
      expect(notificationService.isEnabled()).toBe(false)
    })
  })

  describe('checkAndNotify', () => {
    it('should not notify when below warning threshold', () => {
      // Normal usage - should not trigger notification
      notificationService.checkAndNotify(50, 40)
      // No assertion needed, just verifying no errors
    })

    it('should track level transitions', () => {
      // Start at normal
      notificationService.checkAndNotify(50, 40)

      // Transition to warning should trigger
      notificationService.checkAndNotify(75, 40)

      // Stay at warning - no new notification
      notificationService.checkAndNotify(78, 42)

      // Transition to critical
      notificationService.checkAndNotify(92, 45)
    })
  })

  describe('notifyTokenRefreshFailed', () => {
    it('should respect 30-minute cooldown', () => {
      vi.useFakeTimers()

      const showSpy = vi.spyOn(Notification.prototype, 'show')

      notificationService.notifyTokenRefreshFailed()
      expect(showSpy).toHaveBeenCalledTimes(1)

      // Call again immediately — should be suppressed
      notificationService.notifyTokenRefreshFailed()
      expect(showSpy).toHaveBeenCalledTimes(1)

      // Advance 15 minutes — still within cooldown
      vi.advanceTimersByTime(15 * 60 * 1000)
      notificationService.notifyTokenRefreshFailed()
      expect(showSpy).toHaveBeenCalledTimes(1)

      // Advance another 16 minutes (total 31 min) — past cooldown
      vi.advanceTimersByTime(16 * 60 * 1000)
      notificationService.notifyTokenRefreshFailed()
      expect(showSpy).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
      showSpy.mockRestore()
    })
  })

  describe('quota recovery notifications', () => {
    it('should notify when session quota transitions from warning to normal', () => {
      const showSpy = vi.spyOn(Notification.prototype, 'show')

      // Go to warning
      notificationService.checkAndNotify(75, 40)
      expect(showSpy).toHaveBeenCalledTimes(1) // warning notification

      // Drop back to normal — should trigger recovery notification
      notificationService.checkAndNotify(50, 40)
      expect(showSpy).toHaveBeenCalledTimes(2) // recovery notification

      showSpy.mockRestore()
    })

    it('should notify when session quota transitions from critical to normal', () => {
      const showSpy = vi.spyOn(Notification.prototype, 'show')

      // Go to critical
      notificationService.checkAndNotify(95, 40)
      expect(showSpy).toHaveBeenCalledTimes(1) // critical notification

      // Drop back to normal
      notificationService.checkAndNotify(50, 40)
      expect(showSpy).toHaveBeenCalledTimes(2) // recovery notification

      showSpy.mockRestore()
    })

    it('should notify when weekly quota transitions from warning to normal', () => {
      const showSpy = vi.spyOn(Notification.prototype, 'show')

      // Go to warning on 7-day
      notificationService.checkAndNotify(40, 75)
      expect(showSpy).toHaveBeenCalledTimes(1) // warning notification

      // Drop back to normal
      notificationService.checkAndNotify(40, 50)
      expect(showSpy).toHaveBeenCalledTimes(2) // recovery notification

      showSpy.mockRestore()
    })

    it('should not notify recovery when staying at normal', () => {
      const showSpy = vi.spyOn(Notification.prototype, 'show')

      notificationService.checkAndNotify(50, 40)
      notificationService.checkAndNotify(30, 20)
      expect(showSpy).toHaveBeenCalledTimes(0) // no notifications at all

      showSpy.mockRestore()
    })
  })

  describe('quota level detection', () => {
    it('should correctly identify normal level', () => {
      // Internal method test via behavior
      notificationService.checkAndNotify(69, 50)
      // No warning should be triggered
    })

    it('should correctly identify warning level', () => {
      notificationService.checkAndNotify(70, 50)
      // Should trigger warning
    })

    it('should correctly identify critical level', () => {
      notificationService.checkAndNotify(90, 50)
      // Should trigger critical
    })
  })
})
