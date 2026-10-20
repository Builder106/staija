/**
 * Add the LMS quiz content model and the lesson quiz reference.
 * Preview by default; --apply writes the named Contentful environment.
 */
import { config as loadEnv } from 'dotenv'
import type { ContentTypeProps } from 'contentful-management'
import { createPlainClient, requireContentfulConfig } from './contentful-client.ts'

loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

const envFlag = process.argv.find((arg) => arg.startsWith('--env='))
if (envFlag) process.env.VITE_CONTENTFUL_ENV_ID = envFlag.slice('--env='.length)

const config = requireContentfulConfig()
if (!['master', 'staging'].includes(config.environmentId)) {
  throw new Error('Use --env=master or --env=staging.')
}
const apply = process.argv.includes('--apply')
const client = createPlainClient(config)

const quizFields: ContentTypeProps['fields'] = [
  { id: 'slug', name: 'Slug', type: 'Symbol', required: true, localized: false, validations: [{ unique: true }] },
  { id: 'title', name: 'Title', type: 'Symbol', required: true, localized: false },
  { id: 'summary', name: 'Summary', type: 'Text', required: false, localized: false },
  { id: 'passThresholdPercent', name: 'Pass threshold percent', type: 'Integer', required: false, localized: false, validations: [{ range: { min: 0, max: 100 } }] },
  { id: 'questions', name: 'Questions without answer keys', type: 'Object', required: true, localized: false },
]

const lessonQuizField: ContentTypeProps['fields'][number] = {
  id: 'quiz',
  name: 'Quiz',
  type: 'Link',
  linkType: 'Entry',
  required: false,
  localized: false,
  validations: [{ linkContentType: ['quiz'] }],
}

function matchesField(actual: ContentTypeProps['fields'][number], expected: ContentTypeProps['fields'][number]): boolean {
  return actual.type === expected.type && actual.linkType === expected.linkType
}

async function getType(id: string): Promise<ContentTypeProps | null> {
  try {
    return await client.contentType.get({ contentTypeId: id })
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null
    throw error
  }
}

const quiz = await getType('quiz')
const lesson = await getType('lesson')
if (!lesson) throw new Error('The lesson content type is missing.')
if (quiz) {
  for (const field of quizFields) {
    const existing = quiz.fields.find((item) => item.id === field.id)
    if (!existing || !matchesField(existing, field)) {
      throw new Error(`Quiz field ${field.id} differs from the expected schema.`)
    }
  }
}
const existingLink = lesson.fields.find((field) => field.id === 'quiz')
if (existingLink && !matchesField(existingLink, lessonQuizField)) {
  throw new Error('The existing lesson.quiz field is not a quiz entry link.')
}

const changes = [
  !quiz && 'Create and publish the quiz content type',
  !existingLink && 'Add lesson.quiz entry link and publish the lesson content type',
].filter(Boolean)
console.log(`Contentful environment: ${config.environmentId}`)
console.log(changes.length ? changes.join('\n') : 'Quiz schema is already present.')
if (!apply || changes.length === 0) process.exit(0)

if (!quiz) {
  const created = await client.contentType.createWithId(
    { contentTypeId: 'quiz' },
    {
      name: 'Quiz',
      description: 'LMS knowledge check. Questions and options only; answer keys are stored in server-only Firestore.',
      displayField: 'title',
      fields: quizFields,
    },
  )
  await client.contentType.publish({ contentTypeId: 'quiz' }, created)
}
if (!existingLink) {
  const updated = await client.contentType.update(
    { contentTypeId: 'lesson' },
    { ...lesson, fields: [...lesson.fields, lessonQuizField] },
  )
  await client.contentType.publish({ contentTypeId: 'lesson' }, updated)
}
console.log('Quiz schema migration complete.')
