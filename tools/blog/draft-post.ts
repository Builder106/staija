/**
 * Blog post loader.
 *
 * Turns a Markdown file into a Contentful `blogPost` entry. The entry is
 * saved as a draft unless you pass --publish, so an editor can add a
 * cover image and read it in the web app before it goes live. Running
 * it again with the same slug updates the existing entry.
 *
 * Usage:
 *   npm run blog:draft -- tools/blog/posts/<slug>.md --dry-run
 *   npm run blog:draft -- tools/blog/posts/<slug>.md
 *   npm run blog:draft -- tools/blog/posts/<slug>.md --publish
 *
 * The file opens with a front-matter block of `key: value` lines:
 * title, slug, excerpt, author, category, tags (comma-separated), and
 * an optional publishDate (YYYY-MM-DD, default today). The body supports
 * what the blog renderer styles: `## ` headings, paragraphs, `- ` lists,
 * and [text](url) links, with a blank line between blocks. Anything else
 * fails loudly instead of being dropped.
 *
 * Author and category entries are matched by exact name and created
 * when missing. Match by name, not slug: the existing "StepUp Scholars"
 * category uses the slug `stepup`, so a derived slug would duplicate it.
 * Uses the same env vars and master guard as tools/lms-seed.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

import { readFileSync } from 'node:fs'
import type { EntryProps, PlainClientAPI } from 'contentful-management'
import { BLOCKS, INLINES } from '@contentful/rich-text-types'
import type {
  Document,
  Hyperlink,
  Paragraph,
  Text,
  TopLevelBlock,
} from '@contentful/rich-text-types'
import { createPlainClient, requireContentfulConfig } from '../lms-seed/contentful-client.ts'

const LOCALE = 'en-US'

interface Post {
  title: string
  slug: string
  excerpt: string
  author: string
  category: string
  tags: string[]
  publishDate: string
  body: Document
}

// ---------- Markdown ----------

function parsePost(source: string): Post {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
  if (!match) throw new Error('Post must start with a --- front-matter block.')
  const meta = new Map<string, string>()
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':')
    if (sep > 0) meta.set(line.slice(0, sep).trim(), line.slice(sep + 1).trim())
  }
  const need = (key: string): string => {
    const value = meta.get(key)
    if (!value) throw new Error(`Front matter is missing "${key}".`)
    return value
  }
  return {
    title: need('title'),
    slug: need('slug'),
    excerpt: need('excerpt'),
    author: need('author'),
    category: need('category'),
    tags: (meta.get('tags') ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    publishDate: meta.get('publishDate') ?? new Date().toISOString().slice(0, 10),
    body: toRichText(match[2]),
  }
}

function text(value: string): Text {
  return { nodeType: 'text', value, marks: [], data: {} }
}

// Inline content for one block: plain text with [label](uri) links.
// Contentful's own editor keeps a text node on both sides of a link, so
// this does too.
function inline(source: string): Paragraph['content'] {
  const out: Array<Text | Hyperlink> = []
  let last = 0
  for (const m of source.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    out.push(text(source.slice(last, m.index)))
    out.push({ nodeType: INLINES.HYPERLINK, data: { uri: m[2] }, content: [text(m[1])] })
    last = m.index + m[0].length
  }
  out.push(text(source.slice(last)))
  return out
}

function paragraph(source: string): Paragraph {
  return { nodeType: BLOCKS.PARAGRAPH, data: {}, content: inline(source) }
}

function toRichText(markdown: string): Document {
  const content: TopLevelBlock[] = []
  for (const chunk of markdown.trim().split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trim())
    if (lines.length === 1 && lines[0].startsWith('## ')) {
      content.push({ nodeType: BLOCKS.HEADING_2, data: {}, content: inline(lines[0].slice(3)) })
    } else if (lines.every((l) => l.startsWith('- '))) {
      content.push({
        nodeType: BLOCKS.UL_LIST,
        data: {},
        content: lines.map((l) => ({
          nodeType: BLOCKS.LIST_ITEM,
          data: {},
          content: [paragraph(l.slice(2))],
        })),
      })
    } else if (lines.some((l) => /^(#|- |\d+\. |> )/.test(l))) {
      throw new Error(`Unsupported Markdown, or a block missing its blank line:\n${chunk}`)
    } else {
      content.push(paragraph(lines.join(' ')))
    }
  }
  return { nodeType: BLOCKS.DOCUMENT, data: {}, content }
}

// ---------- Contentful ----------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function findByField(
  client: PlainClientAPI,
  contentTypeId: string,
  field: 'name' | 'slug',
  value: string,
): Promise<EntryProps | undefined> {
  const res = await client.entry.getMany({
    query: { content_type: contentTypeId, [`fields.${field}`]: value, limit: 1 },
  })
  return res.items[0]
}

async function ensureNamedEntry(
  client: PlainClientAPI,
  contentTypeId: 'author' | 'category',
  name: string,
  opts: { dryRun: boolean; publish: boolean },
): Promise<string> {
  const existing = await findByField(client, contentTypeId, 'name', name)
  if (existing) {
    console.log(`  ${contentTypeId} "${name}": found ${existing.sys.id}`)
    return existing.sys.id
  }
  const slug = slugify(name)
  if (opts.dryRun) {
    console.log(`  ${contentTypeId} "${name}": would create with slug ${slug}`)
    return `(new ${contentTypeId})`
  }
  let entry = await client.entry.create(
    { contentTypeId },
    { fields: { name: { [LOCALE]: name }, slug: { [LOCALE]: slug } } },
  )
  if (opts.publish) entry = await client.entry.publish({ entryId: entry.sys.id }, entry)
  console.log(`  ${contentTypeId} "${name}": created ${entry.sys.id}`)
  return entry.sys.id
}

function link(id: string): { sys: { type: 'Link'; linkType: 'Entry'; id: string } } {
  return { sys: { type: 'Link', linkType: 'Entry', id } }
}

async function writePost(post: Post, opts: { dryRun: boolean; publish: boolean }) {
  const client = createPlainClient(requireContentfulConfig())
  const authorId = await ensureNamedEntry(client, 'author', post.author, opts)
  const categoryId = await ensureNamedEntry(client, 'category', post.category, opts)

  const existing = await findByField(client, 'blogPost', 'slug', post.slug)
  console.log(
    `  blogPost "${post.slug}": ${existing ? `update ${existing.sys.id}` : 'create'}, ` +
      `${post.body.content.length} blocks`,
  )
  if (opts.dryRun) return

  const fields: EntryProps['fields'] = {
    title: { [LOCALE]: post.title },
    slug: { [LOCALE]: post.slug },
    excerpt: { [LOCALE]: post.excerpt },
    content: { [LOCALE]: post.body },
    author: { [LOCALE]: link(authorId) },
    category: { [LOCALE]: link(categoryId) },
    tags: { [LOCALE]: post.tags },
    publishDate: { [LOCALE]: post.publishDate },
    status: { [LOCALE]: opts.publish ? 'published' : 'draft' },
  }
  let entry = existing
    ? await client.entry.update(
        { entryId: existing.sys.id },
        { ...existing, fields: { ...existing.fields, ...fields } },
      )
    : await client.entry.create({ contentTypeId: 'blogPost' }, { fields })
  if (opts.publish) entry = await client.entry.publish({ entryId: entry.sys.id }, entry)
  console.log(`  blogPost "${post.slug}": ${opts.publish ? 'published' : 'saved as draft'} ${entry.sys.id}`)
}

async function main() {
  const args = process.argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) {
    console.log('Usage: tsx tools/blog/draft-post.ts <post.md> [--dry-run] [--publish] [--force]')
    process.exitCode = 1
    return
  }
  const opts = { dryRun: args.includes('--dry-run'), publish: args.includes('--publish') }
  const envId = process.env.VITE_CONTENTFUL_ENV_ID
  if (envId === 'master' && !opts.dryRun && !args.includes('--force')) {
    console.error(
      `Refusing to write to the 'master' Contentful environment.\n` +
        `Point VITE_CONTENTFUL_ENV_ID at staging, or pass --force if you mean master.`,
    )
    process.exitCode = 1
    return
  }
  const post = parsePost(readFileSync(file, 'utf8'))
  console.log(`Contentful environment: ${envId}${opts.dryRun ? ' (dry run)' : ''}`)
  await writePost(post, opts)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
