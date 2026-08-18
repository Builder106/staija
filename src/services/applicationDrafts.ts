/**
 * Application drafts — Firestore mirror of the in-progress wizard state.
 *
 * Why a separate collection (not `applications/{id}` with status='draft'):
 *   - One stable doc per (user, program) keyed at `${uid}_${program}` so
 *     repeated saves upsert in place and don't litter the apps collection
 *     with half-finished records.
 *   - Submission flow creates the *real* `applications/{auto-id}` doc with
 *     the full validated payload; the draft is deleted at that point.
 *
 * Local-first writes still happen in localStorage via useAutoSave (cheap,
 * offline-safe, no quota burn). This service mirrors the same payload to
 * Firestore on the same debounce so the draft follows the *account* across
 * devices and browsers — the half-truth in "Draft · on this device" goes
 * away once a sync round-trip lands.
 *
 * Rules (firestore.rules): owner-only read/write on the doc; deletes also
 * allowed by staff/admin for cleanup.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import { db, storage } from '../config/firebase';

export type DraftProgramSlug = 'stepup-scholars' | 'dynamerge';

/**
 * Metadata for a file or audio blob the applicant has uploaded into
 * the per-(user, program) staging area in Firebase Storage but hasn't
 * yet submitted. Lives in the draft payload so the applicant's
 * uploads follow the account across devices the same way their form
 * answers do. Bytes themselves live in Storage; only this metadata
 * crosses to Firestore.
 */
export interface StagedFile {
  /** Storage path under `applicationStaging/<uid>/<program>/...`.
   *  Source of truth for the bytes; everything else here is for the
   *  pre-attached UI ("transcript-CV.pdf · 2.3 MB"). */
  storagePath: string;
  /** Original filename the applicant picked (or one we synthesised
   *  for audio: `audio-<fieldName>-<duration>s.webm`). */
  fileName: string;
  sizeBytes: number;
  contentType: string;
  /** Plain ms epoch — NOT a Firestore Timestamp. Firestore serialises
   *  nested Timestamps inconsistently inside opaque payload objects,
   *  so we keep this as a primitive for safe local/cloud round-trip. */
  uploadedAt: number;
}

/** All staged uploads attached to a single (user, program) draft.
 *  Keys correspond to the wizard's file inputs. The `audio` map is
 *  keyed by the motivation step's field name (today there's only one,
 *  but the wizard schema supports multiple per program). */
export interface StagedFiles {
  transcript?: StagedFile;
  id?: StagedFile;
  showcase?: StagedFile;
  audio?: Record<string, StagedFile>;
}

/** Shape stored in Firestore. `payload` is opaque — matches what Apply.vue
 *  hands to useAutoSave so the same restore code path works for both. */
export interface ApplicationDraftDoc {
  userId: string;
  program: DraftProgramSlug;
  /** Wizard form state. Intentionally untyped at the service layer — the
   *  consumer (Apply.vue) owns the shape and stays the source of truth. */
  payload: Record<string, unknown>;
  /** Client-side ms epoch. Used to compare against the local-storage
   *  draft's `savedAt` on mount and pick the newer one. We store this in
   *  addition to `updatedAt` so the comparison doesn't have to wait for
   *  the server timestamp to materialise on first write. */
  savedAt: number;
  updatedAt?: unknown; // serverTimestamp
  /** Tombstone flag. Set true by deleteDraft so other devices' auto-sync
   *  can distinguish "the user actively deleted this" from "the cloud
   *  copy was never written". Without it, a delete on device A would be
   *  silently reverted by device B's localStorage on its next dashboard
   *  load. */
  __deleted?: boolean;
  /** Ms epoch when the tombstone was written. Compared against a stale
   *  local draft's savedAt: if deletedAt > local.savedAt, the deletion
   *  is newer than the local copy and wins. */
  deletedAt?: number;
}

function draftId(userId: string, program: DraftProgramSlug): string {
  return `${userId}_${program}`;
}

export async function getDraft(
  userId: string,
  program: DraftProgramSlug,
): Promise<ApplicationDraftDoc | null> {
  try {
    const ref = doc(db, 'applicationDrafts', draftId(userId, program));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as ApplicationDraftDoc;
  } catch (err) {
    // Don't let a transient Firestore hiccup break the form — localStorage
    // is still the primary write target; cloud is a best-effort mirror.
    console.warn('[applicationDrafts] getDraft failed', err);
    return null;
  }
}

export async function saveDraft(
  userId: string,
  program: DraftProgramSlug,
  payload: Record<string, unknown>,
): Promise<boolean> {
  try {
    const ref = doc(db, 'applicationDrafts', draftId(userId, program));
    await setDoc(
      ref,
      {
        userId,
        program,
        payload,
        savedAt: Date.now(),
        updatedAt: serverTimestamp(),
        // Explicitly clear the tombstone. A save after a delete means
        // the applicant restarted the draft (or auto-sync revived it
        // because deletedAt < local.savedAt). Either way the doc is
        // now active again.
        __deleted: false,
      },
      { merge: true },
    );
    return true;
  } catch (err) {
    // Returning false (vs throwing) preserves the local-first
    // contract — callers can decide whether to retry, surface an
    // emergency-state chip, etc. The dashboard relies on this to
    // distinguish "successfully synced" from "tried and failed".
    console.warn('[applicationDrafts] saveDraft failed', err);
    return false;
  }
}

