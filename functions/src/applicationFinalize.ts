/**
 * finalizeApplicationFiles — server-side copy from per-applicant
 * staging into the canonical per-application Storage folder.
 *
 * Background. The wizard now stages picked files and recorded audio
 * into `applicationStaging/<uid>/<program>/...` the moment they're
 * selected (see src/services/stagedFiles.ts). That lets the
 * applicant's draft carry uploads across devices the same way text
 * answers already do.
 *
 * When the applicant submits, those staged bytes need to land at
 * `applications/<uid>/<applicationId>/...` so admin/staff (who can
 * read that prefix) can review them. Doing the copy client-side would
 * require the browser to download + re-upload N files for no reason
 * — the bytes are already in Storage. This callable copies them
 * server-side, deletes the staging entries, and patches the
 * `applications/{id}.documents` Firestore field with the final paths
 * so the admin UI knows where to look.
 *
 * Auth model. The caller must be authenticated AND own the target
 * `applications/{id}` doc (its `userId` field must match
 * `context.auth.uid`). Every staging path the caller passes is also
 * validated against `applicationStaging/<uid>/<program>/` — even with
 * a hijacked client, you can't ask this function to graft someone
 * else's staged file onto your application.
 *
 * Idempotency. `bucket.file(...).copy(dest)` overwrites the
 * destination, and `.delete()` tolerates a missing source. Re-running
 * with the same input (e.g. a retry after a partial network failure)
 * produces the same end state. Path validation drift between this
 * function, the client, the storage rule, and the orphan cron is the
 * one place this could quietly break — the staging prefix + format
 * are defined as constants here and duplicated in
 * src/services/stagedFiles.ts; keep them in sync.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const STAGING_PREFIX = 'applicationStaging'

type ProgramSlug = 'stepup-scholars' | 'dynamerge'

interface FinalizeInput {
  applicationId: string
  program: ProgramSlug
  /** Map of logical kind -> staging storage path. Keys are
   *  `transcript`, `id`, `showcase`, or `audio:<fieldName>`. */
  stagedPaths: Record<string, string>
}

interface FinalizeResult {
  /** Same keys as the input map, values are the FINAL storage paths
   *  under `applications/<uid>/<applicationId>/`. */
  finalized: Record<string, string>
}

function isValidProgram(
  value: string | number | boolean | null | undefined | object,
): value is ProgramSlug {
  return value === 'stepup-scholars' || value === 'dynamerge'
}

/** Derive the leaf filename from a staging path so the final path
 *  preserves the original safeName (with extension). Staging paths
 *  look like `applicationStaging/<uid>/<program>/<kind>-<hash>-<safe>`
 *  but `<safe>` itself can contain dashes, so we walk past the kind
 *  segment + hash by counting two leading dashes. */
function safeNameFromStagingPath(stagingPath: string, kindSegment: string): string {
  const trimmedPrefix = stagingPath.slice(stagingPath.lastIndexOf('/') + 1)
  // <kindSegment>-<hash>-<safeName>
  const expectedHead = `${kindSegment}-`
  if (!trimmedPrefix.startsWith(expectedHead)) return trimmedPrefix
  const afterKind = trimmedPrefix.slice(expectedHead.length)
  const dashIdx = afterKind.indexOf('-')
  if (dashIdx === -1) return afterKind
  return afterKind.slice(dashIdx + 1)
}

/** Build the final storage path for a given kind. Audio keys are
 *  namespaced `audio:<fieldName>` on the way in; the final path
 *  collapses to `audio-<fieldName>-<safeName>` so admin Console
 *  filenames stay readable. */
function finalPathFor(
  uid: string,
  applicationId: string,
  kind: string,
  stagingPath: string,
): { finalPath: string; documentsKey: string; documentsParent?: 'audio' } {
  if (kind === 'transcript' || kind === 'id' || kind === 'showcase') {
    const safeName = safeNameFromStagingPath(stagingPath, kind)
    return {
      finalPath: `applications/${uid}/${applicationId}/${kind}-${safeName}`,
      documentsKey: kind,
    }
  }
  if (kind.startsWith('audio:')) {
    const fieldName = kind.slice('audio:'.length).replace(/[^a-zA-Z0-9_-]+/g, '-')
    const kindSegment = `audio-${fieldName}`
    const safeName = safeNameFromStagingPath(stagingPath, kindSegment)
    return {
      finalPath: `applications/${uid}/${applicationId}/${kindSegment}-${safeName}`,
      documentsKey: fieldName,
      documentsParent: 'audio',
    }
  }
  throw new HttpsError('invalid-argument', `Unknown staging kind: ${kind}`)
}

