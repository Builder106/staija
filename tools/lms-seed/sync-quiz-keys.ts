/**
 * Synchronize private answer keys for seeded demo quizzes into Firestore quiz_answer_keys.
 * Uses Firestore REST API with active gcloud application-default credentials or access token.
 */
import { execSync } from 'child_process'
import { config as loadEnv } from 'dotenv'
import { DEMO_QUIZZES } from './demo-quizzes.ts'

loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

const cliEnvFlag = process.argv.find((a) => a.startsWith('--env='))
const envId = cliEnvFlag ? cliEnvFlag.slice('--env='.length) : process.env.VITE_CONTENTFUL_ENV_ID || 'staging'
loadEnv({ path: `.env.${envId}.local`, override: true })
const projectId = envId === 'master' ? 'staija' : 'staija-staging'

export async function syncQuizAnswerKeys(targetProjectId: string = projectId): Promise<void> {
  console.log(`→ Syncing quiz answer keys to Firestore project: ${targetProjectId}`)
  let token = process.env.GCLOUD_TOKEN
  if (!token) {
    try {
      token = execSync('gcloud auth application-default print-access-token', { encoding: 'utf-8' }).trim()
    } catch (e) {
      throw new Error(`Could not get access token via gcloud: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  for (const quiz of DEMO_QUIZZES) {
    const answerKeysFields: Record<string, unknown> = {}
    for (const q of quiz.questions) {
      answerKeysFields[q.id] = {
        mapValue: {
          fields: {
            correctOptionId: { stringValue: q.correctOptionId },
            ...(q.explanation ? { explanation: { stringValue: q.explanation } } : {}),
          },
        },
      }
    }

    const docUrl = `https://firestore.googleapis.com/v1/projects/${targetProjectId}/databases/(default)/documents/quiz_answer_keys/${quiz.id}`
    const payload = {
      fields: {
        answerKeys: {
          mapValue: {
            fields: answerKeysFields,
          },
        },
      },
    }

    const res = await fetch(docUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Failed to set quiz answer keys for ${quiz.id}: ${res.status} ${errText}`)
    }
    console.log(`  ✓ quiz_answer_keys/${quiz.id} synced`)
  }
}

if (process.argv[1]?.endsWith('sync-quiz-keys.ts') || process.argv[1]?.endsWith('sync-quiz-keys.js')) {
  syncQuizAnswerKeys().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
