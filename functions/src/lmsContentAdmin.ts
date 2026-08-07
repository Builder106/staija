/**
 * lmsContentAdmin — Single dispatch callable that proxies all
 * Contentful Management API operations for the admin LMS surface.
 *
 * Replaces the previous client-side path (which read
 * VITE_CONTENTFUL_MANAGEMENT_TOKEN from the bundle, exposing it to
 * every visitor) with a server-side caller. The token lives in Secret
 * Manager as CONTENTFUL_MANAGEMENT_TOKEN — no VITE_ prefix means Vite
 * never inlines it into the client.
 *
 * Auth: staff/admin only, same gate as outlineCourse and
 * lessonMediaAssist.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore } from 'firebase-admin/firestore'
import * as contentful from 'contentful-management'
import type { PlainClientAPI, EntryProps } from 'contentful-management'

const CONTENTFUL_MANAGEMENT_TOKEN = defineSecret('CONTENTFUL_MANAGEMENT_TOKEN')
const CONTENTFUL_SPACE_ID = defineSecret('CONTENTFUL_SPACE_ID')

const LOCALE = 'en-US'

// ---------- Types (mirror the client-facing shapes) ----------

type LmsContentType = 'course' | 'module' | 'lesson' | 'assignmentSpec' | 'quiz'

interface EntrySummary {
  id: string
  contentType: LmsContentType
  fields: Record<string, unknown>
  publishedAt: string | null
  updatedAt: string
  isPublished: boolean
  isDraft: boolean
}

// The client sends fields un-localized; the function wraps them as
// { en-US: value } before handing to Contentful. We use `unknown` on
// the wire and only validate at the dispatch boundary.
interface LmsCreateOrUpdatePayload {
  type: LmsContentType
  fields: Record<string, unknown>
}

type AdminRequest =
  | {
      action: 'list'
      type: LmsContentType
      limit?: number
      skip?: number
      query?: string
      ids?: string[]
      fieldEquals?: { name: string; value: string }
    }
  | { action: 'get'; id: string }
  | { action: 'create'; payload: LmsCreateOrUpdatePayload }
  | { action: 'update'; id: string; payload: LmsCreateOrUpdatePayload }
  | { action: 'publish'; id: string }
  | { action: 'unpublish'; id: string }
  | { action: 'delete'; id: string }

interface AdminInput {
  env?: string // Contentful environment id; defaults to 'master'.
  request: AdminRequest
}

// ---------- Helpers ----------

async function callerRole(uid: string): Promise<string | null> {
  const snap = await getFirestore().collection('users').doc(uid).get()
  return (snap.data()?.role as string | undefined) ?? null
}

function L<T>(value: T | undefined): { [LOCALE]: T } | undefined {
  if (value === undefined || value === null) return undefined
  return { [LOCALE]: value }
}

function refsArray(ids: unknown, linkType: 'Entry' | 'Asset') {
  if (!Array.isArray(ids) || ids.length === 0) return undefined
  return ids
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .map((id) => ({ sys: { type: 'Link' as const, linkType, id } }))
}

function singleRef(id: unknown, linkType: 'Entry' | 'Asset') {
  if (typeof id !== 'string' || !id) return undefined
  return { sys: { type: 'Link' as const, linkType, id } }
}

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeSlug(input: unknown): string {
  return slugify(typeof input === 'string' ? input : '')
}

function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out as Partial<T>
}

/**
 * Coerce a value to a non-negative integer or `undefined`. The
 * Contentful content model declares estimatedHours / estimatedMinutes /
 * maxFileSizeMb / dueOffsetDays as Integer fields — sending a decimal
 * (e.g. 3.2 from `Math.round(minutes/60 * 10) / 10`) fails validation
 * with a 422. Rounding at the server boundary means callers can compute
 * with floats and persist with confidence the contract holds.
 */
function int(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  return Math.round(v)
}

/**
 * Shape the client-provided fields into Contentful's locale-wrapped,
 * Link-referenced format. Mirrors the prior shapeFields() that ran in
 * the browser. Unknown fields are dropped (defense against future
 * client/server skew).
 */
