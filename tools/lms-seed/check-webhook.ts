// One-off probe: list the Contentful webhooks in this space and their
// most recent delivery attempts. Helps diagnose why publishes aren't
// reaching the Cloud Function.
//
// Run with: npx tsx tools/lms-seed/check-webhook.ts

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

import { createPlainClient, requireContentfulConfig } from './contentful-client.ts'

async function main() {
  const client = createPlainClient(requireContentfulConfig())
  const hooks = await client.webhook.getMany({ query: {} })
  if (!hooks.items.length) {
    console.log('No webhooks configured in this space.')
    return
  }

  // Raw dump first — surfaces fields the SDK doesn't pretty-print
  // (notably any environment scoping). Header values are redacted
  // because some of them are shared secrets and printing them was the
  // root cause of an earlier credential leak into a transcript.
  for (const hook of hooks.items) {
    const parsed: unknown = JSON.parse(JSON.stringify(hook))
    const redacted = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as { headers?: Array<{ value?: string }> } : {}
    if (Array.isArray(redacted.headers)) {
      for (const h of redacted.headers) {
        if (h.value) h.value = '<redacted>'
      }
    }
    console.log('--- raw webhook config (header values redacted) ---')
    console.log(JSON.stringify(redacted, null, 2))
    console.log('---------------------------------------------------')
  }

  for (const hook of hooks.items) {
    console.log(`\n# ${hook.name}`)
    console.log(`  url:      ${hook.url}`)
    console.log(`  active:   ${hook.active}`)
    console.log(`  topics:   ${(hook.topics ?? []).join(', ') || '(all)'}`)
    console.log(`  filters:  ${JSON.stringify(hook.filters ?? [])}`)
    console.log(`  headers:  ${(hook.headers ?? []).map((h) => `${h.key}=<redacted>`).join(', ') || '(none)'}`)
    console.log(`  contentType: ${hook.transformation?.contentType ?? '(default)'}`)
    // Contentful environment scope — when present, the webhook only fires
    // for events in those envs. Empty/undefined = all environments.
    console.log('  environments: (inspect raw config above)')
    const calls = await client.webhookCall.getMany({ webhookDefinitionId: hook.sys.id, query: {} })
    const recent = calls.items.slice(0, 5)
    if (recent.length === 0) {
      console.log('  recent calls: (none)')
      continue
    }
    console.log('  recent calls:')
    for (const c of recent) {
      console.log(`    ${c.statusCode}  ${c.requestAt}  ${c.eventType}  ${c.url}`)
      if (c.errors?.length) console.log(`      errors: ${c.errors.join('; ')}`)
    }
  }
}

main().catch((e) => {
  console.error('Failed:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
