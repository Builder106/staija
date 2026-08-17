/**
 * Paystack webhook → Firestore donation recorder.
 *
 * Source of truth for "succeeded" donations. The frontend popup callback
 * (services/donations.ts) only fires analytics; this handler does the
 * actual write.
 *
 * Idempotent: keyed by Paystack `reference`. Replaying any event is safe.
 *
 * Secret: PAYSTACK_SECRET_KEY (set via firebase functions:secrets:set).
 * The secret key is also used to verify the HMAC-SHA512 signature
 * Paystack sends in the X-Paystack-Signature header.
 */

import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { createHmac, timingSafeEqual } from 'crypto'

const PAYSTACK_SECRET_KEY = defineSecret('PAYSTACK_SECRET_KEY')

interface PaystackChargePayload {
  event: string
  data: {
    id: number
    reference: string
    status: 'success' | 'failed' | string
    amount: number
    currency: string
    paid_at?: string
    created_at?: string
    customer?: {
      id?: number
      email?: string
      customer_code?: string
      first_name?: string | null
      last_name?: string | null
    }
    plan?: { plan_code?: string; name?: string } | null
    subscription?: { subscription_code?: string }
    metadata?: Record<string, unknown> | string
  }
}

interface ParsedMetadata {
  frequency?: 'one-time' | 'monthly'
  donor_uid?: string | null
  full_name?: string | null
  source?: string
}

function parseMetadata(meta: PaystackChargePayload['data']['metadata']): ParsedMetadata {
  if (!meta) return {}
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta) as ParsedMetadata
    } catch {
      return {}
    }
  }
  return meta as ParsedMetadata
}

function verifyPaystackSignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const paystackWebhook = onRequest(
  {
    cors: false,
    secrets: [PAYSTACK_SECRET_KEY],
    memory: '256MiB',
    timeoutSeconds: 60,
    // Need raw body for HMAC verification.
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed')
      return
    }

    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ?? JSON.stringify(req.body)
    const signature = req.header('x-paystack-signature')

    if (!verifyPaystackSignature(rawBody, signature, PAYSTACK_SECRET_KEY.value())) {
      res.status(401).send('Invalid signature')
      return
    }

    const payload = req.body as PaystackChargePayload
    const event = payload.event
    const data = payload.data

    if (!data?.reference) {
      res.status(400).send('Missing reference')
      return
    }

    const db = getFirestore()
    const donationRef = db.collection('donations').doc(data.reference)

    try {
      switch (event) {
        case 'charge.success': {
          const metadata = parseMetadata(data.metadata)
          await donationRef.set(
            {
              ref: data.reference,
              donorEmail: data.customer?.email ?? '',
              donorUid: metadata.donor_uid ?? null,
              donorName:
                metadata.full_name ??
                [data.customer?.first_name, data.customer?.last_name].filter(Boolean).join(' ') ??
                null,
              amountKobo: data.amount,
              currency: data.currency || 'NGN',
              frequency: metadata.frequency ?? (data.plan?.plan_code ? 'monthly' : 'one-time'),
              status: 'success',
              paystackId: data.id,
              paystackCustomerCode: data.customer?.customer_code ?? null,
              paystackSubscriptionCode: data.subscription?.subscription_code ?? null,
              paystackPlanCode: data.plan?.plan_code ?? null,
              paidAt: data.paid_at ? new Date(data.paid_at) : FieldValue.serverTimestamp(),
              createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          )
          res.status(200).send(`Recorded donation ${data.reference}`)
          return
        }

        case 'charge.failed': {
          await donationRef.set(
            {
              ref: data.reference,
              status: 'failed',
              amountKobo: data.amount,
              currency: data.currency || 'NGN',
              donorEmail: data.customer?.email ?? '',
              failedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          )
          res.status(200).send(`Recorded failed charge ${data.reference}`)
          return
        }

        case 'subscription.create':
        case 'subscription.disable': {
          // Update any donation rows tied to this subscription.
          const subCode = data.subscription?.subscription_code
          if (!subCode) {
            res.status(200).send('No subscription_code on payload')
            return
          }
          const matches = await db
            .collection('donations')
            .where('paystackSubscriptionCode', '==', subCode)
            .get()
          const batch = db.batch()
          matches.forEach((doc) => {
            batch.update(doc.ref, {
              subscriptionStatus: event === 'subscription.create' ? 'active' : 'cancelled',
              subscriptionUpdatedAt: FieldValue.serverTimestamp(),
            })
          })
          await batch.commit()
          res.status(200).send(`Updated ${matches.size} subscription rows`)
          return
        }

        default:
          res.status(200).send(`Ignored event: ${event}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[paystackWebhook] Failed:', message, { event, ref: data.reference })
      res.status(500).send(`Webhook failed: ${message}`)
    }
  },
)

/**
 * Cancel a Paystack subscription on behalf of the authenticated donor.
 *
 * Two-step flow that Paystack requires:
 *   1. Look up subscription details to get the email_token
 *   2. POST /subscription/disable with subscription_code + email_token
 *
 * Authorization: the authenticated user must own the donation row that
 * carries this subscription_code. Admins are allowed to cancel any.
 */
export const cancelSubscription = onCall<{ subscriptionCode: string }>(
  {
    secrets: [PAYSTACK_SECRET_KEY],
    memory: '256MiB',
    timeoutSeconds: 30,
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in to cancel a donation.')
    }
    const subCode = request.data?.subscriptionCode
    if (!subCode) {
      throw new HttpsError('invalid-argument', 'subscriptionCode is required.')
    }

    const db = getFirestore()
    const matches = await db
      .collection('donations')
      .where('paystackSubscriptionCode', '==', subCode)
      .limit(1)
      .get()

    if (matches.empty) {
      throw new HttpsError('not-found', 'Subscription not found in our records.')
    }
    const donation = matches.docs[0].data()

    // Allow if the caller owns the donation OR is an admin.
    const isOwner = donation.donorUid && donation.donorUid === request.auth.uid
    let isAdmin = false
    if (!isOwner) {
      const userProfile = await db.collection('users').doc(request.auth.uid).get()
      isAdmin = userProfile.data()?.role === 'admin'
    }
    if (!isOwner && !isAdmin) {
      throw new HttpsError('permission-denied', "You can't cancel this subscription.")
    }

    const secret = PAYSTACK_SECRET_KEY.value()

    const fetchRes = await fetch(`https://api.paystack.co/subscription/${subCode}`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    if (!fetchRes.ok) {
      const text = await fetchRes.text()
      throw new HttpsError('internal', `Paystack lookup failed (${fetchRes.status}): ${text}`)
    }
    const fetchJson = (await fetchRes.json()) as { data?: { email_token?: string } }
    const emailToken = fetchJson.data?.email_token
    if (!emailToken) {
      throw new HttpsError('internal', 'Paystack did not return email_token; cannot cancel.')
    }

    const disableRes = await fetch('https://api.paystack.co/subscription/disable', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: subCode, token: emailToken }),
    })
    if (!disableRes.ok) {
      const text = await disableRes.text()
      throw new HttpsError('internal', `Paystack disable failed (${disableRes.status}): ${text}`)
    }

    // Mirror the cancellation locally — the webhook will also fire eventually.
    await matches.docs[0].ref.update({
      subscriptionStatus: 'cancelled',
      subscriptionUpdatedAt: FieldValue.serverTimestamp(),
    })

    return { ok: true }
  },
)
