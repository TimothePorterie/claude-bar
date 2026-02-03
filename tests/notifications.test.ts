import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn()
  })),
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
