import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Jimp } from 'jimp'
import { AVATAR_CANVAS_SIZE, type AvatarSlot } from './contracts.ts'
import { AVATAR_MANIFESTS } from './manifests.ts'

export const REVIEW_SIZES = [32, 56, 80, 120, 256] as const

export interface AvatarReviewOptions {
  readonly baselineDir: string
  readonly candidateDir: string
  readonly outputDir: string
  readonly sizes?: readonly number[]
}

export interface AvatarReviewSlot {
  readonly slot: AvatarSlot
  readonly name: string
  readonly baselineSha256: string
  readonly candidateSha256: string
}

export interface AvatarReviewSheet {
  readonly size: number
  readonly path: string
  readonly sha256: string
}

export interface AvatarReviewManifest {
  readonly schemaVersion: 1
  readonly sizes: readonly number[]
  readonly slots: readonly AvatarReviewSlot[]
  readonly sheets: readonly AvatarReviewSheet[]
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function isInside(parent: string, child: string): boolean {
  const relation = relative(parent, child)
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))
}

function validateSizes(sizes: readonly number[]): void {
  if (!sizes.length || sizes.some((size) => !Number.isInteger(size) || size <= 0)) {
    throw new Error('Review sizes must be positive integers')
  }
  if (new Set(sizes).size !== sizes.length) throw new Error('Review sizes must be unique')
}

function assertSafeOutputDirectory(options: AvatarReviewOptions): void {
  const outputDir = resolve(options.outputDir)
  if (isInside(resolve(options.baselineDir), outputDir) || isInside(resolve(options.candidateDir), outputDir)) {
    throw new Error('Review output directory must not be inside the baseline or candidate directories')
  }
}

async function readPng(path: string, label: string): Promise<{ image: Jimp; bytes: Buffer }> {
  let bytes: Buffer
  try {
    bytes = await readFile(path)
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }

  try {
    const image = await Jimp.read(bytes)
    if (image.width !== AVATAR_CANVAS_SIZE || image.height !== AVATAR_CANVAS_SIZE) {
      throw new Error(`must be ${AVATAR_CANVAS_SIZE}x${AVATAR_CANVAS_SIZE}, received ${image.width}x${image.height}`)
    }
    return { image, bytes }
  } catch (error) {
    throw new Error(`Invalid ${label}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

async function loadSlots(options: AvatarReviewOptions): Promise<Array<AvatarReviewSlot & { baseline: Jimp; candidate: Jimp }>> {
  const slots: Array<AvatarReviewSlot & { baseline: Jimp; candidate: Jimp }> = []
  for (const manifest of AVATAR_MANIFESTS) {
    const baselinePath = join(options.baselineDir, `portrait-${manifest.slot}.png`)
    const candidatePath = join(options.candidateDir, `${manifest.name}.png`)
    const [baseline, candidate] = await Promise.all([
      readPng(baselinePath, `baseline slot ${manifest.slot}`),
      readPng(candidatePath, `candidate slot ${manifest.slot}`),
    ])
    slots.push({
      slot: manifest.slot,
      name: manifest.name,
      baselineSha256: sha256(baseline.bytes),
      candidateSha256: sha256(candidate.bytes),
      baseline: baseline.image,
      candidate: candidate.image,
    })
  }
  return slots
}

async function writeSheet(outputDir: string, size: number, slots: readonly (AvatarReviewSlot & { baseline: Jimp; candidate: Jimp })[]): Promise<AvatarReviewSheet> {
  const sheet = new Jimp({ width: size * 2, height: size * slots.length, color: 0x00000000 })
  for (const [index, slot] of slots.entries()) {
    const baseline = slot.baseline.clone().resize({ w: size, h: size })
    const candidate = slot.candidate.clone().resize({ w: size, h: size })
    sheet.composite(baseline, 0, index * size)
    sheet.composite(candidate, size, index * size)
  }
  const bytes = await sheet.getBuffer('image/png')
  const path = join(outputDir, `avatar-review-${size}.png`)
  await writeFile(path, bytes)
  return { size, path, sha256: sha256(bytes) }
}

export async function createAvatarReview(options: AvatarReviewOptions): Promise<AvatarReviewManifest> {
  const sizes = options.sizes ?? REVIEW_SIZES
  validateSizes(sizes)
  assertSafeOutputDirectory(options)
  const outputDir = resolve(options.outputDir)
  const slots = await loadSlots(options)
  await mkdir(outputDir, { recursive: true })
  const sheets = []
  for (const size of sizes) sheets.push(await writeSheet(outputDir, size, slots))
  const manifest: AvatarReviewManifest = {
    schemaVersion: 1,
    sizes: [...sizes],
    slots: slots.map(({ baseline: _baseline, candidate: _candidate, ...slot }) => slot),
    sheets,
  }
  await writeFile(join(outputDir, 'avatar-review-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

function value(argv: readonly string[], flag: string): string {
  const index = argv.indexOf(flag)
  const result = index === -1 ? undefined : argv[index + 1]
  if (!result) throw new Error(`${flag} requires a value`)
  return result
}

function parseSizes(value: string | undefined): readonly number[] {
  if (!value) return REVIEW_SIZES
  return value.split(',').map((item) => Number(item.trim()))
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const manifest = await createAvatarReview({
    baselineDir: resolve(value(argv, '--baseline-dir')),
    candidateDir: resolve(value(argv, '--candidate-dir')),
    outputDir: resolve(value(argv, '--output-dir')),
    sizes: parseSizes(argv.includes('--sizes') ? value(argv, '--sizes') : undefined),
  })
  console.log(`Wrote ${manifest.sheets.length} review sheets for ${manifest.slots.length} avatar slots.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
