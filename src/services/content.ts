/**
 * Content service — typed read-side wrapper over Contentful for the public
 * site. Falls back to mock data when Contentful env vars are missing so the
 * dev server keeps rendering without credentials.
 *
 * Read-only. Authoring lives in Contentful Studio + the existing
 * `contentful-management.ts` service used by the admin tree.
 */

import { getAppConfig } from '../utils/env';
import { ContentfulClient } from './contentful';

// --- DTOs --------------------------------------------------------------

export type BlogProgram = 'stepup' | 'dynamerge' | 'general';
export type BlogTopic = 'research' | 'stories' | 'news';

export interface BlogPost {
  slug: string;
  title: string;
  dek: string;
  hero: string;
  body: unknown; // Contentful rich-text doc; renderer is page-side
  program: BlogProgram;
  topic: BlogTopic;
  author: string;
  publishedAt: string; // ISO
  readingTime?: string;
}

export interface EventItem {
  slug: string;
  title: string;
  dek: string;
  hero?: string;
  datetime: string; // ISO
  timezone: string;
  location: string;
  isVirtual: boolean;
  type: string;
  capacity?: number;
  registrationDeadline?: string;
}

// --- Contentful entry shape (minimal) ---------------------------------

interface ContentfulEntry<F> {
  sys: { id: string; createdAt: string; updatedAt: string };
  fields: F;
}

interface ContentfulCollection<F> {
  total: number;
  skip: number;
  limit: number;
  items: ContentfulEntry<F>[];
  includes?: {
    Asset?: Array<{ sys: { id: string }; fields: { file: { url: string } } }>;
    Entry?: Array<{
      sys: { id: string; contentType?: { sys: { id: string } } };
      fields: Record<string, unknown>;
    }>;
  };
}

// Field shapes match the Contentful content model in space `zcw0qx1phkan`.
// If the editorial team adds or renames fields in Contentful, update these
// interfaces and the corresponding mapper(s) below — the public BlogPost /
// EventItem types in this file are the contract the rest of the app
// depends on, and shouldn't change without ripple-effect refactors.
interface BlogPostFields {
  slug: string;
  title: string;
  excerpt?: string;
  content: unknown; // Contentful RichText document
  coverImage?: { sys: { id: string } };
  author: { sys: { id: string } }; // Link to an Author entry
  category?: { sys: { id: string } }; // Link to a Category entry
  tags?: string[];
  publishDate: string;
  status?: string;
}

interface EventFields {
  slug: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  coverImage?: { sys: { id: string } };
  registrationUrl?: string;
  status?: string;
}

interface AuthorFields {
  name: string;
  slug: string;
}

interface CategoryFields {
  name: string;
  slug: string;
}

// --- Mappers -----------------------------------------------------------

function resolveAssetUrl(
  assetRef: { sys: { id: string } } | undefined,
  includes: ContentfulCollection<unknown>['includes']
): string | undefined {
  if (!assetRef || !includes?.Asset) return undefined;
  const asset = includes.Asset.find(a => a.sys.id === assetRef.sys.id);
  if (!asset) return undefined;
  const url = asset.fields.file.url;
  return url.startsWith('//') ? `https:${url}` : url;
}

function resolveLinkedEntry<F>(
  entryRef: { sys: { id: string } } | undefined,
  includes: ContentfulCollection<unknown>['includes']
): F | null {
  if (!entryRef || !includes?.Entry) return null;
  const entry = includes.Entry.find(e => e.sys.id === entryRef.sys.id);
  return (entry?.fields as F | undefined) ?? null;
}

// Map a Category entry's `slug` (e.g. "stepup", "dynamerge") to the app's
// BlogProgram enum. Anything unrecognized lands as 'general' — that keeps
// editors from blocking publish if they coin a new category we haven't
// taught the UI to handle.
function programFromCategorySlug(slug: string | undefined): BlogProgram {
  if (slug === 'stepup' || slug === 'stepup-scholars') return 'stepup';
  if (slug === 'dynamerge') return 'dynamerge';
  return 'general';
}

