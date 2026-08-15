import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { Application } from '../../src/services/types'

vi.mock('../../src/config/firebase.ts', () => ({
  auth: {},
  db: {},
  storage: {},
  publicStorage: {},
  functions: {},
}))

// The spot-response handshake calls the `respondToOffer` callable. Mock the
// callable factory so we can assert the args without touching Firebase.
// (Names must start with `mock` for vitest to allow them in a hoisted factory.)
const mockRespondCallable = vi.fn()
const mockHttpsCallable = vi.fn(() => mockRespondCallable)
vi.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => mockHttpsCallable(...args),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn() })),
  serverTimestamp: vi.fn(() => new Date()),
}))

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@iconify/vue', () => ({
  Icon: { template: '<span />' },
}))

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ params: { id: 'app-abc' } })),
  RouterLink: { template: '<a href="#"><slot /></a>' },
}))

const mockGetApplication = vi.fn()
vi.mock('../../src/services/database', () => ({
  DatabaseService: {
    getApplication: (...args: unknown[]) => mockGetApplication(...args),
  },
}))

vi.mock('../../src/components/ui/Container.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../../src/components/ui/Section.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../../src/components/ui/Heading.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../../src/components/ui/Body.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../../src/components/ui/Eyebrow.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../../src/components/ui/UiButton.vue', () => ({
  default: { props: ['to', 'variant'], template: '<a :href="to"><slot /></a>' },
}))
vi.mock('../../src/components/ui/UiCard.vue', () => ({ default: { template: '<div><slot /></div>' } }))

import StatusView from '../../src/views/apply/Status.vue'

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-abc',
    userId: 'user-1',
    program: 'stepup_scholars',
    status: 'draft',
    personalInfo: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      dateOfBirth: '2000-01-01',
      nationality: 'Nigerian',
    },
    academicInfo: {},
    researchInterests: [],
    motivation: '',
    experience: '',
    references: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

async function mountWithApp(overrides: Partial<Application> = {}) {
  mockGetApplication.mockResolvedValue(makeApp(overrides))
  const wrapper = mount(StatusView)
  await flushPromises()
  return wrapper
}

describe('Status.vue — statusInfo computed', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['submitted', 'Under review'],
    ['under_review', 'In active review'],
    ['accepted', 'Accepted'],
    // Reworked in 55268fa: the ambiguous "Decision made" became the plain
    // "Not selected" so the chip reads the same as the dashboard.
    ['rejected', 'Not selected'],
    ['draft', 'Draft'],
  ] as const)('status "%s" renders label "%s"', async (status, expectedLabel) => {
    const wrapper = await mountWithApp({ status })
    expect(wrapper.text()).toContain(expectedLabel)
  })

  it('submitted status shows the 5-business-day description', async () => {
    const wrapper = await mountWithApp({ status: 'submitted' })
    expect(wrapper.text()).toContain('5 business days')
  })

  it('accepted status shows inbox message', async () => {
    const wrapper = await mountWithApp({ status: 'accepted' })
    expect(wrapper.text()).toContain("You're in")
  })

  it('rejected status states the outcome plainly, not "check your inbox"', async () => {
    const wrapper = await mountWithApp({ status: 'rejected' })
    // Decision now lives in-app (email is unreliable); the hero no longer
    // punts to the inbox the way the legacy copy did.
    expect(wrapper.text()).toContain('Not selected this cycle.')
    expect(wrapper.text()).not.toContain('Check your inbox')
  })

  it('draft status shows resume-application button', async () => {
    const wrapper = await mountWithApp({ status: 'draft' })
    expect(wrapper.text()).toContain('Resume application')
  })

  it('non-draft status does not show resume button', async () => {
    const wrapper = await mountWithApp({ status: 'submitted' })
    expect(wrapper.text()).not.toContain('Resume application')
  })
})

describe('Status.vue — programLabel / programSlug computeds', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stepup_scholars renders "StepUp Scholars"', async () => {
    const wrapper = await mountWithApp({ program: 'stepup_scholars' })
    expect(wrapper.text()).toContain('StepUp Scholars')
  })

  it('dynamerge renders "Dynamerge"', async () => {
    const wrapper = await mountWithApp({ program: 'dynamerge' })
    expect(wrapper.text()).toContain('Dynamerge')
  })

  it('stepup_scholars draft links to /apply/stepup-scholars', async () => {
    const wrapper = await mountWithApp({ program: 'stepup_scholars', status: 'draft' })
    const resumeLink = wrapper.find('a[href="/apply/stepup-scholars"]')
    expect(resumeLink.exists()).toBe(true)
  })

  it('dynamerge draft links to /apply/dynamerge', async () => {
    const wrapper = await mountWithApp({ program: 'dynamerge', status: 'draft' })
    const resumeLink = wrapper.find('a[href="/apply/dynamerge"]')
    expect(resumeLink.exists()).toBe(true)
  })
})

