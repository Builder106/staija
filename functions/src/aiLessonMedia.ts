/**
 * lessonMediaAssist — Given a lesson title + body, returns structured
 * suggestions a staff/mentor editor can act on:
 *   - 3 YouTube search queries (with rationale) for finding a hero video
 *   - 3 image search queries (Unsplash/Pexels-style) for body imagery
 *   - 80–120 word narration script the editor can read aloud and record
 *   - 3–5 key concept bullets the editor can paste into the body as a callout
 *
 * The AI does *not* generate or upload media. It surfaces ideas and
 * search prompts so editors curate themselves — sidesteps cost,
 * licensing, and cultural-appropriateness pitfalls of auto-generated
 * imagery for an African STEM education context.
 *
 * Mirrors outlineCourse for auth + Groq + JSON output.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore } from 'firebase-admin/firestore'
import Groq from 'groq-sdk'
import { z } from 'zod'

const GROQ_API_KEY = defineSecret('GROQ_API_KEY')

interface LessonMediaInput {
  title: string
  /** Plain-text version of the lesson body. Caller flattens rich text. */
  bodyPlain: string
}

const LessonMediaSchema = z.object({
  videoQueries: z
    .array(
      z.object({
        query: z.string().min(3).max(120),
        rationale: z.string().min(5).max(200),
      }),
    )
    .min(2)
    .max(4),
  imageQueries: z
    .array(
      z.object({
        query: z.string().min(3).max(80),
        rationale: z.string().min(5).max(200),
      }),
    )
    .min(2)
    .max(4),
  narrationScript: z.string().min(60).max(800),
  keyConcepts: z.array(z.string().min(3).max(140)).min(3).max(6),
})

type LessonMedia = z.infer<typeof LessonMediaSchema>

async function callerRole(uid: string): Promise<string | null> {
  const snap = await getFirestore().collection('users').doc(uid).get()
  return (snap.data()?.role as string | undefined) ?? null
}

const SYSTEM_PROMPT = `You help instructional designers at STAIJA — a research and STEM education program for African high-school and gap-year students — enrich draft lessons with media.

You produce search prompts and a short narration script. You do NOT invent URLs, do NOT cite specific videos by name, and do NOT generate images.

Tone: direct, practical, no marketing language ("powerful", "transformative", "cutting-edge"). Audience is teenagers in Africa; default to inclusive, locally-grounded examples (Lagos, Nairobi, Accra, Kigali) when an example is appropriate but never invent specific people or organizations.

Output ONLY valid JSON matching the schema. No prose, no markdown fences.`

async function callGroq(client: Groq, input: LessonMediaInput): Promise<LessonMedia> {
  const userPrompt = `LESSON TITLE: ${input.title}

LESSON BODY (plain text):
${input.bodyPlain.slice(0, 4000)}

Produce media-enrichment suggestions matching this JSON shape:
{
  "videoQueries": [
    { "query": "YouTube search string a teacher could paste into youtube.com", "rationale": "why this video would help" }
  ],
  "imageQueries": [
    { "query": "Unsplash/Pexels search string", "rationale": "what role the image plays in the lesson" }
  ],
  "narrationScript": "80-120 words of first-person narration the lesson author can read aloud and record. Conversational, contractions OK. No 'Welcome to' openings.",
  "keyConcepts": ["3-5 short bullets — each 1 sentence — distilling what a student should walk away knowing"]
}

Constraints:
- 3 entries each in videoQueries and imageQueries.
- narrationScript: 80-120 words, no stage directions, no headers.
- keyConcepts: 3-5 items, each under 140 chars.
- All copy must be safe for ages 15-19, factual, and grounded in the lesson body provided.`

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.4,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })

  const raw = response.choices[0]?.message?.content
  if (!raw) {
    throw new HttpsError('internal', 'Groq returned an empty response.')
  }

  type JsonParsed =
    | string
    | number
    | boolean
    | null
    | undefined
    | JsonParsed[]
    | { [key: string]: JsonParsed }
  let parsed: JsonParsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.error('[lessonMediaAssist] Groq returned non-JSON:', raw.slice(0, 200))
    throw new HttpsError('internal', 'Groq returned malformed JSON.')
  }

  const result = LessonMediaSchema.safeParse(parsed)
  if (!result.success) {
    console.error('[lessonMediaAssist] Schema validation failed:', result.error.issues)
    throw new HttpsError('internal', 'Groq output did not match the expected media-assist shape.')
  }
  return result.data
}

export const lessonMediaAssist = onCall<LessonMediaInput>(
  {
    secrets: [GROQ_API_KEY],
    memory: '256MiB',
    timeoutSeconds: 60,
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.')
    }
    const role = await callerRole(request.auth.uid)
    if (role !== 'staff' && role !== 'admin') {
      throw new HttpsError('permission-denied', 'Staff or admin role required.')
    }

    const input = request.data ?? ({} as LessonMediaInput)
    if (!input.title || typeof input.title !== 'string' || input.title.trim().length < 3) {
      throw new HttpsError('invalid-argument', 'title must be a meaningful string.')
    }
    if (!input.bodyPlain || typeof input.bodyPlain !== 'string' || input.bodyPlain.trim().length < 30) {
      throw new HttpsError(
        'invalid-argument',
        'bodyPlain must be at least 30 characters — write a draft body before asking for media suggestions.',
      )
    }

    const groq = new Groq({ apiKey: GROQ_API_KEY.value() })
    return await callGroq(groq, input)
  },
)
