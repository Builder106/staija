/**
 * LMS demo data seeder.
 *
 * Writes a small set of demo courses, modules, lessons, and assignment
 * specs into Contentful via the Management API. Once Contentful publishes
 * each entry, the existing contentfulWebhook Cloud Function mirrors it
 * into Firestore (`cms_courses`, `cms_modules`, `cms_lessons`,
 * `cms_assignmentSpecs`), and the admin UI at /admin/content/* picks it
 * up automatically — same flow as a human creating content by hand. So
 * the demo data is fully editable in the admin UI; treat it as a
 * starting point you can rewrite, not as fixtures.
 *
 * Identification for cleanup: every demo entry gets a Contentful
 * sys.id and slug prefixed with `demo-`. The `clear` command lists
 * every entry whose ID starts with that prefix and deletes it. Real
 * editorial content is untouched.
 *
 * Usage:
 *   npm run lms:seed             # creates (or updates) demo content
 *   npm run lms:clear            # deletes demo content
 *   npm run lms:clear -- --dry-run   # show what would be deleted
 *
 * Prerequisites:
 *   - VITE_CONTENTFUL_SPACE_ID, VITE_CONTENTFUL_ENV_ID, and
 *     CONTENTFUL_MANAGEMENT_TOKEN set in .env (the same vars the
 *     admin UI uses).
 *   - The contentfulWebhook function deployed and registered with the
 *     Contentful space; otherwise entries will exist in Contentful but
 *     not in Firestore. Use the admin UI's republish action to backfill
 *     if needed.
 */

// Load .env first, then layer .env.local on top so a per-machine
// override (e.g. VITE_CONTENTFUL_ENV_ID=staging) wins over the
// committed defaults — the same precedence Vite itself uses for the
// app build. A `--env=<name>` CLI flag wins over both, for the rare
// case (one-off seeding into master, switching to a feature env) where
// you need to bypass .env.local without renaming files.
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

const cliEnvFlag = process.argv.find((a) => a.startsWith('--env='))
if (cliEnvFlag) {
  process.env.VITE_CONTENTFUL_ENV_ID = cliEnvFlag.slice('--env='.length)
}

// contentful-management ships a CJS default export; under ESM (Node's
// "type": "module"), named imports aren't synthesized, so we grab
// createClient off the default. Types still come from the named exports.
import contentful from 'contentful-management'
import type { Environment, Entry } from 'contentful-management'
import type { Document } from '@contentful/rich-text-types'

const { createClient } = contentful

// ---------- Config ----------

const SPACE_ID = process.env.VITE_CONTENTFUL_SPACE_ID
const ENV_ID = process.env.VITE_CONTENTFUL_ENV_ID
const MANAGEMENT_TOKEN = process.env.CONTENTFUL_MANAGEMENT_TOKEN

const LOCALE = 'en-US'
const DEMO_PREFIX = 'demo-'

// ---------- Types ----------

type Program = 'stepup_scholars' | 'dynamerge'
type Submission = 'text' | 'file' | 'link' | 'text_or_file'

interface DemoQuiz {
  id: string
  title: string
  summary?: string
  passThresholdPercent?: number
  questions: Array<{
    id: string
    questionText: string
    options: Array<{ id: string; text: string }>
    correctOptionId: string
    explanation?: string
  }>
}

interface DemoLesson {
  id: string
  title: string
  bodyParagraphs: string[]
  estimatedMinutes: number
  videoUrl?: string
  completionCriteria?: 'viewed' | 'assignment_submitted' | 'quiz_passed'
  quiz?: DemoQuiz
}

interface DemoAssignment {
  id: string
  title: string
  instructionParagraphs: string[]
  submissionType: Submission
  dueOffsetDays?: number
}

interface DemoModule {
  id: string
  title: string
  summary: string
  unlockRule: 'sequential' | 'open'
  lessons: DemoLesson[]
  assignments: DemoAssignment[]
}

interface DemoCourse {
  id: string
  title: string
  slug: string
  program: Program
  summary: string
  track?: string
  version: string
  estimatedHours: number
  modules: DemoModule[]
}

// ---------- Demo content ----------
//
// Two demo courses, one per program. Lesson and assignment bodies are
// deliberately short — the goal is "this is the shape of a real course"
// not "this is a finished curriculum." Edit freely after seeding.