export const finalizeApplicationFiles = onCall<FinalizeInput>(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    enforceAppCheck: true,
  },
  async (req): Promise<FinalizeResult> => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'You must be signed in.')
    const uid = req.auth.uid

    const input = req.data ?? ({} as FinalizeInput)
    if (!input.applicationId || typeof input.applicationId !== 'string') {
      throw new HttpsError('invalid-argument', 'applicationId required.')
    }
    if (!isValidProgram(input.program)) {
      throw new HttpsError('invalid-argument', 'program must be stepup-scholars or dynamerge.')
    }
    if (!input.stagedPaths || typeof input.stagedPaths !== 'object') {
      throw new HttpsError('invalid-argument', 'stagedPaths required.')
    }
    // Empty map is a no-op (applicant submitted with no files attached).
    // Don't error — just return { finalized: {} }.
    const entries = Object.entries(input.stagedPaths)
    if (entries.length === 0) return { finalized: {} }

    // Verify the caller owns the target application before doing any
    // Storage work. A compromised client could pass a stranger's
    // applicationId and ask us to copy their own staging into the
    // stranger's folder — we deny.
    const db = getFirestore()
    const appRef = db.collection('applications').doc(input.applicationId)
    const appSnap = await appRef.get()
    if (!appSnap.exists) {
      throw new HttpsError('not-found', `Application ${input.applicationId} not found.`)
    }
    const appData = appSnap.data() as { userId?: string; program?: string } | undefined
    if (appData?.userId !== uid) {
      throw new HttpsError(
        'permission-denied',
        'You can only finalize files for your own application.',
      )
    }

    const bucket = getStorage().bucket()
    const expectedPrefix = `${STAGING_PREFIX}/${uid}/${input.program}/`
    const finalized: Record<string, string> = {}
    const documentsPatch: Record<string, string> = {}
    const audioPatch: Record<string, string> = {}
    const errors: string[] = []

    for (const [kind, stagingPath] of entries) {
      if (typeof stagingPath !== 'string' || !stagingPath.startsWith(expectedPrefix)) {
        throw new HttpsError(
          'permission-denied',
          `stagedPaths[${kind}] must live under ${expectedPrefix}`,
        )
      }
      try {
        const staged = bucket.file(stagingPath)
        const [exists] = await staged.exists()
        if (!exists) {
          // Treat a missing staged file as a soft error — applicant
          // may have Removed the entry between the last autosave and
          // submit. Skip and log; the final application just won't
          // reference this kind.
          console.warn(`[finalizeApplicationFiles] staging missing: ${stagingPath}`)
          continue
        }
        const { finalPath, documentsKey, documentsParent } = finalPathFor(
          uid,
          input.applicationId,
          kind,
          stagingPath,
        )
        await staged.copy(bucket.file(finalPath))
        try {
          await staged.delete()
        } catch (err) {
          // Copy succeeded — leftover staging entry will be reaped
          // by the orphan cron. Don't fail the whole call for this.
          console.warn(
            `[finalizeApplicationFiles] staging delete failed (${stagingPath}): ${err instanceof Error ? err.message : String(err)}`,
          )
        }
        finalized[kind] = finalPath
        if (documentsParent === 'audio') audioPatch[documentsKey] = finalPath
        else documentsPatch[documentsKey] = finalPath
      } catch (err) {
        if (err instanceof HttpsError) throw err
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${kind}: ${msg}`)
      }
    }

    if (errors.length > 0) {
      // Partial failure: some files moved, some didn't. Surface the
      // failed kinds to the client so it can decide whether to retry
      // (the function is idempotent — already-moved files won't
      // re-copy because they're gone from staging). We DON'T patch
      // the documents field on partial failure since the client
      // still has direct-upload fallback available for the missing
      // kinds.
      throw new HttpsError(
        'internal',
        `Finalize partially failed: ${errors.join('; ')}`,
        { finalized },
      )
    }

    // Patch the application doc's `documents` field so admin UIs
    // know where to find the files. Audio paths land under a nested
    // map keyed by field name (motivation, etc.); other kinds live
    // at the top level of the documents object.
    if (Object.keys(documentsPatch).length > 0 || Object.keys(audioPatch).length > 0) {
      const patch: Record<string, string> = {}
      for (const [k, v] of Object.entries(documentsPatch)) patch[`documents.${k}`] = v
      for (const [k, v] of Object.entries(audioPatch)) patch[`documents.audio.${k}`] = v
      try {
        await appRef.update(patch)
      } catch (err) {
        // Files are already in their final position — even if the
        // doc patch fails, the bytes are reviewable via Storage. Log
        // loudly and proceed so the client still sees `finalized`.
        console.warn(
          `[finalizeApplicationFiles] applications/${input.applicationId} update failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    return { finalized }
  },
)
