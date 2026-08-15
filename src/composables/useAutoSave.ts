/**
 * useAutoSave — generic localStorage form persistence with debounced writes.
 *
 * Backs PRD §4.3 acceptance criterion ("auto-save every 30s"). Use to
 * survive flaky 3G drops on the application form. Storage is signed only
 * with a TTL; no server-side trust needed since the form re-validates on
 * submit anyway.
 *
 * Usage:
 *   const form = ref({ ... })
 *   const { restored, clear, status } = useAutoSave('apply.stepup', form)
 *   // form auto-saves 30s after the last change; auto-restores on mount
 *
 * `restored` is true if state was loaded from localStorage at mount.
 * `clear()` wipes the saved draft (call after successful submit).
 * `status` is a ref<'idle' | 'saving' | 'saved' | 'error'> for UI hints.
 */

import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

const STORAGE_PREFIX = 'staija.draft.';
const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days, per PRD §4.3

interface StoredDraft<T> {
  v: 1;
  savedAt: number;
  data: T;
}

export interface AutoSaveOptions {
  /** Milliseconds to wait after the last change before persisting. Default 30s. */
  debounceMs?: number;
  /** Skip the initial restore on mount (e.g. when editing an existing record). */
  skipRestore?: boolean;
}

export interface AutoSaveHandle {
  restored: Ref<boolean>;
  status: Ref<'idle' | 'saving' | 'saved' | 'error'>;
  lastSavedAt: Ref<Date | null>;
  /** Force a write right now (e.g. on tab close). */
  flush: () => void;
  /** Wipe the saved draft. Call after a successful submit. */
  clear: () => void;
  /**
   * Non-destructive read of the stored draft's savedAt timestamp.
   * Returns null if no draft exists, the draft is past TTL, or
   * storage is unavailable. Useful for "editing an existing record"
   * flows that need to compare local-draft freshness against a
   * server `updatedAt` before deciding to restore.
   */
  peek: () => Date | null;
  /**
   * Destructive — pulls the stored draft into state if one exists
   * within TTL. Returns true if state was overwritten. Designed for
   * `skipRestore: true` callers that want to make the restore
   * decision themselves after loading remote data.
   */
  restore: () => boolean;
}

export function useAutoSave<T extends object>(
  key: string,
  state: Ref<T>,
  options: AutoSaveOptions = {}
): AutoSaveHandle {
  const debounceMs = options.debounceMs ?? 30_000;
  const fullKey = STORAGE_PREFIX + key;
  const restored = ref(false);
  const status = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastSavedAt = ref<Date | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function safeStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
      // Storage may throw on private mode in some browsers.
      window.localStorage.setItem('__staija_probe__', '1');
      window.localStorage.removeItem('__staija_probe__');
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function persist() {
    if (stopped) return;
    const storage = safeStorage();
    if (!storage) {
      status.value = 'error';
      return;
    }
    status.value = 'saving';
    try {
      const payload: StoredDraft<T> = {
        v: 1,
        savedAt: Date.now(),
        data: state.value,
      };
      storage.setItem(fullKey, JSON.stringify(payload));
      lastSavedAt.value = new Date(payload.savedAt);
      status.value = 'saved';
    } catch (err) {
      console.warn('[useAutoSave] persist failed', err);
      status.value = 'error';
    }
  }

  function readDraft(): StoredDraft<T> | null {
    const storage = safeStorage();
    if (!storage) return null;
    const raw = storage.getItem(fullKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredDraft<T>;
      if (parsed.v !== 1 || typeof parsed.savedAt !== 'number') return null;
      if (Date.now() - parsed.savedAt > TTL_MS) {
        storage.removeItem(fullKey);
        return null;
      }
      return parsed;
    } catch (err) {
      console.warn('[useAutoSave] read failed; clearing draft', err);
      storage.removeItem(fullKey);
      return null;
    }
  }

  function peek(): Date | null {
    const draft = readDraft();
    return draft ? new Date(draft.savedAt) : null;
  }

  function restore(): boolean {
    const draft = readDraft();
    if (!draft) return false;
    // Shallow-merge: only override keys that were saved, so the form's
    // default shape (any new fields added since the draft) survives.
    Object.assign(state.value as object, draft.data);
    restored.value = true;
    lastSavedAt.value = new Date(draft.savedAt);
    status.value = 'saved';
    return true;
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    persist();
  }

  function clear() {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const storage = safeStorage();
    storage?.removeItem(fullKey);
    status.value = 'idle';
    lastSavedAt.value = null;
  }

  onMounted(() => {
    if (!options.skipRestore) restore();
  });

  watch(
    state,
    () => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(persist, debounceMs);
    },
    { deep: true }
  );

  // Persist on tab close / page hide so a 30s window doesn't lose work.
  function handleBeforeUnload() {
    if (!stopped) flush();
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
  }

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    }
  });

  return { restored, status, lastSavedAt, flush, clear, peek, restore };
}