function shapeFields(payload: LmsCreateOrUpdatePayload): Record<string, unknown> {
  const f = payload.fields as Record<string, unknown>
  switch (payload.type) {
    case 'course':
      return clean({
        slug: L(normalizeSlug(f.slug)),
        title: L(f.title),
        program: L(f.program),
        summary: L(f.summary),
        modules: L(refsArray(f.modules, 'Entry')),
        estimatedHours: L(int(f.estimatedHours)),
        track: L(f.track),
        published: L(f.published),
        version: L(f.version),
        coverImage: L(singleRef(f.coverImage, 'Asset')),
      })
    case 'module':
      return clean({
        slug: L(normalizeSlug(f.slug)),
        title: L(f.title),
        summary: L(f.summary),
        lessons: L(refsArray(f.lessons, 'Entry')),
        assignments: L(refsArray(f.assignments, 'Entry')),
        unlockRule: L(f.unlockRule),
      })
    case 'lesson':
      return clean({
        slug: L(normalizeSlug(f.slug)),
        title: L(f.title),
        body: L(f.body),
        videoUrl: L(f.videoUrl),
        attachments: L(refsArray(f.attachments, 'Asset')),
        estimatedMinutes: L(int(f.estimatedMinutes)),
        completionCriteria: L(f.completionCriteria),
        quiz: L(singleRef(f.quiz, 'Entry')),
      })
    case 'assignmentSpec':
      return clean({
        slug: L(normalizeSlug(f.slug)),
        title: L(f.title),
        instructions: L(f.instructions),
        submissionType: L(f.submissionType),
        maxFileSizeMb: L(int(f.maxFileSizeMb)),
        acceptedFileTypes: L(f.acceptedFileTypes),
        dueOffsetDays: L(int(f.dueOffsetDays)),
      })
    case 'quiz':
      return clean({
        slug: L(normalizeSlug(f.slug)),
        title: L(f.title),
        summary: L(f.summary),
        passThresholdPercent: L(int(f.passThresholdPercent)),
        questions: L(f.questions),
      })
  }
}

function summarize(entry: EntryProps): EntrySummary {
  const fields: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(entry.fields ?? {})) {
    fields[k] = (v as Record<string, unknown>)?.[LOCALE]
  }
  const isPublished =
    !!entry.sys.publishedVersion && entry.sys.version === entry.sys.publishedVersion + 1
  const isDraft = !entry.sys.publishedVersion
  return {
    id: entry.sys.id,
    contentType: entry.sys.contentType.sys.id as LmsContentType,
    fields,
    publishedAt: entry.sys.publishedAt ?? null,
    updatedAt: entry.sys.updatedAt,
    isPublished,
    isDraft,
  }
}

// ---------- Dispatch ----------

async function dispatch(client: PlainClientAPI, request: AdminRequest): Promise<unknown> {
  switch (request.action) {
    case 'list': {
      const query: Record<string, string | number> = {
        content_type: request.type,
        limit: Math.min(request.limit ?? 100, 1000),
        skip: request.skip ?? 0,
        order: '-sys.updatedAt',
      }
      if (request.query) query.query = request.query
      if (request.ids && request.ids.length > 0) {
        query['sys.id[in]'] = request.ids.join(',')
      }
      if (request.fieldEquals) {
        query[`fields.${request.fieldEquals.name}`] = request.fieldEquals.value
      }
      const result = await client.entry.getMany({ query })
      return result.items.map(summarize)
    }
    case 'get': {
      const entry = await client.entry.get({ entryId: request.id })
      return summarize(entry)
    }
    case 'create': {
      const entry = await client.entry.create(
        { contentTypeId: request.payload.type },
        { fields: shapeFields(request.payload) },
      )
      return summarize(entry)
    }
    case 'update': {
      const entry = await client.entry.get({ entryId: request.id })
      const incoming = shapeFields(request.payload)
      for (const [k, v] of Object.entries(incoming)) {
        if (v === undefined) continue
        ;(entry.fields as Record<string, unknown>)[k] = v
      }
      const updated = await client.entry.update({ entryId: request.id }, entry)
      return summarize(updated)
    }
    case 'publish': {
      const entry = await client.entry.get({ entryId: request.id })
      const published = await client.entry.publish({ entryId: request.id }, entry)
      return summarize(published)
    }
    case 'unpublish': {
      const entry = await client.entry.get({ entryId: request.id })
      const unpublished = await client.entry.unpublish({ entryId: request.id }, entry)
      return summarize(unpublished)
    }
    case 'delete': {
      const entry = await client.entry.get({ entryId: request.id })
      if (entry.sys.publishedVersion) {
        await client.entry.unpublish({ entryId: request.id }, entry)
      }
      await client.entry.delete({ entryId: request.id })
      return { ok: true }
    }
  }
}

