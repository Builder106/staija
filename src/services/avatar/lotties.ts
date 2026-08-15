/**
 * Slot → Lottie animation lookup. Each portrait slot CAN have a
 * matching Lottie file at `src/assets/avatar-lotties/slot-<N>.json`;
 * when one exists, the Settings hero (or any surface that opts in)
 * plays the Lottie instead of the static PNG. When no file exists
 * for a slot, this returns `null` and the caller falls back to the
 * static thumbnail.
 *
 * Vite's `import.meta.glob` lazy-loads the JSON on first access so
 * unused Lottie files don't bloat the bundle. The actual file
 * production happens in Lottie Creator (manually or via the Creator
 * MCP); see `tools/avatars/README.md` for the rigging workflow.
 */

// `import.meta.glob` with no `eager: true` returns loaders, not
// modules. Each loader is a `() => Promise<{ default: <json> }>`.
const LOADERS = import.meta.glob<{ default: Record<string, unknown> }>(
  '../../assets/avatar-lotties/slot-*.json'
);

const SLOT_FILE_PATTERN = /slot-(\d+)\.json$/;

/**
 * Build the lookup table once. Maps slot index → loader function.
 * Slots without a file simply aren't in the map.
 */
function buildIndex(): Map<number, () => Promise<{ default: Record<string, unknown> }>> {
  const index = new Map<number, () => Promise<{ default: Record<string, unknown> }>>();
  for (const [path, loader] of Object.entries(LOADERS)) {
    const match = SLOT_FILE_PATTERN.exec(path);
    if (!match) continue;
    const slot = Number.parseInt(match[1], 10);
    if (!Number.isNaN(slot)) index.set(slot, loader);
  }
  return index;
}

const SLOT_INDEX = buildIndex();

/**
 * Returns true if a Lottie animation file exists for the given slot.
 * Cheap (Map lookup) — call freely.
 */
export function hasLottieForSlot(slot: number): boolean {
  return SLOT_INDEX.has(slot);
}

/**
 * Lazy-load the Lottie animation JSON for a slot. Returns null if no
 * file exists. The returned object is the parsed Bodymovin/Lottie
 * JSON shape, ready to hand to `lottie.loadAnimation({ animationData })`.
 */
export async function loadLottieForSlot(slot: number): Promise<Record<string, unknown> | null> {
  const loader = SLOT_INDEX.get(slot);
  if (!loader) return null;
  const mod = await loader();
  return mod.default;
}
