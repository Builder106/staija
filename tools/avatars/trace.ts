/**
 * Convert generated raster portraits to SVG with VTracer.
 *
 * Usage:
 *   npm run avatars:trace -- --all
 *   npm run avatars:trace -- --slot 6 --profile poster-cutout
 *   npm run avatars:trace -- --all --force --output-dir /tmp/traced
 */

import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { convertFile } from '@visioncortex/vtracer'
import { PROMPTS } from './prompts.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(HERE, 'raw')
const DEFAULT_OUTPUT_DIR = join(HERE, 'traced')
const INPUT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])
const VTRACER_VERSION = '1.0.0-alpha.4'

export type TraceProfileName =
  | 'poster-spline'
  | 'poster-cutout'
  | 'poster-polygon'
  | 'poster-cutout-balanced'
  | 'poster-cutout-detail'
  | 'poster-polygon-detail'

export interface TraceProfile {
  readonly preset: 'poster'
  readonly clustering: 'color-cluster'
  readonly hierarchical: 'stacked' | 'cutout'
  readonly mode: 'spline' | 'polygon'
  readonly filterSpeckle: number
  readonly simplify?: number
  readonly maxColors: number
  readonly optimize: 0 | 1 | 2
}

export const TRACE_PROFILES: Readonly<Record<TraceProfileName, TraceProfile>> = {
  'poster-spline': {
    preset: 'poster',
    clustering: 'color-cluster',
    hierarchical: 'stacked',
    mode: 'spline',
    filterSpeckle: 4,
    simplify: 1.5,
    maxColors: 18,
    optimize: 1,
  },
  'poster-cutout': {
    preset: 'poster',
    clustering: 'color-cluster',
    hierarchical: 'cutout',
    mode: 'spline',
    filterSpeckle: 4,
    simplify: 1.5,
    maxColors: 18,
    optimize: 1,
  },
  'poster-polygon': {
    preset: 'poster',
    clustering: 'color-cluster',
    hierarchical: 'cutout',
    mode: 'polygon',
    filterSpeckle: 4,
    simplify: 1.5,
    maxColors: 18,
    optimize: 1,
  },
  'poster-cutout-balanced': {
    preset: 'poster',
    clustering: 'color-cluster',
    hierarchical: 'cutout',
    mode: 'spline',
    filterSpeckle: 2,
    simplify: 1,
    maxColors: 24,
    optimize: 1,
  },
  'poster-cutout-detail': {
    preset: 'poster',
    clustering: 'color-cluster',
    hierarchical: 'cutout',
    mode: 'spline',
    filterSpeckle: 1,
    simplify: 0.5,
    maxColors: 32,
    optimize: 1,
  },
  'poster-polygon-detail': {
    preset: 'poster',
    clustering: 'color-cluster',
    hierarchical: 'cutout',
    mode: 'polygon',
    filterSpeckle: 1,
    maxColors: 32,
    optimize: 1,
  },
}

export interface TraceOptions {
  readonly all: boolean
  readonly slot?: number
  readonly force: boolean
  readonly profile: TraceProfileName
  readonly outputDir: string
}

interface InputFile {
  readonly name: string
  readonly path: string
}

function usage(): string {
  return [
    'Usage: npm run avatars:trace -- (--all | --slot N) [options]',
    '',
    'Options:',
    '  --all                 trace all ten prompt slots',
    '  --slot N              trace one zero-based prompt slot',
    '  --force               overwrite existing SVG output',
    '  --profile NAME        poster-spline, poster-cutout, poster-polygon, poster-cutout-balanced, poster-cutout-detail, or poster-polygon-detail',
    '  --output-dir PATH     write SVGs to PATH instead of tools/avatars/traced',
  ].join('\n')
}

