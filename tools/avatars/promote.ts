/** Promote one validated, current static avatar candidate. */
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Jimp } from 'jimp'
import { buildPartsTs } from './clean.ts'
import { compositeManifest } from './composite.ts'
import { AVATAR_CANVAS_SIZE, AVATAR_SLOT_COUNT, type AvatarSlotManifest } from './contracts.ts'
import { buildLottieDocumentForManifest } from './lottie-rig.ts'
import { validateLottieDocument } from './lottie-validate.ts'
import { AVATAR_MANIFESTS } from './manifests.ts'
import { sha256 } from './trace.ts'
import { validateSvg } from './verify.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const REQUIRED_PROFILE = 'poster-cutout-detail'
const REQUIRED_ENGINE = 'vtracer'

interface CandidateMetadata {
  readonly engine: string
  readonly profile: string
  readonly inputs: Record<string, string>
}

export interface PromotionPaths {
  readonly root: string
  readonly compositedDir: string
  readonly tracedDir: string
  readonly cleanDir: string
  readonly partsPath: string
}

export interface PromotionOptions {
  readonly apply?: boolean
  readonly manifests?: readonly AvatarSlotManifest[]
  readonly paths?: Partial<PromotionPaths>
}

export interface PromotionResult {
  readonly applied: boolean
  readonly composites: Readonly<Record<string, string>>
  readonly lotties: Readonly<Record<string, string>>
  readonly partsSha256: string
}

function defaultPaths(root: string): PromotionPaths {
  return {
    root,
    compositedDir: join(root, 'tools/avatars/composited'),
    tracedDir: join(root, 'tools/avatars/candidate-traced'),
    cleanDir: join(root, 'tools/avatars/candidate-clean'),
    partsPath: join(root, 'tools/avatars/candidate-parts.ts'),
  }
}

function resolvePaths(overrides: Partial<PromotionPaths> | undefined): PromotionPaths {
  const root = resolve(overrides?.root ?? ROOT)
  return { ...defaultPaths(root), ...overrides, root }
}

function assertInsideRoot(root: string, target: string): string {
  const resolved = resolve(target)
  if (resolved !== root && !resolved.startsWith(`${root}/`)) throw new Error(`Path escapes repository root: ${target}`)
  return resolved
}

function expectedNames(manifests: readonly AvatarSlotManifest[]): string[] {
  if (manifests.length !== AVATAR_SLOT_COUNT) throw new Error(`Expected exactly ${AVATAR_SLOT_COUNT} avatar manifests`)
  const slots = manifests.map(({ slot }) => slot).sort((a, b) => a - b)
  if (slots.some((slot, index) => slot !== index)) throw new Error('Avatar manifests must cover slots 0 through 9 exactly once')
  const names = manifests.map(({ name }) => name)
  if (new Set(names).size !== AVATAR_SLOT_COUNT) throw new Error('Avatar manifests must have unique names')
  return names
}

async function readMetadata(path: string): Promise<CandidateMetadata> {
  let parsed: unknown
  try { parsed = JSON.parse(await readFile(path, 'utf8')) } catch { throw new Error(`Candidate metadata is unreadable: ${path}`) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Candidate metadata must be an object')
  const metadata = parsed as Partial<CandidateMetadata>
  if (metadata.engine !== REQUIRED_ENGINE) throw new Error(`Candidate engine must be ${REQUIRED_ENGINE}`)
  if (metadata.profile !== REQUIRED_PROFILE) throw new Error(`Candidate profile must be ${REQUIRED_PROFILE}`)
  if (!metadata.inputs || typeof metadata.inputs !== 'object' || Array.isArray(metadata.inputs)) throw new Error('Candidate metadata must include input hashes')
  return metadata as CandidateMetadata
}

async function exactFiles(directory: string, extension: string, names: readonly string[]): Promise<void> {
  let entries: string[]
  try { entries = await readdir(directory) } catch { throw new Error(`Candidate directory is missing: ${directory}`) }
  const found = entries.filter((entry) => entry.endsWith(extension)).map((entry) => entry.slice(0, -extension.length)).sort()
  const expected = [...names].sort()
  if (found.length !== expected.length || found.some((name, index) => name !== expected[index])) {
    throw new Error(`Candidate ${extension} files must match all ten manifest names exactly`)
  }
}

async function validatePng(path: string, name: string): Promise<Buffer> {
  const bytes = await readFile(path)
  let image: Jimp
  try { image = await Jimp.read(bytes) } catch { throw new Error(`${name}: candidate composite is not a readable PNG`) }
  if (image.width !== AVATAR_CANVAS_SIZE || image.height !== AVATAR_CANVAS_SIZE) throw new Error(`${name}: candidate composite must be 256x256`)
  return bytes
}

function innerSvg(svg: string, name: string, requireUnitViewBox = true): string {
  const validation = validateSvg(svg, { requireUnitViewBox })
  if (!validation.valid) throw new Error(`${name}: cleaned SVG is invalid: ${validation.errors.join('; ')}`)
  const match = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>\s*$/)
  if (!match?.[1]) throw new Error(`${name}: cleaned SVG has no inner content`)
  return match[1]
}

