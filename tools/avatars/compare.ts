import { createHash } from 'node:crypto'
import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PROMPTS } from './prompts.ts'
import { validateSvg } from './verify.ts'

const execFileAsync = promisify(execFile)
const EXPECTED_NAMES = PROMPTS.map(({ name }) => name)

export interface CompareOptions {
  baselineDir: string
  candidateDir: string
  background: 'preserve' | 'transparent'
  sizes: number[]
  reportDir: string
}

export interface RendererInfo { command: 'magick' | 'convert'; version: string }
export interface RenderRecord { width: number; height: number; sha256?: string; path: string }
export interface AssetRecord {
  slot: number
  name: string
  svgSha256: string
  rawSha256?: string
  byteSize: number
  pathCount: number
  fillColorCount: number
  viewBox?: string
  alpha: 'opaque' | 'transparent' | 'unknown'
  structural: { valid: boolean; errors: string[] }
  renders: RenderRecord[]
}
export interface ComparisonManifest {
  schemaVersion: 1
  profile: string
  version: string
  background: CompareOptions['background']
  renderer: RendererInfo
  sizes: number[]
  baseline: AssetRecord[]
  candidate: AssetRecord[]
}

export function sha256(contents: Uint8Array | string): string {
  return createHash('sha256').update(contents).digest('hex')
}

export function parseSizes(value: string): number[] {
  const sizes = value.split(',').map((item) => Number(item.trim()))
  if (!sizes.length || sizes.some((size) => !Number.isInteger(size) || size <= 0)) {
    throw new Error('--sizes must be a comma-separated list of positive integers')
  }
  return [...new Set(sizes)]
}

