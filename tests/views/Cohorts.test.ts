import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Cohort } from '../../src/services/types'

const mockListAllCohorts = vi.fn()

vi.mock('../../src/config/firebase.ts', () => ({ functions: {} }))
vi.mock('firebase/firestore', () => ({ Timestamp: { fromDate: vi.fn() } }))
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }))
vi.mock('../../src/composables/useAuth', () => ({
  useAuth: () => ({ user: { value: { uid: 'admin-1' } } }),
}))
vi.mock('../../src/services/learn', () => ({
  CohortService: { listAllCohorts: (...args: unknown[]) => mockListAllCohorts(...args) },
  EnrollmentService: { getForCohort: vi.fn(), rearmDeferredsCron: vi.fn() },
  toMillis: (value: Date) => value.getTime(),
}))
vi.mock('@iconify/vue', () => ({ Icon: { template: '<span />' } }))

vi.mock('../../src/components/ui/Body.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../../src/components/ui/Container.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../../src/components/ui/Eyebrow.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../../src/components/ui/Heading.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../../src/components/ui/Section.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../../src/components/ui/UiButton.vue', () => ({ default: { template: '<button><slot /></button>' } }))
vi.mock('../../src/components/ui/UiCard.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../../src/components/ui/UiSelect.vue', () => ({ default: { template: '<select><slot /></select>' } }))

import CohortsView from '../../src/views/admin/Cohorts.vue'

const cohort: Cohort = {
  id: 'cohort-1',
  program: 'stepup_scholars',
  courseSlug: 'research-foundations',
  courseVersion: '2026-fall',
  name: 'Research Foundations',
  startDate: new Date('2026-05-01T00:00:00.000Z'),
  endDate: new Date('2026-05-28T00:00:00.000Z'),
  mentorPool: [],
  status: 'planned',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
}

describe('Cohorts.vue date display', () => {
  beforeEach(() => {
    mockListAllCohorts.mockResolvedValue([cohort])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it.each(['America/New_York', 'America/Los_Angeles'])(
    'keeps date-only cohort dates unchanged in %s',
    async (timeZone) => {
      vi.stubEnv('TZ', timeZone)

      const wrapper = mount(CohortsView)
      await flushPromises()

      expect(wrapper.text()).toContain('May 1, 2026 – May 28, 2026')
      wrapper.unmount()
    },
  )
})