async function currentCompositeHashes(
  manifests: readonly AvatarSlotManifest[],
  root: string,
): Promise<Record<string, string>> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'staija-avatar-promote-'))
  try {
    const hashes: Record<string, string> = {}
    for (const manifest of manifests) {
      const outputPath = join(temporaryRoot, `${manifest.name}.png`)
      const result = await compositeManifest(manifest, root, { slot: manifest.slot, outputPath, force: true })
      hashes[manifest.name] = result.sha256
    }
    return hashes
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

export async function validateAvatarCandidate(options: Omit<PromotionOptions, 'apply'> = {}): Promise<PromotionResult> {
  const manifests = options.manifests ?? AVATAR_MANIFESTS
  const paths = resolvePaths(options.paths)
  const names = expectedNames(manifests)
  await exactFiles(paths.compositedDir, '.png', names)
  await exactFiles(paths.tracedDir, '.svg', names)
  await exactFiles(paths.cleanDir, '.svg', names)
  const tracedMetadata = await readMetadata(join(paths.tracedDir, 'metadata.json'))
  const cleanMetadata = await readMetadata(join(paths.cleanDir, 'metadata.json'))
  if (JSON.stringify(cleanMetadata) !== JSON.stringify(tracedMetadata)) throw new Error('Candidate traced and cleaned metadata must match')

  const actualHashes: Record<string, string> = {}
  const cleaned = new Map<string, string>()
  for (const manifest of manifests) {
    const composite = await validatePng(join(paths.compositedDir, `${manifest.name}.png`), manifest.name)
    const hash = sha256(composite)
    if (tracedMetadata.inputs[manifest.name] !== hash) throw new Error(`${manifest.name}: candidate metadata input hash does not match composite`)
    actualHashes[manifest.name] = hash
    const traced = await readFile(join(paths.tracedDir, `${manifest.name}.svg`), 'utf8')
    const cleanedSvg = await readFile(join(paths.cleanDir, `${manifest.name}.svg`), 'utf8')
    innerSvg(traced, manifest.name, false)
    cleaned.set(manifest.name, innerSvg(cleanedSvg, manifest.name))
  }
  const expectedParts = buildPartsTs(cleaned)
  const candidateParts = await readFile(paths.partsPath, 'utf8').catch(() => { throw new Error(`Candidate parts file is missing: ${paths.partsPath}`) })
  if (candidateParts !== expectedParts) throw new Error('Candidate parts do not match cleaned SVGs')

  const freshHashes = await currentCompositeHashes(manifests, paths.root)
  for (const name of names) {
    if (freshHashes[name] !== actualHashes[name]) throw new Error(`${name}: candidate composite is stale relative to current source layers`)
  }

  const lotties: Record<string, string> = {}
  for (const manifest of manifests) {
    const document = await buildLottieDocumentForManifest(manifest, paths.root)
    const validation = validateLottieDocument(document, { slot: manifest.slot, manifest })
    if (!validation.valid) throw new Error(`Slot ${manifest.slot}: generated Lottie is invalid: ${validation.errors.join('; ')}`)
    lotties[manifest.name] = sha256(JSON.stringify(document))
  }
  return { applied: false, composites: actualHashes, lotties, partsSha256: sha256(candidateParts) }
}

async function writeTemporary(destination: string, contents: Uint8Array | string): Promise<string> {
  await mkdir(dirname(destination), { recursive: true })
  const temporary = join(dirname(destination), `.${relative(dirname(destination), destination)}.${randomUUID()}.tmp`)
  await writeFile(temporary, contents)
  return temporary
}

export async function promoteAvatarCandidate(options: PromotionOptions = {}): Promise<PromotionResult> {
  const paths = resolvePaths(options.paths)
  const manifests = options.manifests ?? AVATAR_MANIFESTS
  const validation = await validateAvatarCandidate({ manifests, paths })
  if (!options.apply) return validation

  const temporaryWrites: Array<{ temporary: string; destination: string }> = []
  try {
    for (const manifest of manifests) {
      const candidate = await readFile(join(paths.compositedDir, `${manifest.name}.png`))
      const destination = assertInsideRoot(paths.root, join(paths.root, manifest.staticOutput))
      temporaryWrites.push({ temporary: await writeTemporary(destination, candidate), destination })
    }
    const partsDestination = assertInsideRoot(paths.root, join(paths.root, 'src/services/avatar/parts.ts'))
    temporaryWrites.push({ temporary: await writeTemporary(partsDestination, await readFile(paths.partsPath)), destination: partsDestination })
    for (const manifest of manifests) {
      const document = await buildLottieDocumentForManifest(manifest, paths.root)
      const lottieValidation = validateLottieDocument(document, { slot: manifest.slot, manifest })
      if (!lottieValidation.valid) throw new Error(`Slot ${manifest.slot}: generated Lottie is invalid: ${lottieValidation.errors.join('; ')}`)
      const destination = assertInsideRoot(paths.root, join(paths.root, manifest.lottieOutput))
      temporaryWrites.push({ temporary: await writeTemporary(destination, JSON.stringify(document)), destination })
    }
    await Promise.all(temporaryWrites.map(({ temporary, destination }) => rename(temporary, destination)))
  } catch (error) {
    await Promise.all(temporaryWrites.map(({ temporary }) => rm(temporary, { force: true })))
    throw error
  }
  return { ...validation, applied: true }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.some((arg) => arg !== '--apply')) throw new Error('Usage: tsx tools/avatars/promote.ts [--apply]')
  const result = await promoteAvatarCandidate({ apply: argv.includes('--apply') })
  console.log(`${result.applied ? 'Promoted' : 'Validated'} ${Object.keys(result.composites).length} avatar candidates.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
