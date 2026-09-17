/**
 * outlineCourse — Generates a draft course tree (course → modules →
 * lessons + per-module assignment specs) using Groq, then creates the
 * matching Contentful entries as **drafts** (unpublished). Staff
 * refines them in /admin/content/* and publishes when ready, which
 * fires the existing webhook → Firestore mirror flow.
 *
 * Why a callable, not a client-side fetch:
 *   - GROQ_API_KEY and CONTENTFUL_MANAGEMENT_TOKEN stay server-side.
 *   - Auth is enforced via the user's staff/admin role.
 *   - Contentful writes happen in dependency order in one place; if
 *     the client died mid-creation we'd leave orphans.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore } from 'firebase-admin/firestore'
import Groq from 'groq-sdk'
import * as contentful from 'contentful-management'
import { z } from 'zod'

const GROQ_API_KEY = defineSecret('GROQ_API_KEY')
const CONTENTFUL_MANAGEMENT_TOKEN = defineSecret('CONTENTFUL_MANAGEMENT_TOKEN')
const CONTENTFUL_SPACE_ID = defineSecret('CONTENTFUL_SPACE_ID')

const LOCALE = 'en-US'

// ---------- Input ----------

interface OutlineInput {
  /** What the course is about. Free-form prose. */
  topic: string
  /** Which program the course belongs to. */
  program: 'stepup_scholars' | 'dynamerge'
  /** Course duration. Used as the unit count: typically equals modules. */
  weeks: number
  /** Lessons per module. Defaults to 3. */
  lessonsPerModule?: number
  /** Audience description, e.g. "high school students 15-19, Nigeria". */
  audience?: string
  /** Course version, e.g. "2026-spring". Defaults to current term. */
  version?: string
  /** Contentful environment to write into. Defaults to master. */
  env?: string
}

// ---------- Schema for Groq's JSON output ----------

const OutlineSchema = z.object({
  course: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    track: z.string().optional(),
  }),
  modules: z
    .array(
      z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
        lessons: z
          .array(
            z.object({
              title: z.string().min(1),
              bodyParagraphs: z.array(z.string().min(1)).min(1),
              estimatedMinutes: z.number().int().positive(),
            }),
          )
          .min(1),
        assignment: z
          .object({
            title: z.string().min(1),
            instructionParagraphs: z.array(z.string().min(1)).min(1),
            submissionType: z.enum(['text', 'file', 'link', 'text_or_file']),
            dueOffsetDays: z.number().int().positive(),
          })
          .nullable()
          .optional(),
      }),
    )
    .min(1),
})

type Outline = z.infer<typeof OutlineSchema>

// ---------- Helpers ----------

async function callerRole(uid: string): Promise<string | null> {
  const snap = await getFirestore().collection('users').doc(uid).get()
  return (snap.data()?.role as string | undefined) ?? null
}

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function richTextDoc(paragraphs: string[]) {
  return {
    nodeType: 'document',
    data: {},
    content: paragraphs.map((value) => ({
      nodeType: 'paragraph',
      data: {},
      content: [{ nodeType: 'text', value, marks: [], data: {} }],
    })),
  }
}

function L<T>(value: T | undefined) {
  if (value === undefined || value === null) return undefined
  return { [LOCALE]: value }
}

function entryLink(id: string) {
  return { sys: { type: 'Link' as const, linkType: 'Entry' as const, id } }
}

const TERM_BY_MONTH = [
  'spring','spring','spring','spring',
  'summer','summer','summer','summer',
  'fall','fall','fall','fall',
] as const

function currentTermVersion(): string {
  const d = new Date()
  return `${d.getFullYear()}-${TERM_BY_MONTH[d.getMonth()]}`
}

// ---------- Groq ----------

const SYSTEM_PROMPT = `You are an instructional designer drafting a course outline for STAIJA, a research and STEM education program for African high-school and gap-year students.

Your job: produce a JSON document matching the requested schema. The output is a draft scaffold that a human editor will refine — be specific and concrete, not vague.

Tone and style:
- Direct and practical. No marketing language ("powerful", "robust", "cutting-edge", "transformative"). Avoid superlatives.
- Lesson body paragraphs read like real curriculum prose, not slide bullets.
- Lesson titles are short (≤ 7 words) and tell the student what they'll do or learn.
- Module titles describe a concrete capability the student will build.
- Each lesson: 2–4 short paragraphs (50–120 words each) that introduce the concept and gesture at how it'll be taught. Don't write the full lesson — give the editor a clear starting point.
- Each module ends with one assignment that exercises the lessons.

Constraints:
- estimatedMinutes per lesson should land between 10 and 45.
- dueOffsetDays per assignment is days from module start (typically 5–14).
- submissionType is one of: "text", "file", "link", "text_or_file".
- Output ONLY valid JSON matching the schema. No prose, no markdown fences.`

