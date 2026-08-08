/**
 * Seed-deterministic portrait selection.
 *
 * **History:** This module originally defined a custom Dicebear v9
 * `Style<T>` with a `StyleCreate` callback that used DiceBear's
 * internal PRNG to `prng.pick()` a portrait from the parts library.
 * DiceBear v10 dropped that entire programmatic API in favour of a
 * JSON-definition model that can't represent raw SVG fragment
 * variants, and the layered-avatar feature that exercised this code
 * at runtime is paused anyway. Rather than migrate to a v10 API that
 * doesn't fit, the dependency was removed entirely and replaced with
 * a lightweight djb2 hash — the only thing DiceBear was providing
 * was `hash(seed) % array.length`.
 *
 * Usage:
 *   import { pickPortrait } from './style'
 *   const svgFragment = pickPortrait(user.uid)
 */

import { PORTRAITS } from './parts'

/**
 * djb2 string hash — fast, deterministic, good distribution for
 * short to medium strings like UIDs and email addresses.
 *
 * Returns a 32-bit unsigned integer.
 */
function djb2(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  }
  return hash
}

/**
 * Seed-deterministic portrait selection. The same seed always picks
 * the same portrait. Returns an SVG fragment string (the inner content
 * of the avatar, without the `<svg>` envelope).
 *
 * If PORTRAITS hasn't been populated yet (the parts.ts stubs are empty
 * strings), returns an empty string — the caller still produces a valid
 * SVG envelope, just without illustration content.
 */
export function pickPortrait(seed: string): string {
  if (PORTRAITS.length === 0) return ''
  return PORTRAITS[djb2(seed) % PORTRAITS.length]
}
