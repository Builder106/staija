import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import type { Program } from '../services/firebase';
import {
  PROGRAM_FALLBACKS,
  toProgramView,
  type ProgramSlug,
  type ProgramView,
} from '../services/programContent';
import { ProgramService } from '../services/programService';

export type ApplicationStatus = 'open' | 'closed' | 'upcoming' | null;

export interface UseProgramResult {
  /** Renderable content — fallback-first, replaced by Firestore when a doc exists. */
  program: Ref<ProgramView | null>;
  /** Raw Firestore doc when one exists — the only source of real dates. */
  programDoc: Ref<Program | null>;
  /**
   * Application window status from the Firestore doc's dates. `null` when
   * no live program doc exists (fresh project) — treated as "open" so
   * dev / staging always shows a working CTA.
   */
  applicationStatus: Ref<ApplicationStatus>;
  isApplyOpen: ComputedRef<boolean>;
  closedReason: ComputedRef<'upcoming' | 'closed'>;
  /**
   * True once the Firestore load has settled (doc found, doc missing, or
   * fetch failed) — false during the brief window between mount and that
   * resolution. `isApplyOpen` treats a still-unresolved `applicationStatus`
   * the same as "open" (see its note above), so anything that renders the
   * open/closed CTA or status chip should gate on this first to avoid a
   * flash of "open" for a program that's actually upcoming/closed.
   */
  isStatusResolved: Ref<boolean>;
}

// Shared Firestore-load + application-window logic for the program detail
// views. The slug is fixed per page (each program has a dedicated route
// and component), so a single onMounted load is enough — no slug watcher.
export function useProgram(slug: ProgramSlug): UseProgramResult {
  // Start with the fallback already painted so the first paint isn't blank
  // while Firestore loads. The async fetch then replaces the content with
  // the canonical version if a Program doc exists.
  const program = ref<ProgramView | null>(PROGRAM_FALLBACKS[slug] ?? null);
  const programDoc = ref<Program | null>(null);
  const applicationStatus = ref<ApplicationStatus>(null);
  const isStatusResolved = ref(false);

  const isApplyOpen = computed(
    () => applicationStatus.value === null || applicationStatus.value === 'open',
  );
  // 'upcoming' / 'closed' both swap the Apply CTA's target to
  // /stay-connected so visitors get an honest destination instead of a
  // dead form.
  const closedReason = computed<'upcoming' | 'closed'>(() =>
    applicationStatus.value === 'upcoming' ? 'upcoming' : 'closed',
  );

  async function loadProgram(): Promise<void> {
    try {
      const fromStore = await ProgramService.getProgram(slug);
      if (fromStore) {
        program.value = toProgramView(fromStore);
        programDoc.value = fromStore;
        applicationStatus.value = ProgramService.getApplicationStatus(fromStore);
      }
    } catch {
      // Network error / permission issue — keep the fallback in view
      // and the CTA in its default "open" stance.
    } finally {
      isStatusResolved.value = true;
    }
  }

  onMounted(loadProgram);

  return { program, programDoc, applicationStatus, isApplyOpen, closedReason, isStatusResolved };
}