describe('Status.vue — reference status badges', () => {
  beforeEach(() => vi.clearAllMocks())

  it('received reference shows "Letter received"', async () => {
    const wrapper = await mountWithApp({
      references: [{ name: 'Dr. Smith', email: 'smith@uni.edu', institution: 'MIT', relationship: 'Advisor', status: 'received' }],
    })
    expect(wrapper.text()).toContain('Letter received')
  })

  it('invited reference shows "Invite sent | awaiting"', async () => {
    const wrapper = await mountWithApp({
      references: [{ name: 'Prof. Lee', email: 'lee@uni.edu', institution: 'Yale', relationship: 'Mentor', status: 'invited' }],
    })
    expect(wrapper.text()).toContain('Invite sent | awaiting')
  })

  it('pending reference shows "Not yet invited"', async () => {
    const wrapper = await mountWithApp({
      references: [{ name: 'Ms. Jones', email: 'jones@co.org', institution: '', relationship: 'Manager', status: 'pending' }],
    })
    expect(wrapper.text()).toContain('Not yet invited')
  })

  it('reference without explicit status defaults to "Not yet invited"', async () => {
    const wrapper = await mountWithApp({
      references: [{ name: 'A. Person', email: 'a@b.com', institution: '', relationship: '' }],
    })
    expect(wrapper.text()).toContain('Not yet invited')
  })
})

describe('Status.vue — loading / error / not-found states', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows not-found message when getApplication returns null', async () => {
    mockGetApplication.mockResolvedValue(null)
    const wrapper = mount(StatusView)
    await flushPromises()
    expect(wrapper.text()).toContain('Application not found')
  })

  it('shows error message when getApplication throws', async () => {
    mockGetApplication.mockRejectedValue(new Error('Network error'))
    const wrapper = mount(StatusView)
    await flushPromises()
    expect(wrapper.text()).toContain('Something went wrong')
  })
})

describe('Status.vue — decision card + spot-response handshake', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRespondCallable.mockResolvedValue({ data: { ok: true } })
  })

  // Click the first clickable element (mocked UiButton renders <a>; plain
  // template buttons render <button>) whose text contains `label`.
  async function clickByText(wrapper: ReturnType<typeof mount>, label: string) {
    const el = wrapper.findAll('a, button').find((e) => e.text().includes(label))
    if (!el) throw new Error(`No clickable element with text "${label}"`)
    await el.trigger('click')
    await flushPromises()
  }

  it('rejected app surfaces the team feedback note in the decision card', async () => {
    const wrapper = await mountWithApp({
      status: 'rejected',
      feedback: 'Strong essay; limited spots this cycle.',
    })
    expect(wrapper.text()).toContain('Not selected this cycle.')
    expect(wrapper.text()).toContain('Note from the team')
    expect(wrapper.text()).toContain('Strong essay; limited spots this cycle.')
  })

  it('accepted app with no response shows accept / defer / decline CTAs', async () => {
    const wrapper = await mountWithApp({ status: 'accepted' })
    expect(wrapper.text()).toContain('You got in.')
    expect(wrapper.text()).toContain('Accept your spot')
    expect(wrapper.text()).toContain('Defer to next cycle')
    expect(wrapper.text()).toContain('Decline the offer')
  })

  it.each([
    ['accepted', 'Spot accepted'],
    ['declined', 'Spot declined'],
    ['deferred', 'Deferred to next cycle'],
  ] as const)('accepted app with spotResponse=%s shows the confirmed state "%s"', async (response, heading) => {
    const wrapper = await mountWithApp({
      status: 'accepted',
      spotResponse: response,
      spotRespondedAt: Date.now(),
    })
    expect(wrapper.text()).toContain(heading)
    // Once a response is recorded the pre-response CTAs are gone.
    expect(wrapper.text()).not.toContain('Accept your spot')
  })

  it('surfaces the saved response note in the confirmed state', async () => {
    const wrapper = await mountWithApp({
      status: 'accepted',
      spotResponse: 'declined',
      spotRespondedAt: Date.now(),
      spotResponseNote: 'Joining a startup instead.',
    })
    expect(wrapper.text()).toContain('Joining a startup instead.')
  })

  it('accepting the offer calls respondToOffer and flips to the confirmed state', async () => {
    mockGetApplication
      .mockResolvedValueOnce(makeApp({ status: 'accepted' }))
      .mockResolvedValueOnce(
        makeApp({ status: 'accepted', spotResponse: 'accepted', spotRespondedAt: Date.now() }),
      )
    const wrapper = mount(StatusView)
    await flushPromises()

    await clickByText(wrapper, 'Accept your spot')

    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'respondToOffer')
    expect(mockRespondCallable).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: 'app-abc', response: 'accepted' }),
    )
    expect(wrapper.text()).toContain('Spot accepted')
  })

  it('declining expands a confirmation panel and submits the note', async () => {
    mockGetApplication
      .mockResolvedValueOnce(makeApp({ status: 'accepted' }))
      .mockResolvedValueOnce(
        makeApp({
          status: 'accepted',
          spotResponse: 'declined',
          spotRespondedAt: Date.now(),
          spotResponseNote: 'Took another offer',
        }),
      )
    const wrapper = mount(StatusView)
    await flushPromises()

    await clickByText(wrapper, 'Decline the offer')
    expect(wrapper.text()).toContain("Decline this cycle's offer?")

    await wrapper.find('textarea').setValue('Took another offer')
    await clickByText(wrapper, 'Confirm decline')

    expect(mockRespondCallable).toHaveBeenCalledWith(
      expect.objectContaining({ response: 'declined', note: 'Took another offer' }),
    )
    expect(wrapper.text()).toContain('Spot declined')
  })

  it('surfaces a respond error when the callable rejects', async () => {
    mockRespondCallable.mockRejectedValueOnce(new Error('offline'))
    const wrapper = await mountWithApp({ status: 'accepted' })
    await clickByText(wrapper, 'Accept your spot')
    expect(wrapper.text()).toContain('offline')
    // Still showing the CTA so the applicant can retry.
    expect(wrapper.text()).toContain('Accept your spot')
  })
})