// Same for BlogTopic, derived from the post's tags array.
function topicFromTags(tags: string[] | undefined): BlogTopic {
  if (!tags || tags.length === 0) return 'stories';
  const norm = tags.map(t => t.toLowerCase());
  if (norm.includes('research')) return 'research';
  if (norm.includes('news')) return 'news';
  return 'stories';
}

// Heuristic: an event with "virtual"/"online"/"zoom" in its location string
// counts as virtual. The content model has no isVirtual flag, and asking
// editors to add one doubles the cognitive load when the location field
// already says it.
function inferIsVirtual(location: string | undefined): boolean {
  if (!location) return false;
  return /\b(virtual|online|zoom|remote)\b/i.test(location);
}

function mapBlogPost(
  entry: ContentfulEntry<BlogPostFields>,
  includes: ContentfulCollection<unknown>['includes']
): BlogPost {
  const f = entry.fields;
  const author = resolveLinkedEntry<AuthorFields>(f.author, includes);
  const category = resolveLinkedEntry<CategoryFields>(f.category, includes);
  return {
    slug: f.slug,
    title: f.title,
    dek: f.excerpt ?? '',
    hero: resolveAssetUrl(f.coverImage, includes) ?? '',
    body: f.content,
    program: programFromCategorySlug(category?.slug),
    topic: topicFromTags(f.tags),
    author: author?.name ?? 'STAIJA',
    publishedAt: f.publishDate ?? entry.sys.createdAt,
  };
}

function mapEvent(
  entry: ContentfulEntry<EventFields>,
  includes: ContentfulCollection<unknown>['includes']
): EventItem {
  const f = entry.fields;
  const location = f.location ?? 'TBD';
  return {
    slug: f.slug,
    title: f.title,
    dek: f.description ?? '',
    hero: resolveAssetUrl(f.coverImage, includes),
    datetime: f.startsAt,
    timezone: 'Africa/Lagos',
    location,
    isVirtual: inferIsVirtual(f.location),
    type: 'Event',
  };
}

// --- Public API --------------------------------------------------------

function isContentfulConfigured(): boolean {
  return !!getAppConfig().contentful;
}

export interface BlogQuery {
  program?: BlogProgram | 'all';
  topic?: BlogTopic | 'all';
  search?: string;
  limit?: number;
  skip?: number;
}

export async function getBlogPosts(
  q: BlogQuery = {}
): Promise<{ items: BlogPost[]; total: number }> {
  if (!isContentfulConfigured()) {
    return mockBlogResults(q);
  }

  const client = new ContentfulClient();
  // Over-fetch when filtering by program — that filter resolves through a
  // linked Category entry, which Contentful's query API can't filter on
  // directly without forcing editors to a single content type. Easier to
  // pull a wider page and post-filter in-process. The site's content
  // volume stays small enough that this is cheap.
  const programFilterActive = q.program && q.program !== 'all';
  const limit = q.limit ?? 9;
  const skip = q.skip ?? 0;
  const query: Record<string, string | number | boolean> = {
    content_type: 'blogPost',
    order: '-fields.publishDate',
    limit: programFilterActive ? Math.min(100, (limit + skip) * 3) : limit,
    skip: programFilterActive ? 0 : skip,
    include: 2,
  };
  // Topic maps to the post's `tags` array — Contentful supports `[in]`
  // operators on Symbol arrays, so this filter happens server-side.
  if (q.topic && q.topic !== 'all') query['fields.tags[in]'] = q.topic;
  if (q.search) query['query'] = q.search;

  try {
    const res = await client.getEntries<ContentfulCollection<BlogPostFields>>(query);
    let items = res.items.map(e => mapBlogPost(e, res.includes));
    let total = res.total;
    if (programFilterActive) {
      items = items.filter(p => p.program === q.program);
      total = items.length;
      items = items.slice(skip, skip + limit);
    }
    return { items, total };
  } catch (err) {
    if (isUnknownFieldOrType(err)) {
      console.warn('[content] Contentful blogPost model not ready — using mock data.', err);
      return mockBlogResults(q);
    }
    throw err;
  }
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  if (!isContentfulConfigured()) {
    return mockBlogPosts.find(p => p.slug === slug) ?? null;
  }

  const client = new ContentfulClient();
  try {
    const res = await client.getEntries<ContentfulCollection<BlogPostFields>>({
      content_type: 'blogPost',
      'fields.slug': slug,
      limit: 1,
      include: 2,
    });
    if (res.items.length === 0) return null;
    return mapBlogPost(res.items[0], res.includes);
  } catch (err) {
    if (isUnknownFieldOrType(err)) {
      console.warn('[content] Contentful blogPost model not ready — using mock data.', err);
      return mockBlogPosts.find(p => p.slug === slug) ?? null;
    }
    throw err;
  }
}

