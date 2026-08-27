import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ReferAFriend from '../../src/components/stay-connected/ReferAFriend.vue'

const { mockGetOrMintMyReferralId, mockWriteText } = vi.hoisted(() => ({
  mockGetOrMintMyReferralId: vi.fn(() => 'a-test123'),
  mockWriteText: vi.fn(),
}))

vi.mock('../../src/composables/useAuth', () => ({
  useAuth: () => ({ user: { value: null } }),
}))

vi.mock('../../src/services/referrals', () => ({
  getOrMintMyReferralId: mockGetOrMintMyReferralId,
}))

vi.mock('@iconify/vue', () => ({
  Icon: { template: '<span />' },
}))

function setClipboard(writeText: typeof mockWriteText = mockWriteText) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
}

function mountReferAFriend() {
  return mount(ReferAFriend, {
    props: { from: 'stepup-scholars' },
  })
}

beforeEach(() => {
  mockGetOrMintMyReferralId.mockClear()
  mockWriteText.mockReset()
  mockWriteText.mockResolvedValue(undefined)
  setClipboard()
})

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  })
})

describe('ReferAFriend', () => {
  it('shows copied feedback after the clipboard write succeeds', async () => {
    const wrapper = mountReferAFriend()

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('/programs/stepup-scholars'))
    expect(wrapper.get('button').text()).toContain('Copied')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('shows an accessible manual-copy fallback when the write is denied', async () => {
    mockWriteText.mockRejectedValueOnce(new DOMException('Write permission denied', 'NotAllowedError'))
    const wrapper = mountReferAFriend()

    await wrapper.get('button').trigger('click')
    await flushPromises()

    const status = wrapper.get('[role="status"]')
    expect(status.text()).toContain('Select the link above to copy it manually.')
    expect(wrapper.get('button').text()).toContain('Copy link')
    expect(wrapper.get('button').attributes('aria-describedby')).toBe('share-link-copy-feedback')

    wrapper.unmount()
  })

  it('shows the same fallback when the Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    const wrapper = mountReferAFriend()

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain(
      'Automatic copying is blocked in this browser.',
    )

    wrapper.unmount()
  })
})