async function callGroq(client: Groq, params: OutlineInput): Promise<Outline> {
  const programLabel =
    params.program === 'stepup_scholars'
      ? 'StepUp Scholars (in-person research incubator in Nigeria)'
      : 'Dynamerge (pan-African virtual bootcamp)'
  const audience = params.audience ?? 'high-school and gap-year students, ages 15–19, across Africa'
  const lessonsPerModule = params.lessonsPerModule ?? 3
  const moduleCount = params.weeks

  const userPrompt = `Design a course for the ${programLabel} program.

Topic: ${params.topic}
Audience: ${audience}
Modules: ${moduleCount} (one per week)
Lessons per module: ${lessonsPerModule}
Assignment per module: yes

Required JSON shape:
{
  "course": {
    "title": "...",
    "summary": "1-3 sentence pitch.",
    "track": "optional short slug-like category, e.g. 'foundations'"
  },
  "modules": [
    {
      "title": "...",
      "summary": "1-2 sentences.",
      "lessons": [
        { "title": "...", "bodyParagraphs": ["...", "..."], "estimatedMinutes": 20 }
      ],
      "assignment": {
        "title": "...",
        "instructionParagraphs": ["..."],
        "submissionType": "text_or_file",
        "dueOffsetDays": 7
      }
    }
  ]
}`

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.6,
    max_tokens: 8000,
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
  } catch (err) {
    console.error('[outlineCourse] Groq returned non-JSON:', raw.slice(0, 200))
    throw new HttpsError('internal', 'Groq returned malformed JSON.')
  }

  const result = OutlineSchema.safeParse(parsed)
  if (!result.success) {
    console.error('[outlineCourse] Outline failed schema validation:', result.error.issues)
    throw new HttpsError('internal', 'Groq output did not match the expected outline shape.')
  }
  return result.data
}

// ---------- Contentful entry creation ----------

async function writeOutline(
  client: contentful.PlainClientAPI,
  outline: Outline,
  params: OutlineInput,
): Promise<string> {
  const slugBase = slugify(outline.course.title) || `outline-${Date.now()}`
  const version = params.version ?? currentTermVersion()

  const moduleIds: string[] = []
  for (let mi = 0; mi < outline.modules.length; mi++) {
    const mod = outline.modules[mi]
    const moduleSlugBase = `${slugBase}-m${mi + 1}-${slugify(mod.title)}`.slice(0, 60)

    const lessonIds: string[] = []
    for (let li = 0; li < mod.lessons.length; li++) {
      const lesson = mod.lessons[li]
      const lessonSlug = `${moduleSlugBase}-l${li + 1}-${slugify(lesson.title)}`.slice(0, 64)
      const lessonEntry = await client.entry.create(
        { contentTypeId: 'lesson' },
        {
          fields: {
            slug: L(lessonSlug),
            title: L(lesson.title),
            body: L(richTextDoc(lesson.bodyParagraphs)),
            estimatedMinutes: L(lesson.estimatedMinutes),
            completionCriteria: L('viewed'),
          },
        },
      )
      lessonIds.push(lessonEntry.sys.id)
    }

    const assignmentIds: string[] = []
    if (mod.assignment) {
      const a = mod.assignment
      const assignSlug = `${moduleSlugBase}-a-${slugify(a.title)}`.slice(0, 64)
      const assignEntry = await client.entry.create(
        { contentTypeId: 'assignmentSpec' },
        {
          fields: {
            slug: L(assignSlug),
            title: L(a.title),
            instructions: L(richTextDoc(a.instructionParagraphs)),
            submissionType: L(a.submissionType),
            dueOffsetDays: L(a.dueOffsetDays),
          },
        },
      )
      assignmentIds.push(assignEntry.sys.id)
    }

    const moduleEntry = await client.entry.create(
      { contentTypeId: 'module' },
      {
        fields: {
          slug: L(moduleSlugBase),
          title: L(mod.title),
          summary: L(mod.summary),
          unlockRule: L('sequential'),
          lessons: L(lessonIds.map(entryLink)),
          assignments: L(assignmentIds.length ? assignmentIds.map(entryLink) : undefined),
        },
      },
    )
    moduleIds.push(moduleEntry.sys.id)
  }

  const courseEntry = await client.entry.create(
    { contentTypeId: 'course' },
    {
      fields: {
        slug: L(slugBase),
        title: L(outline.course.title),
        program: L(params.program),
        summary: L(outline.course.summary),
        track: L(outline.course.track),
        version: L(version),
        published: L(false),
        modules: L(moduleIds.map(entryLink)),
      },
    },
  )

  return courseEntry.sys.id
}

// ---------- Callable ----------

export const outlineCourse = onCall<OutlineInput>(
  {
    secrets: [GROQ_API_KEY, CONTENTFUL_MANAGEMENT_TOKEN, CONTENTFUL_SPACE_ID],
    memory: '512MiB',
    timeoutSeconds: 120,
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

    const input = request.data ?? ({} as OutlineInput)
    if (!input.topic || typeof input.topic !== 'string' || input.topic.trim().length < 5) {
      throw new HttpsError('invalid-argument', 'topic must be a meaningful string.')
    }
    if (input.program !== 'stepup_scholars' && input.program !== 'dynamerge') {
      throw new HttpsError('invalid-argument', 'program must be stepup_scholars or dynamerge.')
    }
    if (!Number.isInteger(input.weeks) || input.weeks < 1 || input.weeks > 16) {
      throw new HttpsError('invalid-argument', 'weeks must be an integer between 1 and 16.')
    }

    // 1. Generate outline.
    const groq = new Groq({ apiKey: GROQ_API_KEY.value() })
    const outline = await callGroq(groq, input)

    // 2. Create draft entries in Contentful.
    const cmaClient = contentful.createClient(
      { accessToken: CONTENTFUL_MANAGEMENT_TOKEN.value() },
      {
        defaults: {
          spaceId: CONTENTFUL_SPACE_ID.value(),
          environmentId: input.env ?? 'master',
        },
      },
    )
    const courseId = await writeOutline(cmaClient, outline, input)

    return {
      courseId,
      title: outline.course.title,
      moduleCount: outline.modules.length,
      lessonCount: outline.modules.reduce((sum, m) => sum + m.lessons.length, 0),
      assignmentCount: outline.modules.filter((m) => m.assignment).length,
    }
  },
)
