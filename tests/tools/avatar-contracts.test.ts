import { describe, expect, it } from 'vitest'
import {
  AVATAR_CANVAS_SIZE,
  AVATAR_DURATION_FRAMES,
  AVATAR_FRAME_RATE,
  AVATAR_SLOT_COUNT,
  type AvatarSlotManifest,
} from '../../tools/avatars/contracts.ts'
import { AVATAR_MANIFESTS, REQUIRED_LAYER_ROLES } from '../../tools/avatars/manifests.ts'
import {
  validateAvatarManifest,
  validateAvatarManifestSet,
} from '../../tools/avatars/manifest-validation.ts'

describe('avatar manifest contract', () => {
  it('defines exactly ten valid slot manifests without requiring art files', () => {
    expect(AVATAR_MANIFESTS).toHaveLength(AVATAR_SLOT_COUNT)
    expect(validateAvatarManifestSet(AVATAR_MANIFESTS)).toEqual({ valid: true, errors: [] })
    expect(AVATAR_MANIFESTS.map((manifest) => manifest.slot)).toEqual([...Array(10).keys()])
  })

  it('keeps semantic layer order while drawing back hair below the head', () => {
    const manifest = AVATAR_MANIFESTS[0]
    expect(manifest.layers.map((layer) => layer.role)).toEqual([
      'background',
      'body',
      'head',
      'hair-back',
      'hair-front',
      'eyes-open',
      'eyes-closed',
      'brows',
      'mouth-rest',
      'mouth-smile',
      'accessory',
    ])
    expect(manifest.layers.map((layer) => layer.zIndex)).toEqual([0, 10, 20, 15, 40, 50, 51, 52, 60, 61, 70])
    expect([...manifest.layers].map((layer) => layer.zIndex).sort((a, b) => a - b)).toEqual([0, 10, 15, 20, 40, 50, 51, 52, 60, 61, 70])
    expect(REQUIRED_LAYER_ROLES.every((role) => manifest.layers.some((layer) => layer.role === role))).toBe(true)
  })

  it('freezes the shared composition constants', () => {
    expect(AVATAR_CANVAS_SIZE).toBe(256)
    expect(AVATAR_FRAME_RATE).toBe(60)
    expect(AVATAR_DURATION_FRAMES).toBe(600)
  })
})

describe('avatar manifest validation', () => {
  it('rejects duplicate IDs, missing roles, invalid opacity, and unsafe paths', () => {
    const source = AVATAR_MANIFESTS[0]
    const invalid: AvatarSlotManifest = {
      ...source,
      layers: [
        { ...source.layers[0], id: 'duplicate', file: '../secret.png', opacity: 2 },
        { ...source.layers[1], id: 'duplicate', role: 'background' },
      ],
    }

    const result = validateAvatarManifest(invalid)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'layers[0].file must be repository-relative',
        'layers[0].opacity must be between 0 and 1',
        'duplicate layer id: duplicate',
        'duplicate layer role: background',
        'missing required layer role: body',
      ]),
    )
  })

  it('rejects duplicate and missing slots in a manifest set', () => {
    const manifests = AVATAR_MANIFESTS.slice(0, -1).map((manifest) =>
      manifest.slot === 1 ? { ...manifest, slot: 0 as const } : manifest,
    )
    const result = validateAvatarManifestSet(manifests)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining(['manifest set must contain exactly 10 entries', 'duplicate slot: 0', 'missing slot: 9']),
    )
  })
})
