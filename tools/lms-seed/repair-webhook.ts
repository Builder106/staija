// Last-resort: delete the existing webhook and recreate it via API,
// guaranteeing every field is exactly right (no UI copy-paste artifacts,
// no leading whitespace in name, etc).
//
// The webhook URL and shared token are read from .env.local — never
// hardcode them here. A previous version of this file embedded the
// token literal and got picked up by GitGuardian; rotation followed.
// Set:
//   STAIJA_WEBHOOK_URL=https://contentfulwebhook-...-uc.a.run.app
//   STAIJA_WEBHOOK_TOKEN=<the same value bound to CONTENTFUL_WEBHOOK_SECRET>

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

import { createPlainClient, requireContentfulConfig } from './contentful-client.ts'

const URL = process.env.STAIJA_WEBHOOK_URL
const TOKEN = process.env.STAIJA_WEBHOOK_TOKEN

if (!URL || !TOKEN) {
  console.error('Set STAIJA_WEBHOOK_URL and STAIJA_WEBHOOK_TOKEN in .env.local before running.')
  process.exit(1)
}

async function main() {
  const client = createPlainClient(requireContentfulConfig())
  const hooks = await client.webhook.getMany({ query: {} })
  for (const hook of hooks.items) {
    if (hook.url.includes('contentfulwebhook')) {
      console.log(`Deleting existing: ${hook.sys.id}`)
      await client.webhook.delete({ webhookDefinitionId: hook.sys.id })
    }
  }

  // Recreate from scratch.
  const created = await client.webhook.create({
    name: 'Mirror to Firestore (LMS)',
    url: URL,
    topics: [
      'Entry.publish',
      'Entry.unpublish',
      'Entry.archive',
      'Entry.unarchive',
      'Entry.delete',
    ],
    headers: [{ key: 'x-staija-token', value: TOKEN }],
    active: true,
  })
  console.log(`Created: ${created.sys.id}`)
  console.log(`  topics: ${created.topics.join(', ')}`)
  console.log(`  active: ${created.active}`)
}

main().catch((e) => {
  console.error('Failed:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
