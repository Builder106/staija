/**
 * Reference letter flow.
 *
 * On application submit, each reference receives an email with a unique
 * tokenized link to a public `/refs/:token` upload page. The token is
 * HMAC-signed and contains `{applicationId, refIndex, exp}` — no DB
 * lookup is needed to validate it. The upload endpoint accepts a single
 * file via multipart, stores it under
 * `references/{applicationId}/{refIndex}-{filename}`, and updates the
 * application doc's reference status to `received`.
 *
 * Secrets:
 *   - REFERENCE_TOKEN_SECRET — HMAC signing key
 *   - MAILGUN_API_KEY        — shared with the application emails
 *   - MAILGUN_DOMAIN         — shared with the application emails
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { getAppCheck } from 'firebase-admin/app-check'
import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import Busboy from 'busboy'
import { APP_URL, sendMailgun, referenceInviteEmail, referenceLetterReceivedEmail } from './emailTemplates'
import { isAllowedOrigin } from './cors'

const REFERENCE_TOKEN_SECRET = defineSecret('REFERENCE_TOKEN_SECRET')
const MAILGUN_API_KEY = defineSecret('MAILGUN_API_KEY')
const MAILGUN_DOMAIN = defineSecret('MAILGUN_DOMAIN')

const TOKEN_TTL_DAYS = 90
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5MB — references letters often PDFs

// --- Token helpers ---------------------------------------------------

interface TokenPayload {
  applicationId: string
  refIndex: number
  // expiry epoch seconds
  exp: number
  // random nonce so identical inputs hash differently if regenerated
  nonce: string
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

export function mintToken(applicationId: string, refIndex: number, secret: string): string {
  const payload: TokenPayload = {
    applicationId,
    refIndex,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_DAYS * 24 * 60 * 60,
    nonce: randomBytes(8).toString('hex'),
  }
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = base64UrlEncode(createHmac('sha256', secret).update(body).digest())
  return `${body}.${sig}`
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = base64UrlEncode(createHmac('sha256', secret).update(body).digest())
  const a = Buffer.from(expected)
  const b = Buffer.from(sig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  let payload: TokenPayload
  try {
    payload = JSON.parse(base64UrlDecode(body).toString('utf8')) as TokenPayload
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
  if (typeof payload.applicationId !== 'string' || typeof payload.refIndex !== 'number') return null
  return payload
}


interface ApplicationRef {
  name?: string
  email?: string
  institution?: string
  relationship?: string
  status?: 'pending' | 'invited' | 'received'
}

interface ApplicationDoc {
  status?: string
  program?: 'stepup_scholars' | 'dynamerge'
  personalInfo?: { firstName?: string; lastName?: string; email?: string }
  references?: ApplicationRef[]
}

function programLabel(p?: ApplicationDoc['program']): string {
  if (p === 'stepup_scholars') return 'StepUp Scholars'
  if (p === 'dynamerge') return 'Dynamerge'
  return 'STAIJA'
}

// --- 1. Firestore trigger: send reference invites on submit ----------

export const inviteReferencesOnSubmit = onDocumentWritten(
  {
    document: 'applications/{applicationId}',
    secrets: [REFERENCE_TOKEN_SECRET, MAILGUN_API_KEY, MAILGUN_DOMAIN],
  },
  async (event) => {
    const before = event.data?.before.data() as ApplicationDoc | undefined
    const after = event.data?.after.data() as ApplicationDoc | undefined
    if (!after) return

    // Only fire when status transitions INTO submitted (not on every write).
    const wasSubmitted = before?.status === 'submitted'
    const isSubmitted = after.status === 'submitted'
    if (!isSubmitted || wasSubmitted) return

    const refs = after.references ?? []
    if (refs.length === 0) return

    const applicationId = event.params.applicationId
    const tokenSecret = REFERENCE_TOKEN_SECRET.value()
    const mailgunApiKey = MAILGUN_API_KEY.value()
    const mailgunDomain = MAILGUN_DOMAIN.value()

    const applicantName =
      [after.personalInfo?.firstName, after.personalInfo?.lastName].filter(Boolean).join(' ') ||
      'a STAIJA applicant'
    const program = programLabel(after.program)

    const updatedRefs: ApplicationRef[] = []
    for (let i = 0; i < refs.length; i++) {
      const r = refs[i]
      // Skip refs that already received a letter — idempotent.
      if (r.status === 'received') {
        updatedRefs.push(r)
        continue
      }
      if (!r.email) {
        updatedRefs.push({ ...r, status: r.status ?? 'pending' })
        continue
      }

      const token = mintToken(applicationId, i, tokenSecret)
      const url = `${APP_URL}/refs/${token}`

      const { html, text } = referenceInviteEmail({
        refName: r.name ?? 'there',
        applicantName,
        programLabel: program,
        relationship: r.relationship ?? '',
        institution: r.institution ?? '',
        uploadUrl: url,
      })
      const subject = `${applicantName} has listed you as a reference for ${program}`

      try {
        await sendMailgun({
          apiKey: mailgunApiKey,
          domain: mailgunDomain,
          to: r.email,
          subject,
          text,
          html,
        })
        updatedRefs.push({ ...r, status: 'invited' })
      } catch (err) {
        console.error('[references] Mailgun invite failed', err, { applicationId, refIndex: i })
        updatedRefs.push({ ...r, status: r.status ?? 'pending' })
      }
    }

    await getFirestore().collection('applications').doc(applicationId).update({
      references: updatedRefs,
      referencesInvitedAt: FieldValue.serverTimestamp(),
    })
  },
)

// --- 2. Validate token + fetch context for the upload page -----------

export const validateReferenceToken = onCall<{ token: string }>(
  {
    secrets: [REFERENCE_TOKEN_SECRET],
    cors: true,
    enforceAppCheck: true,
  },
  async (request) => {
    const token = request.data?.token
    if (!token) throw new HttpsError('invalid-argument', 'Missing token.')
    const payload = verifyToken(token, REFERENCE_TOKEN_SECRET.value())
    if (!payload) throw new HttpsError('permission-denied', 'This link is invalid or expired.')

    const snap = await getFirestore()
      .collection('applications')
      .doc(payload.applicationId)
      .get()
    if (!snap.exists) throw new HttpsError('not-found', 'Application not found.')
    const app = snap.data() as ApplicationDoc | undefined
    const r = app?.references?.[payload.refIndex]
    if (!r) throw new HttpsError('not-found', 'Reference slot not found on application.')

    const applicantName =
      [app?.personalInfo?.firstName, app?.personalInfo?.lastName].filter(Boolean).join(' ') ||
      'A STAIJA applicant'

    return {
      applicantName,
      program: programLabel(app?.program),
      referenceName: r.name ?? null,
      relationship: r.relationship ?? null,
      institution: r.institution ?? null,
      alreadyReceived: r.status === 'received',
    }
  },
)

// --- 3. Accept the file upload ---------------------------------------

export const submitReferenceLetter = onRequest(
  {
    secrets: [REFERENCE_TOKEN_SECRET, MAILGUN_API_KEY, MAILGUN_DOMAIN],
    memory: '512MiB',
    timeoutSeconds: 90,
    invoker: 'public',
    cors: false, // we set CORS manually so we can whitelist origins
  },
  async (req, res) => {
    const origin = req.header('origin') || ''
    if (isAllowedOrigin(origin)) {
      res.set('Access-Control-Allow-Origin', origin)
      res.set('Vary', 'Origin')
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.set('Access-Control-Allow-Headers', 'Content-Type, X-Reference-Token, X-Firebase-AppCheck')
    }
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed')
      return
    }

    // App Check: verify the browser-attached token before doing any work.
    // The Firebase SDK doesn't auto-attach to plain fetch (only to onCall),
    // so the client side has to fetch a token via getToken() and pass it.
    const appCheckToken = req.header('x-firebase-appcheck') as string | undefined
    if (!appCheckToken) {
      res.status(401).json({ error: 'Missing App Check token.' })
      return
    }
    try {
      await getAppCheck().verifyToken(appCheckToken)
    } catch {
      res.status(401).json({ error: 'Invalid App Check token.' })
      return
    }

    const token =
      (req.header('x-reference-token') as string | undefined) ??
      (req.query.token as string | undefined) ??
      ''
    const payload = verifyToken(token, REFERENCE_TOKEN_SECRET.value())
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token.' })
      return
    }

    const contentType = req.header('content-type') ?? ''
    if (!contentType.startsWith('multipart/form-data')) {
      res.status(400).json({ error: 'Expected multipart/form-data upload.' })
      return
    }

    // Collect the file via busboy.
    let fileName = 'letter'
    let fileMime = 'application/octet-stream'
    const chunks: Buffer[] = []
    let totalBytes = 0
    let tooLarge = false

    const parsed = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_UPLOAD_BYTES } })
      bb.on('file', (_field, file, info) => {
        fileName = info.filename || fileName
        fileMime = info.mimeType || fileMime
        file.on('data', (d: Buffer) => {
          totalBytes += d.length
          if (totalBytes > MAX_UPLOAD_BYTES) {
            tooLarge = true
            return
          }
          chunks.push(d)
        })
        file.on('limit', () => {
          tooLarge = true
        })
      })
      bb.on('finish', () => {
        if (tooLarge) resolve({ ok: false, error: `File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit.` })
        else resolve({ ok: true })
      })
      bb.on('error', (err) => resolve({ ok: false, error: (err as Error).message }))
      // Firebase Functions provide the raw body buffer.
      const raw = (req as unknown as { rawBody?: Buffer }).rawBody
      if (raw) {
        bb.end(raw)
      } else {
        req.pipe(bb)
      }
    })

    if (!parsed.ok || chunks.length === 0) {
      res.status(400).json({ error: parsed.error ?? 'No file received.' })
      return
    }

    const fileBuffer = Buffer.concat(chunks)
    const safeName = fileName.replace(/[^A-Za-z0-9_.-]/g, '_')
    const storagePath = `references/${payload.applicationId}/${payload.refIndex}-${safeName}`

    try {
      const bucket = getStorage().bucket()
      const fileObj = bucket.file(storagePath)
      await fileObj.save(fileBuffer, {
        contentType: fileMime,
        resumable: false,
        metadata: {
          metadata: {
            applicationId: payload.applicationId,
            refIndex: String(payload.refIndex),
            uploadedVia: 'submitReferenceLetter',
          },
        },
      })

      // Mark the reference as received on the application doc.
      const docRef = getFirestore()
        .collection('applications')
        .doc(payload.applicationId)

      let applicantEmail: string | undefined
      let applicantFirstName: string | undefined
      let referenceName: string | undefined
      let programLabelForEmail: string | undefined

      await getFirestore().runTransaction(async (tx) => {
        const snap = await tx.get(docRef)
        const app = snap.data() as ApplicationDoc | undefined
        if (!app?.references) return
        const refs = [...app.references]
        if (!refs[payload.refIndex]) return
        applicantEmail = app.personalInfo?.email
        applicantFirstName = app.personalInfo?.firstName
        referenceName = refs[payload.refIndex].name
        programLabelForEmail = programLabel(app.program)
        refs[payload.refIndex] = {
          ...refs[payload.refIndex],
          status: 'received',
        }
        tx.update(docRef, {
          references: refs,
          [`referencesReceivedAt.${payload.refIndex}`]: FieldValue.serverTimestamp(),
        })
      })

      // Notify the applicant — fire-and-forget, don't fail the upload if email fails.
      if (applicantEmail) {
        try {
          const { html, text } = referenceLetterReceivedEmail({
            firstName: applicantFirstName ?? 'there',
            refName: referenceName ?? 'A reference',
            programLabel: programLabelForEmail ?? 'STAIJA',
            applicationId: payload.applicationId,
          })
          await sendMailgun({
            apiKey: MAILGUN_API_KEY.value(),
            domain: MAILGUN_DOMAIN.value(),
            to: applicantEmail,
            subject: `${referenceName ?? 'Your reference'} sent in their letter`,
            text,
            html,
          })
        } catch (err) {
          console.error('[references] letter-received notification failed', err, payload)
        }
      }

      res.status(200).json({ ok: true, storagePath })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[references] Storage upload failed', message, payload)
      res.status(500).json({ error: 'Upload failed. Try again in a minute.' })
    }
  },
)