/**
 * Soft-delete: leaves a tombstone (`__deleted: true` + `deletedAt`)
 * on the Firestore doc so other devices' auto-sync can detect "the
 * user actively deleted this draft" vs. "the cloud copy was never
 * written". Without a tombstone, a delete on device A is silently
 * reverted by device B's stale localStorage on its next dashboard
 * load.
 *
 * The payload field is wiped (set to {}) so we're not retaining
 * personal data the applicant asked to discard.
 */
export async function deleteDraft(userId: string, program: DraftProgramSlug): Promise<void> {
  try {
    // Best-effort: wipe any staged uploads the applicant pre-uploaded
    // for this draft before tombstoning the doc. The orphan cron sweeps
    // anything we miss, so failures here are non-fatal. We fire all
    // deletes in parallel because we don't care which finishes first —
    // the cron picks up stragglers either way.
    const stagedPaths = collectStagedPaths(await readPayload(userId, program));
    if (stagedPaths.length > 0) {
      await Promise.allSettled(
        stagedPaths.map((path) =>
          deleteObject(storageRef(storage, path)).catch((err) => {
            console.warn('[applicationDrafts] deleteDraft staged-file cleanup failed', path, err);
          }),
        ),
      );
    }
    await setDoc(
      doc(db, 'applicationDrafts', draftId(userId, program)),
      {
        userId,
        program,
        payload: {},
        savedAt: Date.now(),
        updatedAt: serverTimestamp(),
        __deleted: true,
        deletedAt: Date.now(),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn('[applicationDrafts] deleteDraft failed', err);
  }
}

/** Read just enough of the draft to enumerate staged uploads. Returns
 *  an empty object on any failure — the caller treats that as "nothing
 *  to clean up", and the orphan cron sweeps stragglers regardless. */
async function readPayload(
  userId: string,
  program: DraftProgramSlug,
): Promise<Record<string, unknown>> {
  try {
    const snap = await getDoc(doc(db, 'applicationDrafts', draftId(userId, program)));
    if (!snap.exists()) return {};
    const payload = (snap.data() as ApplicationDraftDoc).payload;
    return (payload as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

/** Walk a draft payload and pull every staged-file Storage path. Defensive
 *  about shape — old drafts predate StagedFiles and won't have the field. */
function collectStagedPaths(payload: Record<string, unknown>): string[] {
  const stagedFiles = payload.stagedFiles as StagedFiles | undefined;
  if (!stagedFiles) return [];
  const paths: string[] = [];
  for (const key of ['transcript', 'id', 'showcase'] as const) {
    const entry = stagedFiles[key];
    if (entry?.storagePath) paths.push(entry.storagePath);
  }
  if (stagedFiles.audio) {
    for (const entry of Object.values(stagedFiles.audio)) {
      if (entry?.storagePath) paths.push(entry.storagePath);
    }
  }
  return paths;
}

/** List every cloud draft the current user has — used by the applicant
 *  dashboard's "Drafts in progress" surface so the card shows up on a
 *  freshly-installed device even before the user touches the wizard. */
export async function listUserDrafts(userId: string): Promise<ApplicationDraftDoc[]> {
  try {
    const q = query(collection(db, 'applicationDrafts'), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ApplicationDraftDoc);
  } catch (err) {
    console.warn('[applicationDrafts] listUserDrafts failed', err);
    return [];
  }
}

/**
 * Live-listen for changes to a single draft doc. Fires the callback
 * with the current doc (or null if the path doesn't exist yet) on
 * every Firestore mutation — most importantly, on a soft-delete from
 * another device, so an open wizard can detect "the applicant
 * discarded this somewhere else" and ask the user how to resolve.
 *
 * Returns an Unsubscribe the caller MUST invoke on unmount.
 */
export function watchDraftDoc(
  userId: string,
  program: DraftProgramSlug,
  onChange: (draft: ApplicationDraftDoc | null) => void,
): Unsubscribe {
  const ref = doc(db, 'applicationDrafts', draftId(userId, program));
  return onSnapshot(
    ref,
    (snap) => {
      onChange(snap.exists() ? (snap.data() as ApplicationDraftDoc) : null);
    },
    (err) => {
      console.warn('[applicationDrafts] watchDraftDoc stream error', err);
      onChange(null);
    },
  );
}

/**
 * Live-listen for changes to the current user's drafts. Fires the
 * callback with the full draft list on every Firestore mutation: a
 * create, an update (e.g. saveDraft from another device), or a soft-
 * delete (deleteDraft writing a tombstone). Returns an unsubscribe
 * function the caller MUST call on unmount, otherwise the listener
 * leaks across route changes.
 *
 * Why a live listener vs. polling: cross-device deletes and saves
 * propagate in <1s without any user-initiated refresh. The applicant
 * dashboard uses this so a delete on phone visibly disappears from
 * PC immediately, instead of waiting for the next dashboard load.
 *
 * Errors during the snapshot stream are logged and the callback is
 * invoked with an empty array — degrades to "no drafts visible"
 * rather than crashing the dashboard.
 */
export function watchUserDrafts(
  userId: string,
  onChange: (drafts: ApplicationDraftDoc[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'applicationDrafts'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => d.data() as ApplicationDraftDoc));
    },
    (err) => {
      console.warn('[applicationDrafts] watchUserDrafts stream error', err);
      onChange([]);
    },
  );
}
