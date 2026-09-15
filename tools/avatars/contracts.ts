export const AVATAR_SLOT_COUNT = 10 as const
export const AVATAR_CANVAS_SIZE = 256 as const
export const AVATAR_FRAME_RATE = 60 as const
export const AVATAR_DURATION_FRAMES = 600 as const

export type AvatarSlot = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export type AvatarLayerRole =
  | 'background'
  | 'body'
  | 'head'
  | 'hair-back'
  | 'hair-front'
  | 'eyes-open'
  | 'eyes-closed'
  | 'brows'
  | 'mouth-rest'
  | 'mouth-smile'
  | 'accessory'

export type LayerBlendMode = 'normal' | 'multiply' | 'screen'
export type MotionEasing = 'linear' | 'ease-in-out' | 'hold'

export interface AvatarPoint {
  readonly x: number
  readonly y: number
}

export interface AvatarTransform {
  readonly x: number
  readonly y: number
  readonly scaleX: number
  readonly scaleY: number
  readonly rotation: number
  readonly anchor: AvatarPoint
}

export interface AvatarLayerSource {
  readonly id: string
  readonly role: AvatarLayerRole
  readonly file: string
  readonly zIndex: number
  readonly visible: boolean
  readonly opacity: number
  readonly blendMode: LayerBlendMode
  readonly transform: AvatarTransform
  readonly motionId?: string
}

export interface AvatarSlotManifest {
  readonly schemaVersion: 1
  readonly slot: AvatarSlot
  readonly name: string
  readonly canvas: {
    readonly width: typeof AVATAR_CANVAS_SIZE
    readonly height: typeof AVATAR_CANVAS_SIZE
    readonly colorSpace: 'srgb'
    readonly background: 'opaque' | 'transparent'
  }
  readonly layers: readonly AvatarLayerSource[]
  readonly flattenedOutput: string
  readonly staticOutput: string
  readonly lottieOutput: string
}

export interface CompositeOptions {
  readonly slot: AvatarSlot
  readonly outputPath: string
  readonly force: boolean
}

export interface CompositeResult {
  readonly slot: AvatarSlot
  readonly outputPath: string
  readonly width: typeof AVATAR_CANVAS_SIZE
  readonly height: typeof AVATAR_CANVAS_SIZE
  readonly sha256: string
  readonly layerIds: readonly string[]
}

export interface MotionKeyframe<T> {
  readonly frame: number
  readonly value: T
  readonly easing: MotionEasing
}

export type AvatarMotionTrack =
  | {
      readonly target:
        | 'transform.position'
        | 'transform.scale'
        | 'transform.rotation'
        | 'opacity'
      readonly layerId: string
      readonly keyframes: readonly MotionKeyframe<number | AvatarPoint>[]
    }
  | {
      readonly target: 'visibility'
      readonly layerId: string
      readonly keyframes: readonly MotionKeyframe<boolean>[]
    }

export interface AvatarMotionConfig {
  readonly schemaVersion: 1
  readonly id: string
  readonly label: string
  readonly loop: true
  readonly frameRate: typeof AVATAR_FRAME_RATE
  readonly durationFrames: typeof AVATAR_DURATION_FRAMES
  readonly tracks: readonly AvatarMotionTrack[]
}

export interface TraceProfile {
  readonly preset: 'poster'
  readonly clustering: 'color-cluster'
  readonly hierarchical: 'stacked' | 'cutout'
  readonly mode: 'spline' | 'polygon'
  readonly filterSpeckle: number
  readonly simplify?: number
  readonly maxColors: number
  readonly optimize: 0 | 1 | 2
}

export interface TraceRequest {
  readonly inputPath: string
  readonly outputPath: string
  readonly profile: TraceProfile
  readonly slot: AvatarSlot
  readonly inputSha256: string
}

export interface TraceResult {
  readonly engine: string
  readonly engineVersion: string
  readonly profile: string
  readonly slot: AvatarSlot
  readonly inputPath: string
  readonly outputPath: string
  readonly inputSha256: string
  readonly outputSha256: string
  readonly svg: string
}

export interface TraceBackend {
  readonly name: string
  readonly version: string
  trace(request: TraceRequest): Promise<TraceResult>
}
