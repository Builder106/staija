// Add an environment filter so the webhook fires for events in BOTH
// master and staging. Contentful's actual default is master-only — even
// when no filters are set, the docs are misleading on this. Without
// this filter, publishes in staging silently produce no webhook calls.

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

import { createPlainClient, requireContentfulConfig } from './contentful-client.ts'

async function main() {
  const client = createPlainClient(requireContentfulConfig())
  const hooks = await client.webhook.getMany({ query: {} })
  for (const hook of hooks.items) {
    if (!hook.url.includes('contentfulwebhook')) continue
    console.log(`Patching ${hook.name} (${hook.sys.id})…`)
    const filters = [
      {
        in: [{ doc: 'sys.environment.sys.id' }, ['master', 'staging']],
      },
    ]
    const updated = await client.webhook.update({ webhookDefinitionId: hook.sys.id }, { filters })
    console.log(`  filters now: ${JSON.stringify(updated.filters)}`)
  }
}

main().catch((e) => {
  console.error('Failed:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
