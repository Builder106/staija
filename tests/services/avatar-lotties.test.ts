import { afterEach, describe, expect, it, vi } from 'vitest'
import { PORTRAIT_SLOT_COUNT } from '../../src/services/avatar'

const SLOT_ZERO_PATH = '../../src/assets/avatar-lotties/slot-0.json'
const SLOT_ONE_PATH = '../../src/assets/avatar-lotties/slot-1.json'

async function loadLottieService() {
  vi.resetModules()
  return import('../../src/services/avatar/lotties')
}

afterEach(() => {
  vi.doUnmock(SLOT_ZERO_PATH)
  vi.doUnmock(SLOT_ONE_PATH)
  vi.resetModules()
})

/**
 * The lookup is glob-driven via Vite. These tests guard the runtime
 * contract for generated and invalid slots; committed animation files
 * are validated by the animation tooling before they reach this API.
 */

describe('hasLottieForSlot', () => {
  it('finds every generated animation slot', async () => {
    const { hasLottieForSlot } = await loadLottieService()
    for (let slot = 0; slot < PORTRAIT_SLOT_COUNT; slot++) {
      expect(hasLottieForSlot(slot)).toBe(true)
    }
  })

  it('returns false for out-of-range slots without throwing', async () => {
    const { hasLottieForSlot } = await loadLottieService()
    expect(hasLottieForSlot(-1)).toBe(false)
    expect(hasLottieForSlot(PORTRAIT_SLOT_COUNT + 99)).toBe(false)
  })
})

describe('loadLottieForSlot', () => {
  it('loads embedded animation data for generated slots', async () => {
    const { loadLottieForSlot } = await loadLottieService()
    for (const slot of [0, 6]) {
      const animation = await loadLottieForSlot(slot)
      expect(animation).not.toBeNull()
      expect(animation?.w).toBe(256)
      expect(animation?.h).toBe(256)
      expect(animation?.layers).toHaveLength(11)
    }
  })

  it('resolves to null for out-of-range slots without throwing', async () => {
    const { loadLottieForSlot } = await loadLottieService()
    expect(await loadLottieForSlot(-1)).toBeNull()
    expect(await loadLottieForSlot(PORTRAIT_SLOT_COUNT + 99)).toBeNull()
  })

  it('loads only the requested slot on demand', async () => {
    const slotZeroLoader = vi.fn(() => ({
      default: { w: 256, h: 256, layers: [] },
    }))
    const slotOneLoader = vi.fn(() => ({
      default: { w: 256, h: 256, layers: [] },
    }))
    vi.doMock(SLOT_ZERO_PATH, slotZeroLoader)
    vi.doMock(SLOT_ONE_PATH, slotOneLoader)

    const { loadLottieForSlot } = await loadLottieService()
    await expect(loadLottieForSlot(0)).resolves.toMatchObject({ w: 256, h: 256 })

    expect(slotZeroLoader).toHaveBeenCalledTimes(1)
    expect(slotOneLoader).not.toHaveBeenCalled()
  })

  it('falls back to null when a slot loader rejects', async () => {
    vi.doMock(SLOT_ZERO_PATH, () => Promise.reject(new Error('missing asset')))

    const { loadLottieForSlot } = await loadLottieService()
    await expect(loadLottieForSlot(0)).resolves.toBeNull()
  })

  it('falls back to null when a slot loader returns malformed data', async () => {
    vi.doMock(SLOT_ZERO_PATH, () => ({ default: { w: 256, h: 256 } }))

    const { loadLottieForSlot } = await loadLottieService()
    await expect(loadLottieForSlot(0)).resolves.toBeNull()
  })
})
