/**
 * Contentful → Firestore mirror.
 *
 * Receives publish/unpublish/delete events from Contentful and mirrors
 * blogPost + event entries into Firestore so the public site can read
 * content without a round-trip to Contentful.
 *
 * Secret: CONTENTFUL_WEBHOOK_SECRET (set via firebase functions:secrets:set).
 */

import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const CONTENTFUL_WEBHOOK_SECRET = defineSecret('CONTENTFUL_WEBHOOK_SECRET')

type ContentfulTopic =
  | 'ContentManagement.Entry.publish'
  | 'ContentManagement.Entry.unpublish'
  | 'ContentManagement.Entry.delete'
  | 'ContentManagement.Entry.archive'
  | 'ContentManagement.Entry.unarchive'
  | string

export type ContentfulWebhookFieldValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | { [key: string]: ContentfulWebhookFieldValue }
  | ContentfulWebhookFieldValue[]

interface ContentfulEntryPayload {
  sys: {
    id: string
    type: string
    contentType?: { sys: { id: string } }
    createdAt?: string
    updatedAt?: string
  }
  fields?: Record<string, Record<string, ContentfulWebhookFieldValue>>
}

const COLLECTION_MAP: Record<string, string> = {
  blogPost: 'cms_blogPosts',
  event: 'cms_events',
  // LMS content types — see /Users/.../misty-nibbling-steele.md plan for
  // shape. Same flatten + soft-delete behavior; no special handling.
  course: 'cms_courses',
  module: 'cms_modules',
  lesson: 'cms_lessons',
  assignmentSpec: 'cms_assignmentSpecs',
}

export const contentfulWebhook = onRequest(
  {
    cors: false,
    secrets: [CONTENTFUL_WEBHOOK_SECRET],
    memory: '256MiB',
    timeoutSeconds: 60,
    // Webhook callers (Contentful) can't sign GCP IAM tokens, so the
    // Cloud Run service must accept unauthenticated invocations.
    // Auth is enforced inside the handler via the x-staija-token check.
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed')
      return
    }

    // Header name is intentionally generic — Contentful's webhook UI
    // shows headers in plain text, so calling it `x-webhook-secret`
    // would advertise that the value is sensitive. The Firebase secret
    // it compares against keeps its descriptive name.
    const provided = req.header('x-staija-token')
    if (!provided || provided !== CONTENTFUL_WEBHOOK_SECRET.value()) {
      res.status(401).send('Unauthorized')
      return
    }

    const topic = (req.header('x-contentful-topic') || '') as ContentfulTopic

    // Contentful sends `Content-Type: application/vnd.contentful.management.v1+json`,
    // which Cloud Functions' default body-parser doesn't recognize, leaving
    // req.body either an empty object or a Buffer. Fall back to parsing
    // req.rawBody ourselves whenever the structured body is missing.
    let payload = req.body as ContentfulEntryPayload | undefined
    if (!payload?.sys?.id) {
      try {
        const raw = req.rawBody
        const text = raw ? raw.toString('utf-8') : typeof req.body === 'string' ? req.body : ''
        if (text) payload = JSON.parse(text) as ContentfulEntryPayload
      } catch (e) {
        console.error('[contentfulWebhook] rawBody parse failed:', e)
      }
    }

    if (!payload?.sys?.id || !payload.sys.contentType?.sys.id) {
      console.warn('[contentfulWebhook] Malformed payload', {
        topic,
        contentType: req.header('content-type'),
        bodyType: typeof req.body,
      })
      res.status(400).send('Malformed Contentful payload')
      return
    }

    const contentTypeId = payload.sys.contentType.sys.id
    const collection = COLLECTION_MAP[contentTypeId]
    if (!collection) {
      res.status(200).send(`Ignored content type: ${contentTypeId}`)
      return
    }

    const db = getFirestore()
    const entryId = payload.sys.id
    const docRef = db.collection(collection).doc(entryId)

    try {
      if (
        topic === 'ContentManagement.Entry.unpublish' ||
        topic === 'ContentManagement.Entry.delete' ||
        topic === 'ContentManagement.Entry.archive'
      ) {
        await docRef.delete()
        console.log('[contentfulWebhook] processed', { topic, entryId, contentTypeId, action: 'removed' })
        res.status(200).send(`Removed ${collection}/${entryId}`)
        return
      }

      if (topic === 'ContentManagement.Entry.publish' || topic === 'ContentManagement.Entry.unarchive') {
        const locale = 'en-US'
        const fields = payload.fields ?? {}
        const flattened: Record<string, ContentfulWebhookFieldValue> = {}
        for (const [key, value] of Object.entries(fields)) {
          flattened[key] = value?.[locale] ?? null
        }
        await docRef.set(
          {
            ...flattened,
            _sys: {
              id: entryId,
              contentType: contentTypeId,
              createdAt: payload.sys.createdAt ?? null,
              updatedAt: payload.sys.updatedAt ?? null,
              mirroredAt: FieldValue.serverTimestamp(),
            },
          },
          { merge: true },
        )
        console.log('[contentfulWebhook] processed', { topic, entryId, contentTypeId, action: 'mirrored' })
        res.status(200).send(`Mirrored ${collection}/${entryId}`)
        return
      }

      res.status(200).send(`Ignored topic: ${topic}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[contentfulWebhook] Failed:', message, { topic, entryId, contentTypeId })
      res.status(500).send(`Mirror failed: ${message}`)
    }
  },
)
