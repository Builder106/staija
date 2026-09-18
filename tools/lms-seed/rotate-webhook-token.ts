// Patch the Contentful webhook's x-staija-token header to whatever
// STAIJA_WEBHOOK_TOKEN is set to in the environment. Used after
// rotating the Firebase Functions secret so Contentful keeps sending
// the new value the function now expects.
//
// Usage:
//   STAIJA_WEBHOOK_TOKEN=<new-value> npx tsx tools/lms-seed/rotate-webhook-token.ts

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

import { createPlainClient, requireContentfulConfig } from './contentful-client.ts'

const TOKEN = process.env.STAIJA_WEBHOOK_TOKEN
if (!TOKEN) {
  console.error('STAIJA_WEBHOOK_TOKEN not set.')
  process.exit(1)
}

async function main() {
  const client = createPlainClient(requireContentfulConfig())
  const hooks = await client.webhook.getMany({ query: {} })
  for (const hook of hooks.items) {
    if (!hook.url.includes('contentfulwebhook')) continue
    console.log(`Patching ${hook.name} (${hook.sys.id})…`)
    const headers = (hook.headers ?? []).map((h) =>
      h.key === 'x-staija-token' ? { ...h, value: TOKEN! } : h,
    )
    await client.webhook.update({ webhookDefinitionId: hook.sys.id }, { headers })
    console.log('  header rotated.')
  }
}

main().catch((e) => {
  console.error('Failed:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
