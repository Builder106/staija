/**
 * Test setup. Runs once before any test file loads.
 *
 * vitest 4 + happy-dom 20 ships a `window.localStorage` whose
 * `getItem`/`setItem` aren't reachable as functions in this combo
 * (probed empirically). Replace it with an in-memory Storage shim so
 * tests exercise the unit under test, not the env's plumbing. The
 * shim is set up at the global level (defineProperty on `window` and
 * `globalThis`) before any test file's imports execute, so modules
 * that read localStorage at top-level (e.g. useTheme) see the shim.
 */

const memory = new Map<string, string>()

const shim: Storage = {
  get length() {
    return memory.size
  },
  key(i: number) {
    return Array.from(memory.keys())[i] ?? null
  },
  getItem(k: string) {
    return memory.has(k) ? (memory.get(k) as string) : null
  },
  setItem(k: string, v: string) {
    memory.set(k, String(v))
  },
  removeItem(k: string) {
    memory.delete(k)
  },
  clear() {
    memory.clear()
  },
}

if (typeof document !== 'undefined') {
  Object.defineProperty(document, 'compatMode', {
    value: 'CSS1Compat',
    writable: true,
    configurable: true,
  })
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  })
}
if (typeof globalThis !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  })
}