export async function getEvents(
  opts: { upcoming?: boolean; limit?: number } = {}
): Promise<EventItem[]> {
  if (!isContentfulConfigured()) {
    return mockEvents
      .filter(e => isUpcoming(e) === (opts.upcoming ?? true))
      .slice(0, opts.limit ?? 20);
  }

  const client = new ContentfulClient();
  const now = new Date().toISOString();
  const query: Record<string, string | number | boolean> = {
    content_type: 'event',
    order: opts.upcoming === false ? '-fields.startsAt' : 'fields.startsAt',
    limit: opts.limit ?? 20,
    include: 2,
  };
  if (opts.upcoming === true) query['fields.startsAt[gte]'] = now;
  if (opts.upcoming === false) query['fields.startsAt[lt]'] = now;

  try {
    const res = await client.getEntries<ContentfulCollection<EventFields>>(query);
    return res.items.map(e => mapEvent(e, res.includes));
  } catch (err) {
    if (isUnknownFieldOrType(err)) {
      console.warn('[content] Contentful event model not ready — using mock data.', err);
      return mockEvents
        .filter(e => isUpcoming(e) === (opts.upcoming ?? true))
        .slice(0, opts.limit ?? 20);
    }
    throw err;
  }
}

export async function getEvent(slug: string): Promise<EventItem | null> {
  if (!isContentfulConfigured()) {
    return mockEvents.find(e => e.slug === slug) ?? null;
  }

  const client = new ContentfulClient();
  try {
    const res = await client.getEntries<ContentfulCollection<EventFields>>({
      content_type: 'event',
      'fields.slug': slug,
      limit: 1,
      include: 2,
    });
    if (res.items.length === 0) return null;
    return mapEvent(res.items[0], res.includes);
  } catch (err) {
    if (isUnknownFieldOrType(err)) {
      console.warn('[content] Contentful event model not ready — using mock data.', err);
      return mockEvents.find(e => e.slug === slug) ?? null;
    }
    throw err;
  }
}

/**
 * Treat Contentful schema-mismatch errors (unknown content type, unknown field,
 * unknown sort attribute) as "model not ready yet" — fall back to mocks rather
 * than blocking the whole page. Other errors (auth, network, 5xx) still throw.
 */
function isUnknownFieldOrType(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message;
  return (
    m.includes('UnknownField') ||
    m.includes('UnknownContentType') ||
    m.includes('UnknownAttribute') ||
    m.includes('InvalidQuery')
  );
}

function isUpcoming(e: EventItem): boolean {
  return new Date(e.datetime).getTime() >= Date.now();
}

// --- Mock data (dev fallback) -----------------------------------------

