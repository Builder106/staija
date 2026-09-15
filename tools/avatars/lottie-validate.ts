import { AVATAR_CANVAS_SIZE as CANVAS_SIZE, AVATAR_DURATION_FRAMES as TOTAL_FRAMES, AVATAR_FRAME_RATE as FRAME_RATE, AVATAR_SLOT_COUNT, type AvatarSlotManifest } from './contracts.ts'

export interface LottieValidationResult { readonly valid: boolean; readonly errors: readonly string[]; readonly warnings: readonly string[] }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function validateLottieDocument(input: unknown, expected: { slot: number; manifest: AvatarSlotManifest }): LottieValidationResult {
  const errors: string[] = []
  const doc = asRecord(input)
  if (!doc || typeof doc !== 'object') return { valid: false, errors: ['document must be an object'], warnings: [] }
  for (const key of ['v', 'fr', 'ip', 'op', 'w', 'h', 'assets', 'layers']) if (!(key in doc)) errors.push(`missing root field ${key}`)
  if (doc.fr !== FRAME_RATE || doc.ip !== 0 || doc.op !== TOTAL_FRAMES || doc.w !== CANVAS_SIZE || doc.h !== CANVAS_SIZE) errors.push('composition must be 256x256 at 60fps for 600 frames')
  if (!Number.isInteger(expected.slot) || expected.slot < 0 || expected.slot >= AVATAR_SLOT_COUNT || asRecord(doc.meta)?.slot !== expected.slot) errors.push('slot metadata does not match expected slot')
  if (!Array.isArray(doc.assets) || !Array.isArray(doc.layers)) return { valid: false, errors, warnings: [] }
  if (doc.assets.length !== expected.manifest.layers.length) errors.push('asset count must match manifest layer count')
  const assetIds = new Set<string>()
  for (const rawAsset of doc.assets) {
    const asset = asRecord(rawAsset)
    const assetId = typeof asset?.id === 'string' ? asset.id : '<unknown>'
    if (typeof asset?.id !== 'string' || assetIds.has(asset.id)) errors.push('assets must have unique string ids')
    if (typeof asset?.id === 'string') assetIds.add(asset.id)
    if (asset?.e !== 1 || typeof asset.p !== 'string' || !asset.p.startsWith('data:image/png;base64,')) errors.push(`asset ${assetId} must be an embedded PNG data URI`)
    if (/https?:\/\/|file:\/\//i.test(String(asset?.p))) errors.push(`asset ${assetId} contains a remote or filesystem URL`)
  }
  const layerNames = new Set<string>()
  for (const rawLayer of doc.layers) {
    const layer = asRecord(rawLayer)
    const layerName = typeof layer?.nm === 'string' ? layer.nm : '<unknown>'
    if (typeof layer?.nm !== 'string' || layerNames.has(layerName)) errors.push('layers must have unique names')
    if (typeof layer?.nm === 'string') layerNames.add(layer.nm)
    if (layer?.ty === 2 && !assetIds.has(String(layer.refId))) errors.push(`layer ${layerName} references a missing asset`)
    if (layer?.ip !== 0 || layer?.op !== TOTAL_FRAMES || layer?.st !== 0) errors.push(`layer ${layerName} has invalid frame bounds`)
    const animatedValues = Object.values(asRecord(layer?.ks) ?? {}).map(asRecord).filter((value): value is Record<string, unknown> => value !== null)
    for (const value of animatedValues) {
      if (value.a !== 1 || !Array.isArray(value.k) || value.k.length < 2) continue
      let previous = -1
      for (const rawKeyframe of value.k) {
        const keyframe = asRecord(rawKeyframe)
        if (!keyframe) { errors.push(`layer ${layerName} has an invalid keyframe`); continue }
        if (!Number.isInteger(keyframe.t) || Number(keyframe.t) < 0 || Number(keyframe.t) > TOTAL_FRAMES || Number(keyframe.t) <= previous) errors.push(`layer ${layerName} has invalid keyframe timing`)
        previous = Number(keyframe.t)
        if (!Array.isArray(keyframe.s) || keyframe.s.some((component) => typeof component !== 'number' || !Number.isFinite(component))) errors.push(`layer ${layerName} has invalid keyframe values`)
      }
    }
  }
  for (const layer of expected.manifest.layers) if (!layerNames.has(layer.id)) errors.push(`missing manifest layer ${layer.id}`)
  return { valid: errors.length === 0, errors, warnings: [] }
}
