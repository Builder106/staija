import contentful from 'contentful-management'
import type { PlainClientAPI } from 'contentful-management'

const { createClient } = contentful

export interface ContentfulConfig {
  readonly spaceId: string
  readonly environmentId: string
  readonly accessToken: string
}

export function createPlainClient(config: ContentfulConfig): PlainClientAPI {
  return createClient(
    { accessToken: config.accessToken },
    { defaults: { spaceId: config.spaceId, environmentId: config.environmentId } },
  )
}

export function requireContentfulConfig(): ContentfulConfig {
  const spaceId = process.env.VITE_CONTENTFUL_SPACE_ID
  const environmentId = process.env.VITE_CONTENTFUL_ENV_ID
  const accessToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN
  if (!spaceId || !environmentId || !accessToken) {
    throw new Error(
      'Missing Contentful env vars. Set VITE_CONTENTFUL_SPACE_ID, VITE_CONTENTFUL_ENV_ID, and CONTENTFUL_MANAGEMENT_TOKEN in .env.',
    )
  }
  return { spaceId, environmentId, accessToken }
}
