/**
 * SVG-rendering avatar helpers. Split from index.ts so that the 20 MB
 * `parts.ts` source library only loads for consumers that actually
 * render SVG (currently none in the eagerly-loaded graph — the layered-
 * avatar feature is paused). Keeping these out of index.ts means
 * SiteHeader's `resolveAvatarSrc` import doesn't drag PORTRAITS into
 * the main chunk via tree-shaking-defeating top-level imports.
 *
 * Two ways to use:
 *   - `avatarSvg(seed)`           → raw `<svg>...</svg>` string
 *   - `avatarDataUri(seed)`       → `data:image/svg+xml;...` for `<img src>`
 *
 * Avatars are content-addressed by seed: the same seed always returns
 * the same result, so a memoization cache keyed on seed is safe and
 * cheap. Cache lives in module memory; if it ever gets large, the LRU
 * cap below will evict.
 */

import { pickPortrait } from './style'
import { PORTRAITS } from './parts'

/** Shared SVG envelope open tag — matches the 80×80 viewBox the parts library is authored against. */
const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none" shape-rendering="auto">'

// Module-level cache. Seed → result. The realistic upper bound is
// "number of distinct users you've ever rendered an avatar for" — for
// a single browser session that's small. Cap at 500 to keep the worst
// case bounded if something goes pathological.
const SVG_CACHE = new Map<string, string>()
const DATA_URI_CACHE = new Map<string, string>()
const CACHE_CAP = 500

function cached<V>(map: Map<string, V>, key: string, compute: () => V): V {
  const hit = map.get(key)
  if (hit !== undefined) return hit
  if (map.size >= CACHE_CAP) {
    // Drop the oldest entry. Insertion order is iteration order in JS Maps.
    const oldest = map.keys().next().value
    if (oldest !== undefined) map.delete(oldest)
  }
  const value = compute()
  map.set(key, value)
  return value
}

export function avatarSvg(seed: string): string {
  return cached(SVG_CACHE, seed, () => {
    const portrait = pickPortrait(seed)
    return `${SVG_OPEN}${portrait}</svg>`
  })
}

export function avatarDataUri(seed: string): string {
  return cached(DATA_URI_CACHE, seed, () => {
    const svg = avatarSvg(seed)
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  })
}

/**
 * Render a specific portrait slot wrapped in the same SVG envelope
 * the seeded path produces. Used by the avatar preview route to pin
 * to a known portrait without hunting for a seed that maps to it via
 * the hash-based PRNG.
 *
 * Slot indices match `tools/avatars/prompts.ts` — e.g. 1 is the
 * afro-medium portrait used as the Phase 1 test slot.
 *
 * Slot results are stable (the library is module-frozen) and each
 * data URI is several MB. Caching here is essential: without it, the
 * AvatarPicker re-encodes 10 large SVGs on every render — enough to
 * crash a Chrome tab on modest hardware.
 */
const SLOT_SVG_CACHE = new Map<number, string>()
const SLOT_DATA_URI_CACHE = new Map<number, string>()

export function avatarSvgForSlot(slot: number): string {
  const cached = SLOT_SVG_CACHE.get(slot)
  if (cached !== undefined) return cached
  const portrait = PORTRAITS[slot]
  if (portrait === undefined) {
    throw new Error(
      `avatarSvgForSlot: slot ${slot} is out of range (0–${PORTRAITS.length - 1})`,
    )
  }
  const svg = `${SVG_OPEN}${portrait}</svg>`
  SLOT_SVG_CACHE.set(slot, svg)
  return svg
}

export function avatarDataUriForSlot(slot: number): string {
  const cached = SLOT_DATA_URI_CACHE.get(slot)
  if (cached !== undefined) return cached
  const svg = avatarSvgForSlot(slot)
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  SLOT_DATA_URI_CACHE.set(slot, uri)
  return uri
}