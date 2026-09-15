export type MotionPoint = { readonly x: number; readonly y: number }
export type MotionScalarKeyframe = { readonly frame: number; readonly value: number }
export type MotionPointKeyframe = { readonly frame: number; readonly value: MotionPoint }
export type MotionVisibilityKeyframe = { readonly frame: number; readonly value: boolean }

export interface MotionConfig {
  readonly label: string
  readonly rotation: readonly MotionScalarKeyframe[]
  readonly position: readonly MotionPointKeyframe[]
  readonly blink: readonly MotionVisibilityKeyframe[]
  readonly mouth: readonly MotionVisibilityKeyframe[]
  readonly brows: readonly MotionPointKeyframe[]
  readonly head: readonly MotionScalarKeyframe[]
  readonly body: readonly MotionPointKeyframe[]
  readonly hair: readonly MotionPointKeyframe[]
  readonly accessory: readonly MotionScalarKeyframe[]
}

const cycle = (tilt: number, lift: number, phase: number): MotionConfig => ({
  label: `slot-${phase}-idle-expression`,
  rotation: [{ frame: 0, value: 0 }, { frame: 150, value: tilt }, { frame: 300, value: 0 }, { frame: 450, value: -tilt }, { frame: 600, value: 0 }],
  position: [{ frame: 0, value: { x: 128, y: 128 } }, { frame: 150, value: { x: 128, y: 128 - lift } }, { frame: 300, value: { x: 128, y: 128 } }, { frame: 450, value: { x: 128, y: 128 + lift } }, { frame: 600, value: { x: 128, y: 128 } }],
  blink: [{ frame: 0, value: false }, { frame: 250 + phase * 2, value: false }, { frame: 260 + phase * 2, value: true }, { frame: 272 + phase * 2, value: false }, { frame: 600, value: false }],
  mouth: [{ frame: 0, value: false }, { frame: 330 + phase * 3, value: true }, { frame: 420 + phase * 3, value: false }, { frame: 600, value: false }],
  brows: [{ frame: 0, value: { x: 0, y: 0 } }, { frame: 180, value: { x: 0, y: -1.5 } }, { frame: 360, value: { x: 0, y: 0 } }, { frame: 600, value: { x: 0, y: 0 } }],
  head: [{ frame: 0, value: 0 }, { frame: 150, value: tilt * 0.55 }, { frame: 300, value: 0 }, { frame: 450, value: -tilt * 0.55 }, { frame: 600, value: 0 }],
  body: [{ frame: 0, value: { x: 0, y: 0 } }, { frame: 150, value: { x: 0, y: -lift * 0.35 } }, { frame: 300, value: { x: 0, y: 0 } }, { frame: 450, value: { x: 0, y: lift * 0.35 } }, { frame: 600, value: { x: 0, y: 0 } }],
  hair: [{ frame: 0, value: { x: 0, y: 0 } }, { frame: 150, value: { x: tilt * 0.25, y: 0 } }, { frame: 300, value: { x: 0, y: 0 } }, { frame: 450, value: { x: -tilt * 0.25, y: 0 } }, { frame: 600, value: { x: 0, y: 0 } }],
  accessory: [{ frame: 0, value: 0 }, { frame: 150, value: tilt * 0.4 }, { frame: 300, value: 0 }, { frame: 450, value: -tilt * 0.4 }, { frame: 600, value: 0 }],
})

export const MOTION_CONFIGS: Readonly<Record<number, MotionConfig>> = Object.freeze({
  0: cycle(1.2, 1.4, 0), 1: cycle(1.5, 1.8, 1), 2: cycle(1.1, 1.2, 2), 3: cycle(1.7, 1.6, 3), 4: cycle(1.3, 1.5, 4),
  5: cycle(1.8, 1.9, 5), 6: cycle(1.4, 1.3, 6), 7: cycle(1.6, 1.7, 7), 8: cycle(1.2, 1.5, 8), 9: cycle(1.5, 1.4, 9),
})
