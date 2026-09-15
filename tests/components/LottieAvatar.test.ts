import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

/**
 * LottieAvatar tests. We mock `lottie-web` because it reaches into
 * the DOM to build an SVG player; happy-dom's rendering of that is
 * irrelevant to the wrapper's contract. The tests cover the
 * externally-visible behavior:
 *   - fallback img renders with the right src/alt/size
 *   - prefers-reduced-motion suppresses the Lottie load entirely
 *   - destroy() fires on unmount
 *   - reload happens when animationData changes
 */

const destroyMock = vi.fn()
const addEventListenerMock = vi.fn(
  (_event: string, fn: () => void) => {
    // Synchronously fire DOMLoaded so the loaded state ticks
    queueMicrotask(fn)
  },
)
const loadAnimationMock = vi.fn(() => ({
  destroy: destroyMock,
  addEventListener: addEventListenerMock,
}))

vi.mock('lottie-web', () => ({
  default: {
    loadAnimation: loadAnimationMock,
  },
}))

function mockMatchMedia(prefersReducedMotion: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) =>
      ({
        matches:
          q.includes('prefers-reduced-motion') ? prefersReducedMotion : false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
}

beforeEach(() => {
  loadAnimationMock.mockClear()
  destroyMock.mockClear()
  addEventListenerMock.mockClear()
  mockMatchMedia(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const FALLBACK_SRC = '/avatars/portrait-6.png'
const STUB_LOTTIE = { v: '5.7.4', layers: [] } as unknown as Record<
  string,
  unknown
>

async function loadComponent() {
  // Re-import so the lottie-web mock picks up cleanly per test.
  vi.resetModules()
  return (await import('../../src/components/avatars/LottieAvatar.vue'))
    .default
}

describe('LottieAvatar', () => {
  it('renders the fallback img with the provided src and alt', async () => {
    const LottieAvatar = await loadComponent()
    const wrapper = mount(LottieAvatar, {
      props: { fallbackSrc: FALLBACK_SRC, alt: 'Yinka' },
    })
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe(FALLBACK_SRC)
    expect(img.attributes('alt')).toBe('Yinka')
  })

  it('does not call lottie.loadAnimation when no animationData is provided', async () => {
    const LottieAvatar = await loadComponent()
    mount(LottieAvatar, {
      props: { fallbackSrc: FALLBACK_SRC },
    })
    expect(loadAnimationMock).not.toHaveBeenCalled()
  })

  it('calls lottie.loadAnimation when animationData is provided', async () => {
    const LottieAvatar = await loadComponent()
    mount(LottieAvatar, {
      props: { fallbackSrc: FALLBACK_SRC, animationData: STUB_LOTTIE },
    })
    expect(loadAnimationMock).toHaveBeenCalledTimes(1)
    const call = loadAnimationMock.mock.calls[0][0]
    // Vue wraps the prop in a reactive proxy; structural equality
    // is the right assertion (the proxy points to the same object).
    expect(call.animationData).toEqual(STUB_LOTTIE)
    expect(call.renderer).toBe('svg')
  })

  it('does not load a Lottie when prefers-reduced-motion is set', async () => {
    mockMatchMedia(true)
    const LottieAvatar = await loadComponent()
    mount(LottieAvatar, {
      props: { fallbackSrc: FALLBACK_SRC, animationData: STUB_LOTTIE },
    })
    expect(loadAnimationMock).not.toHaveBeenCalled()
  })

  it('keeps the fallback visible when lottie-web rejects animation data', async () => {
    loadAnimationMock.mockImplementationOnce(() => {
      throw new Error('invalid animation')
    })
    const LottieAvatar = await loadComponent()
    const wrapper = mount(LottieAvatar, {
      props: { fallbackSrc: FALLBACK_SRC, animationData: STUB_LOTTIE },
    })

    expect(wrapper.find('img').isVisible()).toBe(true)
    expect(wrapper.find('.lottie-avatar__stage').classes()).not.toContain(
      'lottie-avatar__stage--loaded',
    )
  })

  it('destroys the Lottie instance on unmount', async () => {
    const LottieAvatar = await loadComponent()
    const wrapper = mount(LottieAvatar, {
      props: { fallbackSrc: FALLBACK_SRC, animationData: STUB_LOTTIE },
    })
    expect(loadAnimationMock).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(destroyMock).toHaveBeenCalled()
  })

  it('reloads when animationData changes', async () => {
    const LottieAvatar = await loadComponent()
    const wrapper = mount(LottieAvatar, {
      props: { fallbackSrc: FALLBACK_SRC, animationData: STUB_LOTTIE },
    })
    expect(loadAnimationMock).toHaveBeenCalledTimes(1)

    const newAnim = { v: '5.7.4', layers: [{ ty: 4 }] } as unknown as Record<
      string,
      unknown
    >
    await wrapper.setProps({ animationData: newAnim })

    expect(destroyMock).toHaveBeenCalled() // previous instance torn down
    expect(loadAnimationMock).toHaveBeenCalledTimes(2)
    expect(loadAnimationMock.mock.calls[1][0].animationData).toEqual(newAnim)
  })

  it('threads size into both the wrapper and the fallback img', async () => {
    const LottieAvatar = await loadComponent()
    const wrapper = mount(LottieAvatar, {
      props: { fallbackSrc: FALLBACK_SRC, size: 120 },
    })
    expect(wrapper.find('img').attributes('width')).toBe('120')
    expect(wrapper.find('img').attributes('height')).toBe('120')
    expect(
      (wrapper.element as HTMLElement).style.width,
    ).toBe('120px')
  })
})