export function inspectSvg(svg: string): Pick<AssetRecord, 'byteSize' | 'pathCount' | 'fillColorCount' | 'viewBox' | 'alpha' | 'structural'> {
  const structural = validateSvg(svg)
  const fills = [...svg.matchAll(/\bfill=["']([^"']+)["']/gi)].map((match) => match[1]?.toLowerCase()).filter(Boolean)
  const viewBox = svg.match(/\bviewBox=["']([^"']+)["']/i)?.[1]
  const alpha = /(?:opacity|fill-opacity|stop-opacity)=["'](?:0(?:\.0*)?|[01]\.0*)["']/i.test(svg)
    ? 'transparent'
    : 'opaque'
  return { byteSize: Buffer.byteLength(svg), pathCount: (svg.match(/<path\b/gi) ?? []).length, fillColorCount: new Set(fills).size, viewBox, alpha, structural }
}

async function rendererInfo(): Promise<RendererInfo> {
  for (const command of ['magick', 'convert'] as const) {
    try {
      const { stdout } = await execFileAsync(command, ['-version'])
      return { command, version: stdout.split('\n')[0]?.trim() ?? 'unknown' }
    } catch { /* Try the next supported renderer. */ }
  }
  throw new Error('No SVG renderer available: install ImageMagick (magick or convert)')
}

async function render(renderer: RendererInfo, svgPath: string, outputPath: string, size: number, background: CompareOptions['background']): Promise<void> {
  await execFileAsync(renderer.command, [
    ...(background === 'transparent' ? ['-background', 'none'] : ['-background', 'white']),
    '-density', '192', svgPath, '-resize', `${size}x${size}`, 'PNG32:' + outputPath,
  ])
}

async function resizeRendered(renderer: RendererInfo, sourcePath: string, outputPath: string, size: number): Promise<void> {
  await execFileAsync(renderer.command, [sourcePath, '-resize', `${size}x${size}`, `PNG32:${outputPath}`])
}

async function readAssets(dir: string): Promise<Map<string, { svg: string; path: string }>> {
  const entries = await readdir(dir)
  const result = new Map<string, { svg: string; path: string }>()
  for (const name of EXPECTED_NAMES) {
    const path = join(dir, `${name}.svg`)
    if (!entries.includes(`${name}.svg`)) continue
    result.set(name, { svg: await readFile(path, 'utf8'), path })
  }
  const missing = EXPECTED_NAMES.filter((name) => !result.has(name))
  if (missing.length) throw new Error(`${dir}: missing portraits: ${missing.join(', ')}`)
  return result
}

async function optionalHash(dir: string, name: string): Promise<string | undefined> {
  for (const extension of ['.png', '.jpg', '.jpeg']) {
    try { return sha256(await readFile(join(dir, `${name}${extension}`))) } catch { /* Optional raw input. */ }
  }
  return undefined
}

async function metadata(dir: string): Promise<{ profile: string; version: string }> {
  try {
    const parsed = JSON.parse(await readFile(join(dir, 'metadata.json'), 'utf8')) as Record<string, unknown>
    return { profile: typeof parsed.profile === 'string' ? parsed.profile : 'unknown', version: typeof parsed.version === 'string' ? parsed.version : 'unknown' }
  } catch { return { profile: 'unknown', version: 'unknown' } }
}

async function records(dir: string, renderer: RendererInfo, sizes: number[], background: CompareOptions['background'], renderDir: string): Promise<AssetRecord[]> {
  const assets = await readAssets(dir)
  const rawDir = resolve(dir, '..', 'raw')
  const output: AssetRecord[] = []
  for (const [slot, name] of EXPECTED_NAMES.entries()) {
    const asset = assets.get(name)
    if (!asset) throw new Error(`Missing asset ${name}`)
    const inspected = inspectSvg(asset.svg)
    const renders: RenderRecord[] = []
    const sourceSize = Math.max(...sizes)
    const sourcePath = join(renderDir, `${name}-source-${sourceSize}.png`)
    await render(renderer, asset.path, sourcePath, sourceSize, background)
    for (const size of sizes) {
      const path = join(renderDir, `${name}-${size}.png`)
      if (size === sourceSize) await copyFile(sourcePath, path)
      else await resizeRendered(renderer, sourcePath, path, size)
      renders.push({ width: size, height: size, sha256: sha256(await readFile(path)), path })
    }
    output.push({ slot, name, svgSha256: sha256(asset.svg), rawSha256: await optionalHash(rawDir, name), ...inspected, renders })
  }
  return output
}

async function makeSheets(renderer: RendererInfo, baseline: AssetRecord[], candidate: AssetRecord[], reportDir: string, sizes: number[]): Promise<void> {
  for (const size of sizes) {
    const files = baseline.flatMap((item, index) => [item.renders.find((rendered) => rendered.width === size)?.path ?? '', candidate[index]?.renders.find((rendered) => rendered.width === size)?.path ?? ''])
    await execFileAsync('montage', [...files, '-tile', '2x', '-geometry', `${size}x${size}+8+8`, join(reportDir, `comparison-${size}.png`),])
  }
}

export async function compare(options: CompareOptions): Promise<ComparisonManifest> {
  if (options.background !== 'preserve' && options.background !== 'transparent') throw new Error('Unsupported background policy')
  if (!options.sizes.length) throw new Error('At least one render size is required')
  await access(options.baselineDir); await access(options.candidateDir); await mkdir(options.reportDir, { recursive: true })
  const renderer = await rendererInfo()
  const baselineMeta = await metadata(options.baselineDir)
  const candidateMeta = await metadata(options.candidateDir)
  const baselineRenderDir = join(options.reportDir, 'baseline'); const candidateRenderDir = join(options.reportDir, 'candidate')
  await mkdir(baselineRenderDir, { recursive: true }); await mkdir(candidateRenderDir, { recursive: true })
  const baseline = await records(options.baselineDir, renderer, options.sizes, options.background, baselineRenderDir)
  const candidate = await records(options.candidateDir, renderer, options.sizes, options.background, candidateRenderDir)
  await makeSheets(renderer, baseline, candidate, options.reportDir, options.sizes)
  const manifest: ComparisonManifest = { schemaVersion: 1, profile: candidateMeta.profile === 'unknown' ? baselineMeta.profile : candidateMeta.profile, version: candidateMeta.version, background: options.background, renderer, sizes: options.sizes, baseline, candidate }
  const stableManifest = JSON.parse(JSON.stringify(manifest, (key, value) => key === 'path' ? basename(String(value)) : value)) as ComparisonManifest
  await writeFile(join(options.reportDir, 'manifest.json'), JSON.stringify(stableManifest, null, 2) + '\n')
  return manifest
}

function value(argv: readonly string[], flag: string): string {
  const index = argv.indexOf(flag); const result = index >= 0 ? argv[index + 1] : undefined
  if (!result) throw new Error(`${flag} requires a value`)
  return result
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const manifest = await compare({ baselineDir: resolve(value(argv, '--baseline-dir')), candidateDir: resolve(value(argv, '--candidate-dir')), background: value(argv, '--background') as CompareOptions['background'], sizes: parseSizes(value(argv, '--sizes')), reportDir: resolve(value(argv, '--report-dir')) })
  console.log(`Compared ${manifest.candidate.length} portraits with ${manifest.renderer.command}; report written to ${resolve(value(argv, '--report-dir'))}`)
}

if (process.argv[1]?.endsWith('compare.ts')) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
