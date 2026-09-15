import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface VercelHeader {
  key: string
  value: string
}

interface VercelConfig {
  headers: Array<{ headers: VercelHeader[] }>
}

const config = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as VercelConfig

function headerValue(key: string): string {
  const value = config.headers.flatMap((rule) => rule.headers).find((header) => header.key === key)?.value
  if (!value) throw new Error(`Missing ${key} header`)
  return value
}

function directiveSources(policy: string, directive: string): string[] {
  const parts = policy
    .split(';')
    .map((entry) => entry.trim().split(/\s+/))
    .find(([name]) => name === directive)
  return parts?.slice(1) ?? []
}

describe('OAuth security headers', () => {
  const contentSecurityPolicy = headerValue('Content-Security-Policy')

  it('preserves the Google Identity Services sources required by the popup flow', () => {
    expect(directiveSources(contentSecurityPolicy, 'script-src')).toContain(
      'https://accounts.google.com/gsi/client',
    )
    expect(directiveSources(contentSecurityPolicy, 'script-src')).toContain(
      'https://apis.google.com',
    )
    expect(directiveSources(contentSecurityPolicy, 'connect-src')).toContain(
      'https://accounts.google.com/gsi/',
    )
    expect(directiveSources(contentSecurityPolicy, 'frame-src')).toEqual(
      expect.arrayContaining([
        'https://accounts.google.com/gsi/',
        'https://staija-staging.firebaseapp.com',
      ]),
    )
  })

  it('keeps the opener relationship required for OAuth popups', () => {
    expect(headerValue('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups')
  })
})