const COURSES: DemoCourse[] = [
  {
    id: `${DEMO_PREFIX}stepup-research-foundations`,
    slug: `${DEMO_PREFIX}stepup-research-foundations`,
    title: 'Research Foundations',
    program: 'stepup_scholars',
    summary:
      'A six-week introduction to research methods, lab safety, and scientific writing for incoming StepUp scholars.',
    track: 'foundations',
    version: '2026-spring',
    estimatedHours: 18,
    modules: [
      {
        id: `${DEMO_PREFIX}stepup-mod-lab-foundations`,
        title: 'Lab Foundations',
        summary: 'How a research lab actually works — people, papers, and pipettes.',
        unlockRule: 'sequential',
        lessons: [
          {
            id: `${DEMO_PREFIX}stepup-l-research-methodology`,
            title: 'What is research methodology?',
            estimatedMinutes: 25,
            bodyParagraphs: [
              'Research methodology is the explicit plan a scientist uses to answer a question. It covers what data you collect, how you collect it, and how you decide whether the data answers the question.',
              'In this lesson we walk through three real methodologies — a wet-lab experiment, a population study, and a computational simulation — and identify what they share.',
            ],
          },
          {
            id: `${DEMO_PREFIX}stepup-l-reading-papers`,
            title: 'Reading scientific papers',
            estimatedMinutes: 30,
            bodyParagraphs: [
              'Most scientific papers are not meant to be read front-to-back. We teach the skim-then-deepen pattern: abstract, then figures, then methods, then discussion.',
              'You will practice on a short paper from Nature Communications and write a four-sentence summary.',
            ],
          },
          {
            id: `${DEMO_PREFIX}stepup-l-lab-safety`,
            title: 'Lab safety basics',
            estimatedMinutes: 20,
            completionCriteria: 'quiz_passed',
            bodyParagraphs: [
              'Before you touch a single instrument, you need to understand the four-tier safety model used in our partner labs.',
              'This lesson is the prerequisite for any in-person session. The quiz at the end is required.',
            ],
            quiz: {
              id: `${DEMO_PREFIX}quiz-lab-safety`,
              title: 'Lab Safety Protocol Knowledge Check',
              summary: 'Evaluate your understanding of safety protocols and hazard identification.',
              passThresholdPercent: 70,
              questions: [
                {
                  id: 'q1',
                  questionText: 'What is the primary personal protective equipment (PPE) required when handling chemical reagents?',
                  options: [
                    { id: 'q1_o1', text: 'Safety goggles and lab coat' },
                    { id: 'q1_o2', text: 'Sunglasses and t-shirt' },
                    { id: 'q1_o3', text: 'Latex gloves only' },
                    { id: 'q1_o4', text: 'No PPE is required for small volumes' },
                  ],
                  correctOptionId: 'q1_o1',
                  explanation: 'Eye protection and lab coats shield against chemical splashes and spills.',
                },
                {
                  id: 'q2',
                  questionText: 'Where should chemical waste be disposed of after completing an experiment?',
                  options: [
                    { id: 'q2_o1', text: 'Poured directly down the sink' },
                    { id: 'q2_o2', text: 'Designated hazardous waste container' },
                    { id: 'q2_o3', text: 'Standard trash bin' },
                    { id: 'q2_o4', text: 'Left on the lab bench' },
                  ],
                  correctOptionId: 'q2_o2',
                  explanation: 'Chemical waste must always be collected in labelled hazardous waste containers.',
                },
              ],
            },
          },
        ],
        assignments: [
          {
            id: `${DEMO_PREFIX}stepup-a-paper-summary`,
            title: 'Annotated paper summary',
            submissionType: 'text_or_file',
            dueOffsetDays: 7,
            instructionParagraphs: [
              'Pick a recent open-access paper from a field that interests you. Submit a 300-word summary that answers: what was the question, what did they do, what did they find, what would you change.',
              'Mentors grade for clarity, not for technical correctness — we want to see you reading critically.',
            ],
          },
        ],
      },
      {
        id: `${DEMO_PREFIX}stepup-mod-experiment`,
        title: 'Designing Your First Experiment',
        summary: 'From a vague question to a falsifiable hypothesis.',
        unlockRule: 'sequential',
        lessons: [
          {
            id: `${DEMO_PREFIX}stepup-l-hypothesis`,
            title: 'Hypothesis crafting',
            estimatedMinutes: 25,
            bodyParagraphs: [
              'A good hypothesis is specific enough that one experiment can falsify it. We will sharpen vague ideas like "exercise improves memory" into testable claims.',
            ],
          },
          {
            id: `${DEMO_PREFIX}stepup-l-controls`,
            title: 'Controls and variables',
            estimatedMinutes: 20,
            bodyParagraphs: [
              'A control is what tells you the effect you are measuring is real. We will go through positive, negative, and sham controls with concrete examples.',
            ],
          },
          {
            id: `${DEMO_PREFIX}stepup-l-documenting`,
            title: 'Documenting your method',
            estimatedMinutes: 15,
            bodyParagraphs: [
              'If a stranger cannot reproduce your protocol from your notes, your notes are not done. We will use a shared lab-notebook template.',
            ],
          },
        ],
        assignments: [
          {
            id: `${DEMO_PREFIX}stepup-a-proposal`,
            title: 'Research proposal draft',
            submissionType: 'file',
            dueOffsetDays: 14,
            instructionParagraphs: [
              'Submit a one-page proposal: question, hypothesis, materials, method, and expected outcomes. Use the template linked from the previous lesson.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: `${DEMO_PREFIX}dynamerge-bootcamp-week1`,
    slug: `${DEMO_PREFIX}dynamerge-bootcamp-week1`,
    title: 'Dynamerge Bootcamp — Week 1',
    program: 'dynamerge',
    summary:
      'Programming and data-analysis foundations for the four-week pan-African virtual bootcamp.',
    track: 'bootcamp',
    version: '2026-summer',
    estimatedHours: 12,
    modules: [
      {
        id: `${DEMO_PREFIX}dynamerge-mod-programming`,
        title: 'Programming Foundations',
        summary: 'Enough Python to build the rest of the bootcamp on.',
        unlockRule: 'sequential',
        lessons: [
          {
            id: `${DEMO_PREFIX}dynamerge-l-hello-world`,
            title: 'Hello, world!',
            estimatedMinutes: 15,
            bodyParagraphs: [
              'Your first program. We will set up an in-browser Python sandbox so you do not have to install anything.',
            ],
          },
          {
            id: `${DEMO_PREFIX}dynamerge-l-variables`,
            title: 'Variables and types',
            estimatedMinutes: 20,
            bodyParagraphs: [
              'Strings, numbers, booleans, and lists — the four building blocks you will reach for ninety percent of the time.',
            ],
          },
          {
            id: `${DEMO_PREFIX}dynamerge-l-control-flow`,
            title: 'Control flow',
            estimatedMinutes: 25,
            bodyParagraphs: [
              'If, else, while, for. We will write a short program that classifies climate data into hot, cold, and temperate.',
            ],
          },
        ],
        assignments: [
          {
            id: `${DEMO_PREFIX}dynamerge-a-calculator`,
            title: 'Build a calculator',
            submissionType: 'link',
            dueOffsetDays: 5,
            instructionParagraphs: [
              'Build a four-function calculator in Python. Submit a link to a Replit or GitHub Gist with your solution.',
            ],
          },
        ],
      },
      {
        id: `${DEMO_PREFIX}dynamerge-mod-data-analysis`,
        title: 'Data Analysis Basics',
        summary: 'Turn a messy CSV into a story you can defend.',
        unlockRule: 'sequential',
        lessons: [
          {
            id: `${DEMO_PREFIX}dynamerge-l-datasets`,
            title: 'Working with datasets',
            estimatedMinutes: 30,
            bodyParagraphs: [
              'Pandas DataFrames, basic filtering, and the importance of reading the data dictionary before you write a single line of analysis.',
            ],
          },
          {
            id: `${DEMO_PREFIX}dynamerge-l-visualization`,
            title: 'Visualization principles',
            estimatedMinutes: 25,
            bodyParagraphs: [
              'A bar chart is a sentence. A scatter plot is a paragraph. We will pair each chart type with the question it actually answers.',
            ],
          },
        ],
        assignments: [
          {
            id: `${DEMO_PREFIX}dynamerge-a-data-story`,
            title: 'Data story project',
            submissionType: 'text_or_file',
            dueOffsetDays: 10,
            instructionParagraphs: [
              'Pick a public dataset from the linked list. Submit a notebook (or write-up) with one chart that tells a story your reader did not already know.',
            ],
          },
        ],
      },
    ],
  },
]

// ---------- Helpers ----------

function richTextDoc(paragraphs: string[]): Document {
  return {
    nodeType: 'document',
    data: {},
    content: paragraphs.map((value) => ({
      nodeType: 'paragraph',
      data: {},
      content: [{ nodeType: 'text', value, marks: [], data: {} }],
    })),
  } as Document
}

function L<T>(value: T | undefined): { [LOCALE]: T } | undefined {
  if (value === undefined || value === null) return undefined
  return { [LOCALE]: value }
}

function entryLink(id: string) {
  return { sys: { type: 'Link' as const, linkType: 'Entry' as const, id } }
}

function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out as Partial<T>
}

async function getEnv(): Promise<Environment> {
  if (!SPACE_ID || !ENV_ID || !MANAGEMENT_TOKEN) {
    throw new Error(
      'Missing Contentful env vars. Set VITE_CONTENTFUL_SPACE_ID, VITE_CONTENTFUL_ENV_ID, and CONTENTFUL_MANAGEMENT_TOKEN in .env.',
    )
  }
  const client = createClient({ accessToken: MANAGEMENT_TOKEN })
  const space = await client.getSpace(SPACE_ID)
  return space.getEnvironment(ENV_ID)
}

// Idempotent write: if an entry with `id` exists, patch its fields and
// return it. Otherwise create with that ID. Always publishes after.
async function upsert(
  env: Environment,
  contentType: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<Entry> {
  let entry: Entry
  try {
    entry = await env.getEntry(id)
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue
      ;(entry.fields as Record<string, unknown>)[k] = v
    }
    entry = await entry.update()
  } catch (err: unknown) {
    if (!isNotFound(err)) throw err
    entry = await env.createEntryWithId(contentType, id, { fields })
  }
  if (!entry.sys.publishedVersion || entry.sys.version !== entry.sys.publishedVersion + 1) {
    entry = await entry.publish()
  }
  return entry
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || !err) return false
  const e = err as { name?: string; status?: number; sys?: { id?: string } }
  return e.name === 'NotFound' || e.status === 404 || e.sys?.id === 'NotFound'
}

// ---------- Seed ----------

async function seed() {
  const env = await getEnv()
  console.log(`→ Seeding into space=${SPACE_ID} env=${ENV_ID}`)

  // Order matters: leaves first (assignments, lessons), then modules
  // that reference them, then courses that reference modules.
  for (const course of COURSES) {
    console.log(`\n📚 ${course.title} (${course.program})`)

    const moduleIds: string[] = []
    for (const mod of course.modules) {
      const lessonIds: string[] = []
      for (const lesson of mod.lessons) {
        let quizLinkId: string | undefined
        if (lesson.quiz) {
          await upsert(env, 'quiz', lesson.quiz.id, clean({
            slug: L(lesson.quiz.id),
            title: L(lesson.quiz.title),
            summary: L(lesson.quiz.summary),
            passThresholdPercent: L(lesson.quiz.passThresholdPercent ?? 70),
            questions: L(lesson.quiz.questions),
          }))
          console.log(`  · quiz    ${lesson.quiz.id}`)
          quizLinkId = lesson.quiz.id
        }

        await upsert(env, 'lesson', lesson.id, clean({
          slug: L(lesson.id),
          title: L(lesson.title),
          body: L(richTextDoc(lesson.bodyParagraphs)),
          videoUrl: L(lesson.videoUrl),
          estimatedMinutes: L(lesson.estimatedMinutes),
          completionCriteria: L(lesson.completionCriteria ?? 'viewed'),
          quiz: quizLinkId ? L(entryLink(quizLinkId)) : undefined,
        }))
        console.log(`  · lesson  ${lesson.id}`)
        lessonIds.push(lesson.id)
      }

      const assignmentIds: string[] = []
      for (const a of mod.assignments) {
        await upsert(env, 'assignmentSpec', a.id, clean({
          slug: L(a.id),
          title: L(a.title),
          instructions: L(richTextDoc(a.instructionParagraphs)),
          submissionType: L(a.submissionType),
          dueOffsetDays: L(a.dueOffsetDays),
        }))
        console.log(`  · assign  ${a.id}`)
        assignmentIds.push(a.id)
      }

      await upsert(env, 'module', mod.id, clean({
        slug: L(mod.id),
        title: L(mod.title),
        summary: L(mod.summary),
        unlockRule: L(mod.unlockRule),
        lessons: L(lessonIds.map(entryLink)),
        assignments: L(assignmentIds.map(entryLink)),
      }))
      console.log(`  · module  ${mod.id}`)
      moduleIds.push(mod.id)
    }

    await upsert(env, 'course', course.id, clean({
      slug: L(course.slug),
      title: L(course.title),
      program: L(course.program),
      summary: L(course.summary),
      track: L(course.track),
      version: L(course.version),
      estimatedHours: L(course.estimatedHours),
      published: L(true),
      modules: L(moduleIds.map(entryLink)),
    }))
    console.log(`  · course  ${course.id}`)
  }

  console.log('\n✓ Seed complete. Webhook should mirror to Firestore within seconds.')
}

// ---------- Republish ----------
//
// Forces a fresh publish event on every demo entry so the Contentful
// webhook fires and the Firestore mirror catches up. Useful right after
// registering the webhook for the first time, since the seed's original
// publishes won't replay.

async function republishDemo() {
  const env = await getEnv()
  console.log(`→ Republishing demo entries in space=${SPACE_ID} env=${ENV_ID}`)

  // Order: leaves first so refs resolve in the mirror as parents arrive.
  const types = ['lesson', 'assignmentSpec', 'module', 'course'] as const
  let total = 0
  for (const contentType of types) {
    const result = await env.getEntries({ content_type: contentType, limit: 1000 })
    const demos = result.items.filter((e) => e.sys.id.startsWith(DEMO_PREFIX))
    for (const entry of demos) {
      try {
        // update() bumps the version even if no fields changed, which
        // makes the subsequent publish() emit a fresh webhook event.
        // Avoid unpublish-then-publish: it generates two webhooks per
        // entry and they can race in the mirror (delete arrives after
        // the publish, leaving the doc missing).
        const updated = await entry.update()
        await updated.publish()
        console.log(`  · ${contentType.padEnd(15)} ${entry.sys.id}`)
        total++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`    ! ${entry.sys.id}: ${message}`)
      }
    }
  }
  console.log(`\n✓ Republished ${total} entries.`)
}

// ---------- Clear ----------

async function clearDemo(opts: { dryRun: boolean }) {
  const env = await getEnv()
  console.log(`→ Clearing demo entries from space=${SPACE_ID} env=${ENV_ID}${opts.dryRun ? ' (dry run)' : ''}`)

  // Delete in reverse dependency order: courses first (so nothing
  // references modules), then modules, then their leaves.
  const types = ['course', 'module', 'lesson', 'assignmentSpec'] as const

  for (const contentType of types) {
    const result = await env.getEntries({ content_type: contentType, limit: 1000 })
    const demos = result.items.filter((e) => e.sys.id.startsWith(DEMO_PREFIX))
    if (demos.length === 0) {
      console.log(`  ${contentType.padEnd(15)} (none)`)
      continue
    }
    for (const entry of demos) {
      console.log(`  ${contentType.padEnd(15)} ${entry.sys.id}`)
      if (opts.dryRun) continue
      try {
        if (entry.sys.publishedVersion) await entry.unpublish()
        const fresh = await env.getEntry(entry.sys.id)
        await fresh.delete()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`    ! failed: ${message}`)
      }
    }
  }

  console.log(opts.dryRun ? '\n(dry run; nothing deleted)' : '\n✓ Demo entries removed.')
}

// ---------- Entry point ----------

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const dryRun = rest.includes('--dry-run')
  const force = rest.includes('--force')

  // Guard: refuse to seed/clear against master unless explicitly forced.
  // Demo data is for editorial iteration; if it ever touches the
  // production environment, it's a deliberate choice, not a default.
  if ((cmd === 'seed' || cmd === 'clear' || cmd === 'republish') && !force && ENV_ID === 'master') {
    console.error(
      `Refusing to ${cmd} against the 'master' Contentful environment.\n` +
        `Set VITE_CONTENTFUL_ENV_ID=staging in .env.local (or any non-master env)\n` +
        `and re-run. Pass --force to override if you really mean to write to master.`,
    )
    process.exitCode = 1
    return
  }

  switch (cmd) {
    case 'seed':
      await seed()
      break
    case 'clear':
      await clearDemo({ dryRun })
      break
    case 'republish':
      await republishDemo()
      break
    default:
      console.log('Usage: tsx tools/lms-seed/seed.ts <seed|clear|republish> [--dry-run] [--force]')
      process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
