/**
 * lmsAssetUpload — Server-side bridge that turns a Firebase Storage
 * upload into a Contentful Asset. The client stages the file in
 * Storage (where Firebase rules already authenticate the writer), then
 * calls this function, which downloads the bytes, creates + publishes
 * the asset in Contentful, and deletes the staging file.
 *
 * Why not let the client upload to Contentful directly?
 *   - The Management API token is server-only (the whole reason
 *     lmsContentAdmin exists). Asset upload needs the same token.
 *   - Going through Storage means the client uses a small, well-tested
 *     Firebase SDK call instead of stitching together a Contentful
 *     multipart upload from the browser.
 *
 * Auth: staff or admin, same gate as lmsContentAdmin.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import * as contentful from 'contentful-management'

const CONTENTFUL_MANAGEMENT_TOKEN = defineSecret('CONTENTFUL_MANAGEMENT_TOKEN')
const CONTENTFUL_SPACE_ID = defineSecret('CONTENTFUL_SPACE_ID')

const LOCALE = 'en-US'

interface AssetUploadInput {
  /** Path inside the default Firebase Storage bucket, e.g.
   *  `cms/<uid>/<timestamp>-<filename>`. The client uploads here first. */
  storagePath: string
  fileName: string
  contentType: string
  /** Optional human-readable title; defaults to the file name. */
  title?: string
  /** Contentful environment id; defaults to 'master'. */
  env?: string
}

interface AssetUploadResult {
  id: string
  url: string
  fileName: string
  contentType: string
}

async function callerRole(uid: string): Promise<string | null> {
  const snap = await getFirestore().collection('users').doc(uid).get()
  return (snap.data()?.role as string | undefined) ?? null
}

function L<T>(value: T): { [LOCALE]: T } {
  return { [LOCALE]: value }
}

export const lmsAssetUpload = onCall<AssetUploadInput>(
  {
    secrets: [CONTENTFUL_MANAGEMENT_TOKEN, CONTENTFUL_SPACE_ID],
    memory: '512MiB',
    timeoutSeconds: 120,
    enforceAppCheck: true,
  },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'You must be signed in.')
    const role = await callerRole(req.auth.uid)
    if (role !== 'staff' && role !== 'admin') {
      throw new HttpsError('permission-denied', 'Staff or admin role required.')
    }

    const input = req.data ?? ({} as AssetUploadInput)
    if (!input.storagePath || typeof input.storagePath !== 'string') {
      throw new HttpsError('invalid-argument', 'storagePath required.')
    }
    if (!input.fileName || typeof input.fileName !== 'string') {
      throw new HttpsError('invalid-argument', 'fileName required.')
    }
    if (!input.contentType || typeof input.contentType !== 'string') {
      throw new HttpsError('invalid-argument', 'contentType required.')
    }
    // Lock the path to the caller's own folder so a compromised client
    // can't stage a file under someone else's uid and ask us to publish
    // it. The storage rule below already enforces this on write — this
    // is the read-side mirror.
    const expectedPrefix = `cms/${req.auth.uid}/`
    if (!input.storagePath.startsWith(expectedPrefix)) {
      throw new HttpsError(
        'permission-denied',
        `storagePath must live under ${expectedPrefix}`,
      )
    }

    const bucket = getStorage().bucket()
    const stagingFile = bucket.file(input.storagePath)
    const [exists] = await stagingFile.exists()
    if (!exists) {
      throw new HttpsError('not-found', `Staging file ${input.storagePath} not found.`)
    }
    const [buffer] = await stagingFile.download()

    const client = contentful.createClient(
      { accessToken: CONTENTFUL_MANAGEMENT_TOKEN.value() },
      {
        defaults: {
          spaceId: CONTENTFUL_SPACE_ID.value(),
          environmentId: input.env || 'master',
        },
      },
    )

    // createFromFiles wraps the upload + asset-creation steps: it POSTs
    // the buffer to Contentful's uploads endpoint and returns an
    // unprocessed asset linked to that upload.
    const draft = await client.asset.createFromFiles(
      {},
      {
        fields: {
          title: L(input.title?.trim() || input.fileName),
          // The SDK types mark description as required; we don't surface
          // a separate description field in the LMS UI, so mirror the
          // title here and let editors refine in Contentful's web app if
          // they want a richer alt-text caption.
          description: L(input.title?.trim() || ''),
          file: L({
            contentType: input.contentType,
            fileName: input.fileName,
            // Node's Buffer works fine here at runtime — the SDK's HTTP
            // layer accepts it like any Uint8Array-backed payload — but
            // it doesn't structurally match the stricter ArrayBuffer type.
            file: buffer.buffer.slice(
              buffer.byteOffset,
              buffer.byteOffset + buffer.byteLength,
            ) as ArrayBuffer,
          }),
        },
      },
    )
    const processed = await client.asset.processForLocale({}, draft, LOCALE, {
      processingCheckWait: 2000,
    })
    const published = await client.asset.publish({ assetId: processed.sys.id }, processed)

    // Best-effort cleanup. If this throws (e.g. permissions race) we
    // still want the function to succeed — the asset is already live.
    try {
      await stagingFile.delete()
    } catch (err) {
      console.warn('[lmsAssetUpload] staging cleanup failed:', err)
    }

    const fileField = (published.fields.file as Record<string, { url: string; fileName: string; contentType: string }>)[
      LOCALE
    ]
    const result: AssetUploadResult = {
      id: published.sys.id,
      // Contentful returns //images.ctfassets.net/... — normalize to https:
      url: fileField.url.startsWith('//') ? `https:${fileField.url}` : fileField.url,
      fileName: fileField.fileName,
      contentType: fileField.contentType,
    }
    return result
  },
)
