// Update the existing webhook's topics from short-form (Entry.publish)
// to namespaced form (ContentManagement.Entry.publish). Some accounts
// only deliver when the namespaced form is used; the short form is
// silently ignored.

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

import { createPlainClient, requireContentfulConfig } from './contentful-client.ts'

const NAMESPACED = [
  'ContentManagement.Entry.archive',
  'ContentManagement.Entry.unarchive',
  'ContentManagement.Entry.publish',
  'ContentManagement.Entry.unpublish',
  'ContentManagement.Entry.delete',
]

async function main() {
  const client = createPlainClient(requireContentfulConfig())
  const hooks = await client.webhook.getMany({ query: {} })
  for (const hook of hooks.items) {
    if (!hook.url.includes('contentfulwebhook')) continue
    console.log(`Patching ${hook.name}…`)
    const updated = await client.webhook.update({ webhookDefinitionId: hook.sys.id }, { topics: NAMESPACED })
    console.log(`  topics now: ${updated.topics.join(', ')}`)
  }
}

main().catch((e) => {
  console.error('Failed:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
