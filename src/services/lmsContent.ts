/**
 * Client-facing API for the admin LMS content surface. Every Contentful
 * Management API operation goes through the `lmsContentAdmin` Cloud
 * Function — the management token never reaches the browser bundle.
 *
 * Public exports (types and functions) are stable; previously this file
 * called Contentful directly via VITE_CONTENTFUL_MANAGEMENT_TOKEN. The
 * service-layer rewrite swapped internals for a callable while keeping
 * every signature identical, so admin views (CourseEdit, ModuleEdit,
 * LessonEdit, AssignmentEdit, ContentHome, etc.) didn't need changes.
 */

import { httpsCallable } from 'firebase/functions'
import { ref as storageRef, uploadBytes } from 'firebase/storage'
import { functions, storage, auth } from '../config/firebase.ts'
import { getAppConfig } from '../utils/env.ts'
import type { Document } from '@contentful/rich-text-types'

// ---------- Types ----------

export type LmsContentType = 'course' | 'module' | 'lesson' | 'assignmentSpec' | 'quiz'

export interface CourseFields {
  slug: string
  title: string
  program: 'stepup_scholars' | 'dynamerge'
  summary?: string
  modules?: string[] // Array of module entry IDs
  estimatedHours?: number
  track?: string
  published?: boolean
  version: string
  coverImage?: string // Asset entry ID
}

export interface ModuleFields {
  slug: string
  title: string
  summary?: string
  lessons?: string[]
  assignments?: string[]
  unlockRule?: 'sequential' | 'open'
}

export interface LessonFields {
  slug: string
  title: string
  body?: Document // Contentful RichText document
  videoUrl?: string
  attachments?: string[] // Asset entry IDs
  estimatedMinutes?: number
  completionCriteria?: 'viewed' | 'assignment_submitted' | 'quiz_passed'
  quiz?: string // Quiz entry ID
}

export interface QuizFields {
  slug: string
  title: string
  summary?: string
  passThresholdPercent?: number
  questions: {
    id: string
    questionText: string
    options: { id: string; text: string }[]
    correctOptionId: string
    explanation?: string
  }[]
}

export interface AssignmentSpecFields {
  slug: string
  title: string
  instructions?: Document
  submissionType: 'text' | 'file' | 'link' | 'text_or_file'
  maxFileSizeMb?: number
  acceptedFileTypes?: string[]
  dueOffsetDays?: number
}

export type LmsFields =
  | { type: 'course'; fields: CourseFields }
  | { type: 'module'; fields: ModuleFields }
  | { type: 'lesson'; fields: LessonFields }
  | { type: 'assignmentSpec'; fields: AssignmentSpecFields }
  | { type: 'quiz'; fields: QuizFields }

// Lightweight summary used by list views.
export interface EntrySummary {
  id: string
  contentType: LmsContentType
  fields: Record<string, unknown>
  publishedAt: string | null
  updatedAt: string
  isPublished: boolean
  isDraft: boolean
}

// ---------- Callable proxy ----------
//
// All management writes/reads route through the lmsContentAdmin Cloud
// Function. The server validates the request, reads
// CONTENTFUL_MANAGEMENT_TOKEN from Secret Manager, and proxies to the
// Contentful Management API. The token never reaches the browser.

interface AdminRequestList {
  action: 'list'
  type: LmsContentType
  limit?: number
  skip?: number
  query?: string
  ids?: string[]
  fieldEquals?: { name: string; value: string }
}
type AdminRequest =
  | AdminRequestList
  | { action: 'get'; id: string }
  | { action: 'create'; payload: LmsFields }
  | { action: 'update'; id: string; payload: LmsFields }
  | { action: 'publish'; id: string }
  | { action: 'unpublish'; id: string }
  | { action: 'delete'; id: string }

async function callAdmin<T>(request: AdminRequest): Promise<T> {
  const cfg = getAppConfig()
  const envId = cfg.contentful?.environmentId
  const fn = httpsCallable<{ env?: string; request: AdminRequest }, T>(
    functions,
    'lmsContentAdmin',
  )
  const result = await fn({ env: envId, request })
  return result.data
}

// ---------- CRUD ----------

export async function listEntries(
  type: LmsContentType,
  opts?: { limit?: number; skip?: number; query?: string },
): Promise<EntrySummary[]> {
  return callAdmin<EntrySummary[]>({
    action: 'list',
    type,
    limit: opts?.limit,
    skip: opts?.skip,
    query: opts?.query,
  })
}

export async function getEntry(id: string): Promise<EntrySummary> {
  return callAdmin<EntrySummary>({ action: 'get', id })
}

