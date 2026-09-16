import {
  AVATAR_CANVAS_SIZE,
  type AvatarLayerRole,
  type AvatarSlot,
  type AvatarSlotManifest,
  type AvatarTransform,
} from './contracts.ts'

const SLOT_NAMES = [
  'portrait-bald',
  'portrait-afro-medium',
  'portrait-locs',
  'portrait-braids-long',
  'portrait-hijab',
  'portrait-gele',
  'portrait-twa-glasses',
  'portrait-twists-puff',
  'portrait-fade-glasses',
  'portrait-bantu',
] as const

export const REQUIRED_LAYER_ROLES: readonly AvatarLayerRole[] = [
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
]

export const IDENTITY_TRANSFORM: AvatarTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchor: { x: AVATAR_CANVAS_SIZE / 2, y: AVATAR_CANVAS_SIZE / 2 },
}

function layer(
  slot: AvatarSlot,
  role: AvatarLayerRole,
  zIndex: number,
  motionId?: string,
): AvatarSlotManifest['layers'][number] {
  const transform = layerTransform(slot, role)
  return {
    id: role,
    role,
    file: `tools/avatars/layers/slot-${slot}/${role}.png`,
    zIndex: layerZIndex(slot, role, zIndex),
    visible:
      role !== 'eyes-closed' &&
      role !== 'mouth-smile' &&
      !(slot === 0 && (role === 'hair-back' || role === 'hair-front')) &&
      !(slot === 1 && role === 'hair-back') &&
      !((slot === 6 || slot === 8) && role === 'hair-front'),
    opacity: 1,
    blendMode: 'normal',
    transform,
    ...(motionId ? { motionId } : {}),
  }
}

function centeredTransform(scale: number, x = 0, y = 0): AvatarTransform {
  return {
    ...IDENTITY_TRANSFORM,
    x,
    y,
    scaleX: scale,
    scaleY: scale,
  }
}

const LAYER_TRANSFORMS: Partial<Record<AvatarLayerRole, AvatarTransform>> = {
  'eyes-open': centeredTransform(0.5),
  'eyes-closed': centeredTransform(0.5),
  brows: centeredTransform(0.6, 0, -10),
  'mouth-rest': centeredTransform(0.5, 0, 28),
  'mouth-smile': centeredTransform(0.5, 0, 28),
  accessory: centeredTransform(0.5),
}

function layerTransform(slot: AvatarSlot, role: AvatarLayerRole): AvatarTransform {
  if (role === 'hair-front' && slot === 1) return centeredTransform(1.25)
  if (role === 'hair-front' && (slot === 7 || slot === 9)) return centeredTransform(0.82, 0, -42)
  return LAYER_TRANSFORMS[role] ?? IDENTITY_TRANSFORM
}

function layerZIndex(slot: AvatarSlot, role: AvatarLayerRole, zIndex: number): number {
  if (role === 'hair-back' && (slot === 6 || slot === 8)) return 30
  return zIndex
}

function manifest(slot: AvatarSlot, name: string): AvatarSlotManifest {
  const roles: readonly [AvatarLayerRole, number][] = [
    ['background', 0],
    ['body', 10],
    ['head', 20],
    ['hair-back', 15],
    ['hair-front', 40],
    ['eyes-open', 50],
    ['eyes-closed', 51],
    ['brows', 52],
    ['mouth-rest', 60],
    ['mouth-smile', 61],
    ['accessory', 70],
  ]

  return {
    schemaVersion: 1,
    slot,
    name,
    canvas: {
      width: AVATAR_CANVAS_SIZE,
      height: AVATAR_CANVAS_SIZE,
      colorSpace: 'srgb',
      background: 'opaque',
    },
    layers: roles.map(([role, zIndex]) => layer(slot, role, zIndex, `slot-${slot}-${role}`)),
    flattenedOutput: `tools/avatars/composited/${name}.png`,
    staticOutput: `public/avatars/portrait-${slot}.png`,
    lottieOutput: `src/assets/avatar-lotties/slot-${slot}.json`,
  }
}

export const AVATAR_MANIFESTS: readonly AvatarSlotManifest[] = SLOT_NAMES.map((name, slot) =>
  manifest(slot as AvatarSlot, name),
)
