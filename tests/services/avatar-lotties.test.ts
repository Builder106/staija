import { describe, it, expect } from 'vitest'
import {
  hasLottieForSlot,
  loadLottieForSlot,
} from '../../src/services/avatar/lotties'
import { PORTRAIT_SLOT_COUNT } from '../../src/services/avatar'

/**
 * The lookup is glob-driven via Vite. These tests guard the runtime
 * contract for generated and invalid slots; committed animation files
 * are validated by the animation tooling before they reach this API.
 */

describe('hasLottieForSlot', () => {
  it('finds every generated animation slot', () => {
    for (let slot = 0; slot < PORTRAIT_SLOT_COUNT; slot++) {
      expect(hasLottieForSlot(slot)).toBe(true)
    }
  })

  it('returns false for out-of-range slots without throwing', () => {
    expect(hasLottieForSlot(-1)).toBe(false)
    expect(hasLottieForSlot(PORTRAIT_SLOT_COUNT + 99)).toBe(false)
  })
})

describe('loadLottieForSlot', () => {
  it('loads embedded animation data for generated slots', async () => {
    for (const slot of [0, 6]) {
      const animation = await loadLottieForSlot(slot)
      expect(animation).not.toBeNull()
      expect(animation?.w).toBe(256)
      expect(animation?.h).toBe(256)
      expect(animation?.layers).toHaveLength(11)
    }
  })

  it('resolves to null for out-of-range slots without throwing', async () => {
    expect(await loadLottieForSlot(-1)).toBeNull()
    expect(await loadLottieForSlot(PORTRAIT_SLOT_COUNT + 99)).toBeNull()
  })
})