export async function createEntry(payload: LmsFields): Promise<EntrySummary> {
  return callAdmin<EntrySummary>({ action: 'create', payload })
}

export async function updateEntry(id: string, payload: LmsFields): Promise<EntrySummary> {
  return callAdmin<EntrySummary>({ action: 'update', id, payload })
}

export async function publishEntry(id: string): Promise<EntrySummary> {
  return callAdmin<EntrySummary>({ action: 'publish', id })
}

export async function unpublishEntry(id: string): Promise<EntrySummary> {
  return callAdmin<EntrySummary>({ action: 'unpublish', id })
}

export async function deleteEntry(id: string): Promise<void> {
  await callAdmin<{ ok: true }>({ action: 'delete', id })
}

// ---------- Smart-form helpers (pure, no network) ----------

/**
 * Convert any string into a kebab-case slug. Strips diacritics, drops
 * non-alphanumerics, collapses runs of '-'. Used to derive a slug from
 * a course/module/lesson title until the editor types into the slug
 * field directly.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Normalize an editor-provided slug to the canonical form. Same rules
 * as slugify() — kept as a separate export so the call sites read as
 * "I'm cleaning a slug the user typed" instead of "I'm deriving a slug
 * from a title".
 */
export function normalizeSlug(input: string | undefined | null): string {
  if (!input) return ''
  return slugify(input)
}

/**
 * Identify which video host a lesson's URL points at. Used by
 * LessonEdit to show a live "what we detected" hint, and by
 * LessonView to convert watch-page URLs into embed URLs.
 */
export type VideoProvider = 'youtube' | 'vimeo' | 'other' | 'invalid'
export function detectVideoProvider(input: string | undefined | null): VideoProvider | null {
  const raw = (input ?? '').trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.hostname.includes('youtube.com') || u.hostname === 'youtu.be') return 'youtube'
    if (u.hostname.includes('vimeo.com')) return 'vimeo'
    return 'other'
  } catch {
    return 'invalid'
  }
}

const TERM_BY_MONTH = [
  'spring','spring','spring','spring',
  'summer','summer','summer','summer',
  'fall','fall','fall','fall',
] as const

/**
 * Best-guess "current term version" for a fresh course. Maps month
 * ranges Jan-Apr → spring, May-Aug → summer, Sep-Dec → fall. Returns
 * a canonical "{year}-{term}" string ready to drop into the version
 * field.
 */
export function currentTermVersion(date: Date = new Date()): string {
  const year = date.getFullYear()
  const term = TERM_BY_MONTH[date.getMonth()]
  return `${year}-${term}`
}

/**
 * Normalize free-form version input to canonical "{year}-{term}".
 * Accepts "Spring 2026", "spring 2026", "2026 Spring", "2026-Spring",
 * "2026-spring" and similar. Returns the input lowercased if it
 * doesn't include both a year and a known term.
 */
export function normalizeVersion(input: string): string {
  const raw = input.trim()
  if (!raw) return raw
  const yearMatch = raw.match(/(\d{4})/)
  const termMatch = raw.toLowerCase().match(/(spring|summer|fall|autumn|winter)/)
  if (!yearMatch || !termMatch) return raw.toLowerCase()
  const term = termMatch[1] === 'autumn' ? 'fall' : termMatch[1]
  return `${yearMatch[1]}-${term}`
}

/** Year-bump a version string for the duplicate flow: "2025-spring"
 * becomes "2026-spring". Falls back to the current term if the input
 * doesn't look like a "{year}-{term}" string. */
function bumpVersion(v: string): string {
  const m = v.match(/^(\d{4})-(.+)$/)
  if (!m) return currentTermVersion()
  const year = parseInt(m[1], 10)
  if (Number.isNaN(year)) return currentTermVersion()
  return `${year + 1}-${m[2]}`
}

// ---------- Derived reads ----------

export interface ComputedHours {
  minutes: number
  hours: number
  lessonCount: number
  moduleCount: number
}

/**
 * Sum estimatedMinutes across all lessons inside the given modules.
 * Two callable round-trips: modules (to read their lesson references),
 * then lessons. `hours` is rounded to one decimal place — readers
 * shouldn't see "12.3333..." in the UI.
 */
