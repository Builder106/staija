import { vi } from 'vitest'

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

// Most service tests replace Firebase modules with focused mocks. Keep the
// shared config mocked as well so pure helpers can import a service module
// without constructing a real Firebase app. The VM verifier deliberately
// excludes `.env.*`, and these tests do not exercise Firebase's network
// behavior, so a test-only mock is safer than dummy credentials or an
// emulator dependency.
vi.mock('../src/config/firebase.ts', () => ({
  auth: { currentUser: null },
  db: {},
  functions: {},
  storage: {},
  publicStorage: {},
  analytics: null,
  performance: null,
  getAppCheckToken: vi.fn(async () => null),
}))

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