function validate(req: unknown): AdminRequest {
  if (!req || typeof req !== 'object') throw new HttpsError('invalid-argument', 'request missing.')
  const r = req as Record<string, unknown>
  const action = r.action
  const VALID_TYPES: LmsContentType[] = ['course', 'module', 'lesson', 'assignmentSpec', 'quiz']
  switch (action) {
    case 'list':
      if (!VALID_TYPES.includes(r.type as LmsContentType)) {
        throw new HttpsError('invalid-argument', 'list.type invalid.')
      }
      return r as AdminRequest
    case 'get':
    case 'publish':
    case 'unpublish':
    case 'delete':
      if (typeof r.id !== 'string' || !r.id) {
        throw new HttpsError('invalid-argument', `${action}.id required.`)
      }
      return r as AdminRequest
    case 'create':
    case 'update': {
      const payload = r.payload as { type?: unknown; fields?: unknown } | undefined
      if (!payload || !VALID_TYPES.includes(payload.type as LmsContentType)) {
        throw new HttpsError('invalid-argument', `${action}.payload.type invalid.`)
      }
      if (!payload.fields || typeof payload.fields !== 'object') {
        throw new HttpsError('invalid-argument', `${action}.payload.fields required.`)
      }
      if (action === 'update' && (typeof r.id !== 'string' || !r.id)) {
        throw new HttpsError('invalid-argument', 'update.id required.')
      }
      return r as AdminRequest
    }
    default:
      throw new HttpsError('invalid-argument', `unknown action: ${String(action)}`)
  }
}

export const lmsContentAdmin = onCall<AdminInput>(
  {
    secrets: [CONTENTFUL_MANAGEMENT_TOKEN, CONTENTFUL_SPACE_ID],
    memory: '256MiB',
    timeoutSeconds: 60,
    enforceAppCheck: true,
  },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'You must be signed in.')
    const role = await callerRole(req.auth.uid)
    if (role !== 'staff' && role !== 'admin') {
      throw new HttpsError('permission-denied', 'Staff or admin role required.')
    }
    const data = req.data ?? ({} as AdminInput)
    const request = validate(data.request)
    const envId = data.env || 'master'

    const client = contentful.createClient(
      { accessToken: CONTENTFUL_MANAGEMENT_TOKEN.value() },
      {
        defaults: {
          spaceId: CONTENTFUL_SPACE_ID.value(),
          environmentId: envId,
        },
      },
    )

    try {
      return await dispatch(client, request)
    } catch (err) {
      // Contentful management errors usually carry a useful name +
      // message; surface those instead of leaking the SDK's raw error.
      const msg = (err as { message?: string }).message ?? 'Contentful operation failed.'
      const status = (err as { status?: number }).status
      if (status === 404) throw new HttpsError('not-found', msg)
      if (status === 422) throw new HttpsError('invalid-argument', msg)
      if (status === 401 || status === 403) throw new HttpsError('permission-denied', msg)
      console.error('[lmsContentAdmin] dispatch error:', err)
      throw new HttpsError('internal', msg)
    }
  },
)
