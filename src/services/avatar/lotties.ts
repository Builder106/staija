/**
 * Slot → Lottie animation lookup. Each portrait slot can have a
 * matching Lottie file at `src/assets/avatar-lotties/slot-<N>.json`;
 * when one exists, the Settings hero (or any surface that opts in)
 * plays the Lottie instead of the static PNG. When no file exists
 * for a slot, this returns `null` and the caller falls back to the
 * static thumbnail.
 *
 * Vite's `import.meta.glob` lazy-loads the JSON on first access so
 * unused Lottie files don't bloat the bundle. The actual file
 * production happens in the repository avatar tooling; see
 * `tools/avatars/README.md` for the rigging workflow.
 */

export type LottieJsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | LottieJsonValue[]
  | { [key: string]: LottieJsonValue };

export interface LottieAnimationData {
  v?: string;
  fr?: number;
  ip?: number;
  op?: number;
  w: number;
  h: number;
  nm?: string;
  ddd?: number;
  assets?: LottieJsonValue[];
  layers: LottieJsonValue[];
  [key: string]: LottieJsonValue;
}

// `import.meta.glob` with no `eager: true` returns loaders, not
// modules. Each loader is a `() => Promise<{ default: <json> }>`.
const LOADERS = import.meta.glob<{ default: LottieAnimationData }>(
  '../../assets/avatar-lotties/slot-*.json',
);

const SLOT_FILE_PATTERN = /slot-(\d+)\.json$/;

/**
 * Build the lookup table once. Maps slot index → loader function.
 * Slots without a file simply aren't in the map.
 */
function buildIndex(): Map<number, () => Promise<{ default: LottieAnimationData }>> {
  const index = new Map<number, () => Promise<{ default: LottieAnimationData }>>();
  for (const [path, loader] of Object.entries(LOADERS)) {
    const match = SLOT_FILE_PATTERN.exec(path);
    if (!match) continue;
    const slot = Number.parseInt(match[1], 10);
    if (!Number.isNaN(slot)) index.set(slot, loader);
  }
  return index;
}

const SLOT_INDEX = buildIndex();

function isValidSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < 10;
}

function isAnimationData(value: string | number | boolean | null | undefined | object): value is LottieAnimationData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<LottieAnimationData>;
  return (
    Array.isArray(candidate.layers) &&
    typeof candidate.w === 'number' &&
    typeof candidate.h === 'number'
  );
}

/**
 * Returns true if a Lottie animation file exists for the given slot.
 * Cheap (Map lookup) — call freely.
 */
export function hasLottieForSlot(slot: number): boolean {
  return isValidSlot(slot) && SLOT_INDEX.has(slot);
}

/**
 * Lazy-load the Lottie animation JSON for a slot. Returns null if no
 * file exists. The returned object is the parsed Bodymovin/Lottie
 * JSON shape, ready to hand to `lottie.loadAnimation({ animationData })`.
 */
export async function loadLottieForSlot(slot: number): Promise<LottieAnimationData | null> {
  if (!isValidSlot(slot)) return null;
  const loader = SLOT_INDEX.get(slot);
  if (!loader) return null;
  try {
    const mod = await loader();
    return isAnimationData(mod.default) ? mod.default : null;
  } catch {
    return null;
  }
}
