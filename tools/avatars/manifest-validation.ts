import {
  AVATAR_CANVAS_SIZE,
  AVATAR_SLOT_COUNT,
  type AvatarLayerSource,
  type AvatarSlotManifest,
} from './contracts.ts'
import { REQUIRED_LAYER_ROLES } from './manifests.ts'

const RELATIVE_REPOSITORY_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\\]+$/

export interface ManifestValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateLayer(layer: AvatarLayerSource, index: number, errors: string[]): void {
  const prefix = `layers[${index}]`
  if (!layer.id.trim()) errors.push(`${prefix}.id must not be empty`)
  if (!RELATIVE_REPOSITORY_PATH.test(layer.file)) errors.push(`${prefix}.file must be repository-relative`)
  if (!Number.isInteger(layer.zIndex)) errors.push(`${prefix}.zIndex must be an integer`)
  if (!isFiniteNumber(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) {
    errors.push(`${prefix}.opacity must be between 0 and 1`)
  }

  const transform = layer.transform
  const transformValues = [
    transform.x,
    transform.y,
    transform.scaleX,
    transform.scaleY,
    transform.rotation,
    transform.anchor.x,
    transform.anchor.y,
  ]
  if (transformValues.some((value) => !isFiniteNumber(value))) {
    errors.push(`${prefix}.transform must contain finite numbers`)
  }
  if (transform.scaleX === 0 || transform.scaleY === 0) {
    errors.push(`${prefix}.transform scale must be non-zero`)
  }
}

export function validateAvatarManifest(manifest: AvatarSlotManifest): ManifestValidationResult {
  const errors: string[] = []

  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  if (!Number.isInteger(manifest.slot) || manifest.slot < 0 || manifest.slot >= AVATAR_SLOT_COUNT) {
    errors.push(`slot must be an integer between 0 and ${AVATAR_SLOT_COUNT - 1}`)
  }
  if (!manifest.name.trim()) errors.push('name must not be empty')
  if (manifest.canvas.width !== AVATAR_CANVAS_SIZE || manifest.canvas.height !== AVATAR_CANVAS_SIZE) {
    errors.push(`canvas must be ${AVATAR_CANVAS_SIZE}x${AVATAR_CANVAS_SIZE}`)
  }
  if (manifest.canvas.colorSpace !== 'srgb') errors.push('canvas.colorSpace must be srgb')
  if (!RELATIVE_REPOSITORY_PATH.test(manifest.flattenedOutput)) errors.push('flattenedOutput must be repository-relative')
  if (!RELATIVE_REPOSITORY_PATH.test(manifest.staticOutput)) errors.push('staticOutput must be repository-relative')
  if (!RELATIVE_REPOSITORY_PATH.test(manifest.lottieOutput)) errors.push('lottieOutput must be repository-relative')

  const ids = new Set<string>()
  const roles = new Set<string>()
  for (const [index, layer] of manifest.layers.entries()) {
    validateLayer(layer, index, errors)
    if (ids.has(layer.id)) errors.push(`duplicate layer id: ${layer.id}`)
    ids.add(layer.id)
    if (roles.has(layer.role) && layer.role !== 'accessory') errors.push(`duplicate layer role: ${layer.role}`)
    roles.add(layer.role)
  }

  for (const role of REQUIRED_LAYER_ROLES) {
    if (!roles.has(role)) errors.push(`missing required layer role: ${role}`)
  }

  return { valid: errors.length === 0, errors }
}

export function validateAvatarManifestSet(
  manifests: readonly AvatarSlotManifest[],
): ManifestValidationResult {
  const errors: string[] = []
  if (manifests.length !== AVATAR_SLOT_COUNT) {
    errors.push(`manifest set must contain exactly ${AVATAR_SLOT_COUNT} entries`)
  }

  const slots = new Set<number>()
  const names = new Set<string>()
  for (const manifest of manifests) {
    const result = validateAvatarManifest(manifest)
    errors.push(...result.errors.map((error) => `slot ${manifest.slot}: ${error}`))
    if (slots.has(manifest.slot)) errors.push(`duplicate slot: ${manifest.slot}`)
    slots.add(manifest.slot)
    if (names.has(manifest.name)) errors.push(`duplicate manifest name: ${manifest.name}`)
    names.add(manifest.name)
  }

  for (let slot = 0; slot < AVATAR_SLOT_COUNT; slot += 1) {
    if (!slots.has(slot)) errors.push(`missing slot: ${slot}`)
  }

  return { valid: errors.length === 0, errors }
}

export function assertValidAvatarManifest(manifest: AvatarSlotManifest): void {
  const result = validateAvatarManifest(manifest)
  if (!result.valid) throw new Error(result.errors.join('; '))
}

export function sortedVisibleLayers(manifest: AvatarSlotManifest): readonly AvatarLayerSource[] {
  return manifest.layers
    .filter((layer) => layer.visible)
    .toSorted((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id))
}
