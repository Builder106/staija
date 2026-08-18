/**
 * Staged-file service for the application wizard.
 *
 * The picked-from-disk files (transcript / ID / showcase) and the
 * in-browser audio recordings used to live only in memory — the
 * "Draft restored" banner explicitly told applicants their uploads
 * needed reattaching on resume. This service lifts them into a
 * per-(user, program) staging area in Firebase Storage so the
 * draft's metadata can travel cross-device the same way the form
 * answers do.
 *
 * Layout: `applicationStaging/<uid>/<program>/<kind>-<hash>-<safeName>`
 *
 * - <program> matches the applicationDrafts doc-ID convention so
 *   one staging area corresponds to one draft.
 * - <hash> is 8 random hex bytes so Replace generates a fresh path
 *   even for byte-identical re-picks (a content hash would require
 *   reading the file twice client-side for negligible benefit).
 * - The prefix is its OWN root match block in storage.rules, NOT
 *   nested under applications/{uid}/ — Storage rules are additive
 *   across overlapping matches, so a sub-path would inherit the
 *   outer block's staff-read grant. Staging is applicant-private.
 *
 * Finalize: when the applicant submits, the finalizeApplicationFiles
 * Cloud Function (Slice 4) reads each staged path and copies the
 * bytes to `applications/<uid>/<applicationId>/<kind>`, then
 * deletes the staging entry. Until then, the orphan cron (Slice 5)
 * reaps anything older than 30 days.
 */

import type { DraftProgramSlug, StagedFile } from './applicationDrafts';
import { StorageService } from './storageService';

/** Kinds of staged uploads. `audio` is special-cased — there can be
 *  multiple audio recordings per draft, keyed by motivation field
 *  name, so the path-builder takes an extra `fieldName` parameter. */
export type StagedFileKind = 'transcript' | 'id' | 'showcase' | 'audio';

const STAGING_PREFIX = 'applicationStaging';

/**
 * Single source of truth for the staging path shape. Used by the
 * client (here), and shared with the finalize Cloud Function and
 * orphan cron via re-import — a typo in any one place silently
 * breaks the flow, so everything routes through this function.
 */
export function stagingPathFor(
  uid: string,
  program: DraftProgramSlug,
  kind: StagedFileKind,
  hash: string,
  fileName: string,
  fieldName?: string,
): string {
  const safeName = sanitizeFileName(fileName);
  const kindSegment =
    kind === 'audio' && fieldName ? `audio-${sanitizeFieldName(fieldName)}` : kind;
  return `${STAGING_PREFIX}/${uid}/${program}/${kindSegment}-${hash}-${safeName}`;
}

/** Strip filename characters that confuse Storage's URL encoding or
 *  break log readability. Keeps alphanumerics, dot, hyphen,
 *  underscore. Truncates to 80 chars (Storage allows ~1024 but a
 *  long name hurts more than it helps once collisions are already
 *  prevented by the random hash). */
function sanitizeFileName(name: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return clean || 'file';
}

function sanitizeFieldName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

/** 8 random hex bytes (16 chars). Uses crypto.getRandomValues so
 *  there's no Math.random predictability tax. Falls back to a
 *  timestamp-derived string in environments without WebCrypto. */
function randomHash(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * Upload a file (or recorded audio blob) into the user's staging
 * area. Returns the metadata to persist in the draft payload.
 *
 * Caller owns retries — a network failure here surfaces as a thrown
 * error which the FileUpload component's existing `error` event
 * pathway can surface to the applicant.
 */
export async function uploadToStaging(
  uid: string,
  program: DraftProgramSlug,
  kind: StagedFileKind,
  file: File,
  opts?: { fieldName?: string },
): Promise<StagedFile> {
  const hash = randomHash();
  const storagePath = stagingPathFor(uid, program, kind, hash, file.name, opts?.fieldName);
  await StorageService.uploadFile(file, storagePath);
  return {
    storagePath,
    fileName: file.name,
    sizeBytes: file.size,
    contentType: file.type || 'application/octet-stream',
    uploadedAt: Date.now(),
  };
}

/**
 * Best-effort delete of a staged file. Swallows errors — the orphan
 * cron is the safety net, and a stuck Remove button is a worse UX
 * than a slightly delayed cleanup. Callers should clear local state
 * regardless of whether this resolves successfully.
 */
export async function deleteFromStaging(storagePath: string): Promise<void> {
  try {
    await StorageService.deleteFile(storagePath);
  } catch (err) {
    console.warn('[stagedFiles] deleteFromStaging failed', storagePath, err);
  }
}

/**
 * Verify a staged file's bytes still exist in Storage. Used on
 * resume to prune dead references — the orphan cron may have reaped
 * a file referenced by a stale draft payload. Returns false on any
 * error (missing, permission, network); the caller treats false as
 * "drop this entry from local state".
 *
 * Uses getDownloadURL because it's a single SDK round-trip that
 * exercises the same auth/rules path that an actual fetch would —
 * cheaper than HEAD-ing the URL ourselves.
 */
export async function verifyStagedFile(storagePath: string): Promise<boolean> {
  try {
    await StorageService.getFileURL(storagePath);
    return true;
  } catch {
    return false;
  }
}
