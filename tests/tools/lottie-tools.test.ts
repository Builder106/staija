import { describe, expect, it } from 'vitest'
import { AVATAR_SLOT_COUNT } from '../../tools/avatars/contracts.ts'
import { AVATAR_MANIFESTS, REQUIRED_LAYER_ROLES } from '../../tools/avatars/manifests.ts'
import { MOTION_CONFIGS } from '../../tools/avatars/lottie-motions.ts'
import { validateLottieDocument } from '../../tools/avatars/lottie-validate.ts'
import { buildLottieDocument } from '../../tools/avatars/lottie-rig.ts'

describe('avatar motion configurations', () => {
  it('defines deterministic complete motion for every slot', () => {
    expect(Object.keys(MOTION_CONFIGS).map(Number)).toEqual(Array.from({ length: AVATAR_SLOT_COUNT }, (_, slot) => slot))
    for (const slot of Array.from({ length: AVATAR_SLOT_COUNT }, (_, value) => value)) {
      const motion = MOTION_CONFIGS[slot]
      expect(motion.rotation.at(0)).toEqual({ frame: 0, value: 0 })
      expect(motion.rotation.at(-1)).toEqual({ frame: 600, value: 0 })
      expect(motion.position.at(-1)).toEqual({ frame: 600, value: { x: 128, y: 128 } })
      expect(motion.blink.some(({ value }) => value)).toBe(true)
      expect(motion.mouth.some(({ value }) => value)).toBe(true)
    }
  })
})

describe('manifest-driven Lottie validation', () => {
  it('requires every semantic layer in each manifest', () => {
    for (const manifest of AVATAR_MANIFESTS) expect(manifest.layers.filter(({ role }) => role !== 'accessory').map(({ role }) => role)).toEqual(REQUIRED_LAYER_ROLES)
  })

  it('rejects remote assets, missing references, and invalid composition bounds', () => {
    const result = validateLottieDocument({ fr: 30, ip: 0, op: 1, w: 256, h: 256, assets: [{ id: 'x', p: 'https://example.com/x.png', e: 0 }], layers: [{ nm: 'background', ty: 2, refId: 'missing', ip: 0, op: 1, st: 0 }], meta: { slot: 0 } }, { slot: 0, manifest: AVATAR_MANIFESTS[0] })
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining(['composition must be 256x256 at 60fps for 600 frames', 'asset x must be an embedded PNG data URI', 'layer background references a missing asset']))
  })

  it('builds a self-contained document from every reviewed source layer', async () => {
    const document = await buildLottieDocument(0)
    const result = validateLottieDocument(document, { slot: 0, manifest: AVATAR_MANIFESTS[0] })
    expect(result.valid).toBe(true)
    expect(document.assets).toHaveLength(AVATAR_MANIFESTS[0].layers.length)
  })
})
