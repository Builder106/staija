// Minimal Contentful Delivery API client for the Vue app. Preview API
// (drafts) is intentionally not wired here — when staff need a
// "preview as student" surface, route it through a server-side
// callable so the preview token never ships to the browser.
import { getAppConfig } from '../utils/env';

export type ContentfulClientConfig = {
  spaceId: string;
  environmentId: string;
  token: string;
  host?: 'cdn.contentful.com';
};

function buildEndpoint(
  { spaceId, environmentId, host = 'cdn.contentful.com' }: ContentfulClientConfig,
  path: string,
): string {
  return `https://${host}/spaces/${spaceId}/environments/${environmentId}${path}`;
}

async function httpGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Contentful request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

export class ContentfulClient {
  private config: ContentfulClientConfig;

  constructor(config?: Partial<ContentfulClientConfig>) {
    const app = getAppConfig();
    if (!app.contentful) throw new Error('Contentful is not configured in environment variables');

    this.config = {
      spaceId: config?.spaceId || app.contentful.spaceId,
      environmentId: config?.environmentId || app.contentful.environmentId,
      token: config?.token || app.contentful.deliveryToken,
      host: config?.host || 'cdn.contentful.com',
    };
  }

  // Generic entries fetch
  async getEntries<T = unknown>(query: Record<string, string | number | boolean> = {}): Promise<T> {
    const search = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => search.append(k, String(v)));
    const url = buildEndpoint(this.config, `/entries?${search.toString()}`);
    return httpGet<T>(url, this.config.token);
  }

  // Single entry by ID
  async getEntry<T = unknown>(entryId: string, include = 2): Promise<T> {
    const url = buildEndpoint(this.config, `/entries/${entryId}?include=${include}`);
    return httpGet<T>(url, this.config.token);
  }

  // Assets (images/files)
  async getAsset<T = unknown>(assetId: string): Promise<T> {
    const url = buildEndpoint(this.config, `/assets/${assetId}`);
    return httpGet<T>(url, this.config.token);
  }
}

// Convenience helpers for common content types we plan to model
export async function fetchBlogPosts(limit = 10) {
  const client = new ContentfulClient();
  return client.getEntries({ content_type: 'blogPost', order: '-sys.createdAt', limit });
}

export async function fetchPrograms(limit = 10) {
  const client = new ContentfulClient();
  return client.getEntries({ content_type: 'program', order: 'fields.title', limit });
}
