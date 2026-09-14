import { describe, it, expect, vi, beforeEach } from 'vitest'

const store: Record<string, unknown> = {}
vi.mock('../src/main/services/settings-store', () => ({
  settingsStore: {
    get: (key: string) => store[key],
    set: (key: string, value: unknown) => { store[key] = value }
  }
}))
vi.mock('../src/main/services/logger', () => ({ logger: { info: vi.fn() } }))
const shown = vi.fn()
vi.mock('electron', () => ({
  Notification: class {
    static isSupported = () => true
    constructor(public opts: { title: string }) {}
    show = () => shown(this.opts.title)
  }
}))
const quota = { fiveHour: { utilization: 0 }, sevenDay: { utilization: 0 } }
vi.mock('../src/main/services/quota-api', () => ({ quotaService: { getCachedQuota: () => quota } }))

const { NotificationService } = await import('../src/main/services/notifications')

beforeEach(() => {
  Object.assign(store, { enableNotifications: true, notifiedLevels: {} })
  quota.fiveHour.utilization = 0
  quota.sevenDay.utilization = 0
  shown.mockReset()
})

describe('NotificationService', () => {
  it('notifies once when crossing into warning', () => {
    const service = new NotificationService()
    quota.fiveHour.utilization = 75
    service.checkAndNotify()
    service.checkAndNotify()
    expect(shown).toHaveBeenCalledTimes(1)
  })

  it('does not notify again after a restart at the same level', () => {
    quota.fiveHour.utilization = 75
    new NotificationService().checkAndNotify()
    new NotificationService().checkAndNotify()
    expect(shown).toHaveBeenCalledTimes(1)
  })

  it('notifies again after the quota resets and climbs back', () => {
    const service = new NotificationService()
    quota.fiveHour.utilization = 75
    service.checkAndNotify()
    quota.fiveHour.utilization = 10
    service.checkAndNotify()
    quota.fiveHour.utilization = 95
    service.checkAndNotify()
    expect(shown).toHaveBeenCalledTimes(2)
  })
})