const UNSPLASH = {
  lab: 'https://images.unsplash.com/photo-1758573467240-f944226c2026?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  student:
    'https://images.unsplash.com/photo-1625082361965-1139be607018?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  smile:
    'https://images.unsplash.com/photo-1658252844173-ba5de80a3015?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  desk: 'https://images.unsplash.com/photo-1737529807163-1d8a3fb6c403?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  laptop:
    'https://images.unsplash.com/photo-1620831468075-db24ca183258?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
};

const mockBlogPosts: BlogPost[] = Array.from({ length: 12 }).map((_, i) => ({
  slug: `post-${i}`,
  title: [
    'How to run a PCR test when the power goes out',
    'My journey from Kano to Cambridge',
    'Why pan-African science collaboration matters',
    'Meet the 2024 StepUp Scholars',
    'Designing low-cost lab equipment',
    'The ethics of global health research',
  ][i % 6],
  dek: 'A brief look into the creative problem solving required to do rigorous science in resource-constrained environments.',
  hero: [UNSPLASH.lab, UNSPLASH.student, UNSPLASH.smile, UNSPLASH.desk][i % 4],
  body: null,
  program: (['stepup', 'dynamerge', 'general'] as BlogProgram[])[i % 3],
  topic: (['research', 'stories', 'news'] as BlogTopic[])[i % 3],
  author: ['Chinedu Okafor', 'Amina Yusuf', 'Dr. Sarah Nwachukwu'][i % 3],
  publishedAt: new Date(Date.now() - i * 7 * 24 * 3600 * 1000).toISOString(),
  readingTime: '6 min read',
}));

const mockEvents: EventItem[] = [
  {
    slug: 'stepup-info-2025',
    title: 'Information Session: StepUp 2025',
    dek: 'Find out everything about the upcoming cohort.',
    datetime: '2026-10-12T16:00:00+01:00',
    timezone: 'Africa/Lagos',
    location: 'Virtual (Zoom)',
    isVirtual: true,
    type: 'Webinar',
  },
  {
    slug: 'alumni-symposium-2025',
    title: 'Alumni Research Symposium',
    dek: 'A day of presentations from past scholars.',
    datetime: '2026-10-24T10:00:00+01:00',
    timezone: 'Africa/Lagos',
    location: 'Lagos, Nigeria',
    isVirtual: false,
    type: 'In-person',
  },
  {
    slug: 'mentor-mixer-nov',
    title: 'Mentor Matching Mixer',
    dek: 'Meet your future mentor.',
    datetime: '2026-11-05T17:00:00+01:00',
    timezone: 'Africa/Lagos',
    location: 'Virtual',
    isVirtual: true,
    type: 'Networking',
  },
  {
    slug: 'dynamerge-demo-2024',
    title: 'Dynamerge Demo Day 2024',
    dek: 'Past cohort showcase.',
    datetime: '2024-08-15T15:00:00+01:00',
    timezone: 'Africa/Lagos',
    location: 'Virtual',
    isVirtual: true,
    type: 'Showcase',
  },
  {
    slug: 'lab-safety-2024',
    title: 'Lab Safety Certification Workshop',
    dek: 'Past workshop recap.',
    datetime: '2024-07-20T09:00:00+01:00',
    timezone: 'Africa/Lagos',
    location: 'Lagos, Nigeria',
    isVirtual: false,
    type: 'Workshop',
  },
];

function mockBlogResults(q: BlogQuery): { items: BlogPost[]; total: number } {
  let items = mockBlogPosts;
  if (q.program && q.program !== 'all') items = items.filter(p => p.program === q.program);
  if (q.topic && q.topic !== 'all') items = items.filter(p => p.topic === q.topic);
  if (q.search) {
    const needle = q.search.toLowerCase();
    items = items.filter(
      p =>
        p.title.toLowerCase().includes(needle) ||
        p.dek.toLowerCase().includes(needle) ||
        p.author.toLowerCase().includes(needle)
    );
  }
  const total = items.length;
  const skip = q.skip ?? 0;
  const limit = q.limit ?? 9;
  return { items: items.slice(skip, skip + limit), total };
}