export function parseTraceArgs(argv: readonly string[]): TraceOptions {
  let all = false
  let slot: number | undefined
  let force = false
  let profile: TraceProfileName = 'poster-spline'
  let outputDir = DEFAULT_OUTPUT_DIR

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--all') {
      all = true
    } else if (argument === '--slot') {
      const value = argv[++index]
      if (!value || !/^\d+$/.test(value)) throw new Error('--slot requires a non-negative integer')
      slot = Number(value)
    } else if (argument === '--force') {
      force = true
    } else if (argument === '--profile') {
      const value = argv[++index] as TraceProfileName | undefined
      if (!value || !(value in TRACE_PROFILES)) throw new Error(`Unknown profile: ${value ?? ''}`)
      profile = value
    } else if (argument === '--output-dir') {
      const value = argv[++index]
      if (!value) throw new Error('--output-dir requires a path')
      outputDir = resolve(value)
    } else if (argument === '--help' || argument === '-h') {
      throw new Error(usage())
    } else {
      throw new Error(`Unknown argument: ${argument}\n\n${usage()}`)
    }
  }

  if (all === (slot !== undefined)) throw new Error('Specify exactly one of --all or --slot N')
  if (slot !== undefined && slot >= PROMPTS.length) {
    throw new Error(`Slot ${slot} out of range (0-${PROMPTS.length - 1})`)
  }

  return { all, slot, force, profile, outputDir }
}

export function selectedSlots(options: TraceOptions): number[] {
  return options.all ? PROMPTS.map((_prompt, index) => index) : [options.slot as number]
}

export function validateInputFiles(entries: readonly string[], slots: readonly number[]): InputFile[] {
  const expected = new Set(slots.map((slot) => PROMPTS[slot].name))
  const inputFiles: InputFile[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    const extension = extname(entry).toLowerCase()
    if (!INPUT_EXTENSIONS.has(extension)) continue
    const name = basename(entry, extname(entry))
    if (!expected.has(name)) {
      throw new Error(`Unexpected raster input: ${entry}`)
    }
    if (seen.has(name)) throw new Error(`Multiple raster inputs for ${name}`)
    seen.add(name)
    inputFiles.push({ name, path: join(RAW_DIR, entry) })
  }

  const missing = [...expected].filter((name) => !seen.has(name))
  if (missing.length > 0) throw new Error(`Missing raster input(s): ${missing.join(', ')}`)
  return inputFiles
}

export function validateSvgOutput(svg: string, name: string): void {
  if (!/<svg\b[^>]*>[\s\S]*<\/svg>\s*$/i.test(svg)) {
    throw new Error(`VTracer returned incomplete SVG for ${name}`)
  }
  if (!svg.includes('<path')) throw new Error(`VTracer returned an SVG without paths for ${name}`)
}

export function ensureViewBox(svg: string, name: string): string {
  if (/\bviewBox\s*=/i.test(svg)) return svg
  const rootMatch = svg.match(/<svg\b([^>]*)>/i)
  if (!rootMatch) throw new Error(`VTracer returned an SVG without a root element for ${name}`)
  const width = rootMatch[1].match(/\bwidth="([0-9]+(?:\.[0-9]+)?)"/i)?.[1]
  const height = rootMatch[1].match(/\bheight="([0-9]+(?:\.[0-9]+)?)"/i)?.[1]
  if (!width || !height) throw new Error(`VTracer returned an SVG without usable dimensions for ${name}`)
  const root = rootMatch[0].replace(/>$/, ` viewBox="0 0 ${width} ${height}">`)
  return svg.replace(rootMatch[0], root)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const options = parseTraceArgs(process.argv.slice(2))
  const slots = selectedSlots(options)
  const entries = await readdir(RAW_DIR).catch(() => {
    throw new Error(`No raw/ directory at ${RAW_DIR}. Run avatars:generate first.`)
  })
  const inputs = validateInputFiles(entries, slots)
  const profile = TRACE_PROFILES[options.profile]
  await mkdir(options.outputDir, { recursive: true })

  let traced = 0
  let skipped = 0
  for (const input of inputs) {
    const outputPath = join(options.outputDir, `${input.name}.svg`)
    if (!options.force && (await fileExists(outputPath))) {
      console.log(`✓ ${input.name}.svg already exists, skipping (use --force to regen)`)
      skipped += 1
      continue
    }
    process.stdout.write(`→ ${input.name} (${options.profile}) ... `)
    try {
      await convertFile(input.path, outputPath, profile)
      const normalized = ensureViewBox(await readFile(outputPath, 'utf8'), input.name)
      validateSvgOutput(normalized, input.name)
      await writeFile(outputPath, normalized)
      console.log('done')
      traced += 1
    } catch (error) {
      console.log('FAILED')
      throw new Error(`VTracer failed for ${input.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  await writeFile(
    join(options.outputDir, 'metadata.json'),
    `${JSON.stringify({ profile: options.profile, version: VTRACER_VERSION }, null, 2)}\n`,
  )
  console.log(`\nTraced ${traced}, skipped ${skipped}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