export async function computeCourseEstimatedHours(moduleIds: string[]): Promise<ComputedHours> {
  if (!moduleIds.length) return { minutes: 0, hours: 0, lessonCount: 0, moduleCount: 0 }
  const modules = await callAdmin<EntrySummary[]>({
    action: 'list',
    type: 'module',
    ids: moduleIds,
    limit: 100,
  })
  const lessonIds = modules.flatMap((m) => {
    const lessonsField = (m.fields as Record<string, unknown>).lessons
    if (!Array.isArray(lessonsField)) return []
    return lessonsField
      .map((l) => (l as { sys?: { id?: string } })?.sys?.id)
      .filter((v): v is string => !!v)
  })
  if (!lessonIds.length) {
    return { minutes: 0, hours: 0, lessonCount: 0, moduleCount: modules.length }
  }
  const lessons = await callAdmin<EntrySummary[]>({
    action: 'list',
    type: 'lesson',
    ids: lessonIds,
    limit: 200,
  })
  const minutes = lessons.reduce((sum, l) => {
    const m = (l.fields as Record<string, unknown>).estimatedMinutes
    return sum + (typeof m === 'number' ? m : 0)
  }, 0)
  return {
    minutes,
    hours: Math.round((minutes / 60) * 10) / 10,
    lessonCount: lessons.length,
    moduleCount: modules.length,
  }
}

/**
 * Distinct, non-empty `track` values across all courses in a program.
 * Used to populate chip-autocomplete suggestions on the course form so
 * editors reuse existing tracks instead of inventing new ones.
 */
export async function listTracksForProgram(
  program: 'stepup_scholars' | 'dynamerge',
): Promise<string[]> {
  const courses = await callAdmin<EntrySummary[]>({
    action: 'list',
    type: 'course',
    fieldEquals: { name: 'program', value: program },
    limit: 200,
  })
  const set = new Set<string>()
  for (const c of courses) {
    const t = (c.fields as Record<string, unknown>).track
    if (typeof t === 'string' && t.trim()) set.add(t.trim())
  }
  return Array.from(set).sort()
}

/**
 * Build a draft `CourseFields` object from an existing course, ready
 * to feed into a fresh form. Modules are kept by reference (linked,
 * not deep-copied) so the new term reuses the same curriculum nodes.
 * `published` is forced false so duplicates always start as drafts.
 */
export async function buildDuplicateCourseFields(sourceId: string): Promise<CourseFields> {
  const source = await getEntry(sourceId)
  const f = source.fields
  const sourceSlug = typeof f.slug === 'string' ? f.slug : ''
  const sourceVersion = typeof f.version === 'string' ? f.version : ''
  return {
    slug: sourceSlug ? normalizeSlug(`${sourceSlug}-copy`) : '',
    title: typeof f.title === 'string' ? f.title : '',
    program: ((f.program as 'stepup_scholars' | 'dynamerge') ?? 'stepup_scholars'),
    summary: typeof f.summary === 'string' ? f.summary : '',
    modules: extractRefIds(f.modules),
    estimatedHours: typeof f.estimatedHours === 'number' ? f.estimatedHours : undefined,
    track: typeof f.track === 'string' ? f.track : '',
    published: false,
    version: bumpVersion(sourceVersion),
    coverImage: extractRefId(f.coverImage),
  }
}

function extractRefIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (v as { sys?: { id?: string } })?.sys?.id)
    .filter((v): v is string => !!v)
}
function extractRefId(value: unknown): string | undefined {
  return (value as { sys?: { id?: string } })?.sys?.id
}

// ---------- Asset upload ----------
//
// Two-step: stage the binary in Firebase Storage at cms/<uid>/..., then
// call the lmsAssetUpload Cloud Function which downloads it, creates +
// publishes a Contentful Asset, and cleans up the staging file. Going
// through Storage means the client never holds the Contentful
// Management token, and Firebase auth + storage.rules enforce who can
// stage what.

export interface UploadAssetResult {
  id: string
  url: string
  fileName: string
  contentType: string
}

interface AssetUploadInput {
  storagePath: string
  fileName: string
  contentType: string
  title?: string
  env?: string
}

function safeFileName(name: string): string {
  // Match the convention used by application submissions — keep only
  // characters that are safe in URL path segments.
  return name.replace(/[^A-Za-z0-9_.-]/g, '_')
}

export async function uploadAsset(file: File, title?: string): Promise<UploadAssetResult> {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Must be signed in to upload assets.')
  }
  const cfg = getAppConfig()
  const stagingPath = `cms/${user.uid}/${Date.now()}-${safeFileName(file.name)}`

  // Stage in Storage. Firebase Auth covers the upload; storage.rules
  // gates the path to staff/admin role + a size cap.
  const ref = storageRef(storage, stagingPath)
  await uploadBytes(ref, file, {
    contentType: file.type || 'application/octet-stream',
  })

  // Ask the function to copy it into Contentful.
  const call = httpsCallable<AssetUploadInput, UploadAssetResult>(functions, 'lmsAssetUpload')
  const result = await call({
    storagePath: stagingPath,
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    title,
    env: cfg.contentful?.environmentId,
  })
  return result.data
}
