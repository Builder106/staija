// Trigger one publish event and immediately check delivery activity.

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

import { createPlainClient, requireContentfulConfig } from './contentful-client.ts'

async function main() {
  const env = createPlainClient(requireContentfulConfig())

  console.log(`env=${process.env.VITE_CONTENTFUL_ENV_ID}`)

  // Pick a known demo entry and republish it.
  const id = 'demo-stepup-research-foundations'
  const entry = await env.entry.get({ entryId: id })
  console.log(`entry: ${id} version=${entry.sys.version} publishedVersion=${entry.sys.publishedVersion}`)

  if (entry.sys.publishedVersion) await env.entry.unpublish({ entryId: id }, entry)
  const fresh = await env.entry.get({ entryId: id })
  const published = await env.entry.publish({ entryId: id }, fresh)
  console.log(`republished. version=${published.sys.version} publishedVersion=${published.sys.publishedVersion}`)

  // Wait briefly, then check webhook delivery activity.
  console.log('\nwaiting 8s for delivery to settle...')
  await new Promise((r) => setTimeout(r, 8_000))

  const hooks = await env.webhook.getMany({ query: {} })
  for (const hook of hooks.items) {
    const calls = await env.webhookCall.getMany({ webhookDefinitionId: hook.sys.id, query: {} })
    console.log(`\n${hook.name}: ${calls.items.length} call(s)`)
    for (const c of calls.items.slice(0, 5)) {
      console.log(`  ${c.statusCode}  ${c.requestAt}  ${c.eventType}`)
      if (c.errors?.length) console.log(`    errors: ${JSON.stringify(c.errors)}`)
    }
  }
}

main().catch((e) => {
  console.error('Failed:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
