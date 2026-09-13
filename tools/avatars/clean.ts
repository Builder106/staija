import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { optimize, type Config } from 'svgo'
import { PROMPTS } from './prompts.ts'
import { validatePortraitSet, validateSvg } from './verify.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_INPUT_DIR = join(HERE, 'traced')
const DEFAULT_OUTPUT_DIR = join(HERE, 'clean')
const PARTS_TS = join(HERE, '..', '..', 'src', 'services', 'avatar', 'parts.ts')

interface SvgNode {
  type?: string
  name?: string
  attributes?: Record<string, string | undefined>
  children?: SvgNode[]
}

const removeBackgroundLayerPlugin = {
  name: 'removeBackgroundLayer',
  fn: () => ({
    element: {
      enter: (node: SvgNode, parentNode: SvgNode) => {
        if (parentNode.type !== 'element' || parentNode.name !== 'svg') return
        const first = parentNode.children?.find((child) => child.type === 'element')
        if (first !== node || (node.name !== 'path' && node.name !== 'rect')) return
        const pathData = node.attributes?.d ?? ''
        if (node.name === 'path' && pathData.length < 800) return
        const fill = (node.attributes?.fill ?? '').toLowerCase()
        if (['8b55ff', '5edbe7', 'a878ff', '6b3fe0'].some((color) => fill.includes(color))) return
        if (parentNode.children) parentNode.children = parentNode.children.filter((child) => child !== node)
      },
    },
  }),
}

const baseSvgoPlugins: Config['plugins'] = [
  { name: 'preset-default', params: { overrides: {
    convertPathData: { floatPrecision: 2, transformPrecision: 2, applyTransforms: true },
    cleanupIds: true, mergePaths: false, collapseGroups: false, convertShapeToPath: false,
  } } },
  { name: 'removeAttrs', params: { attrs: ['data-.*', 'inkscape:.*', 'sodipodi:.*'] } },
  'removeDimensions',
]

const svgoConfig: Config = {
  multipass: true,
  plugins: baseSvgoPlugins,
}

export interface CleanedSvg { inner: string; origSize: number }
export type BackgroundMode = 'preserve' | 'transparent'
export interface CleanOptions { background?: BackgroundMode }

function sourceViewBox(svg: string): [number, number, number, number] {
  const match = svg.match(/\bviewBox="([^\"]+)"/i)
  const values = match?.[1]?.trim().split(/\s+/).map(Number)
  if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('SVG has a missing or invalid viewBox')
  }
  const [x, y, width, height] = values
  if (width <= 0 || height <= 0) throw new Error('SVG viewBox must have positive dimensions')
  if (width !== height) throw new Error('SVG viewBox must be square')
  return [x, y, width, height]
}

export function cleanOne(svgInput: string, options: CleanOptions = {}): CleanedSvg {
  const source = validateSvg(svgInput)
  if (!source.valid) throw new Error(`Invalid source SVG: ${source.errors.join('; ')}`)
  const [x, y, width] = sourceViewBox(svgInput)
  const background = options.background ?? 'preserve'
  const config: Config = background === 'transparent'
    ? { ...svgoConfig, plugins: [...baseSvgoPlugins.slice(0, 1), removeBackgroundLayerPlugin, ...baseSvgoPlugins.slice(1)] }
    : svgoConfig
  const optimized = optimize(svgInput, config).data
  const match = optimized.match(/viewBox="([^\"]+)"/)
  if (!match?.[1]) throw new Error('Cleaned SVG has no viewBox')
  const viewBox = match[1].trim().split(/\s+/).map(Number)
  if (viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value))) throw new Error(`Invalid viewBox: ${match[1]}`)
  const optimizedWidth = viewBox[2] ?? 0
  const optimizedHeight = viewBox[3] ?? 0
  if (optimizedWidth <= 0 || optimizedHeight <= 0 || optimizedWidth !== optimizedHeight) throw new Error('Cleaned SVG viewBox must be a positive square')
  const origSize = width
  const innerMatch = optimized.match(/<svg[^>]*>([\s\S]*)<\/svg>\s*$/)
  if (!innerMatch?.[1]) throw new Error('SVG has no wrapper content')
  const translate = x !== 0 || y !== 0 ? `translate(${-x} ${-y}) ` : ''
  return { inner: `<g transform="${translate}scale(${(80 / origSize).toFixed(6)})">${innerMatch[1]}</g>`, origSize }
}

function parseArgs(argv: string[]) {
  const get = (flag: string, fallback: string) => {
    const index = argv.indexOf(flag)
    const value = index >= 0 ? argv[index + 1] : undefined
    if (index >= 0 && !value) throw new Error(`${flag} requires a directory`)
    return resolve(isAbsolute(value ?? fallback) ? value ?? fallback : join(HERE, value ?? fallback))
  }
  return {
    inputDir: get('--input-dir', DEFAULT_INPUT_DIR),
    outputDir: get('--output-dir', DEFAULT_OUTPUT_DIR),
    writeParts: !argv.includes('--no-write-parts'),
    background: (() => {
      const index = argv.indexOf('--background')
      const value = index >= 0 ? argv[index + 1] : 'preserve'
      if (index >= 0 && value !== 'preserve' && value !== 'transparent') {
        throw new Error('--background must be preserve or transparent')
      }
      return value as BackgroundMode
    })(),
  }
}

export function selectPortraitEntries(entries: string[]): string[] {
  const expectedNames = new Set(PROMPTS.map(({ name }) => name))
  const svgEntries = entries.filter((entry) => extname(entry).toLowerCase() === '.svg')
  const extraEntries = svgEntries.filter((entry) => !expectedNames.has(basename(entry, '.svg')))

  if (extraEntries.length > 0) {
    const names = extraEntries.map((entry) => basename(entry)).join(', ')
    console.warn(`Ignoring unrelated SVGs: ${names}`)
  }

  return svgEntries.filter((entry) => expectedNames.has(basename(entry, '.svg')))
}

export function buildPartsTs(svgsByName: Map<string, string>): string {
  const set = validatePortraitSet([...svgsByName.keys()])
  if (!set.valid) throw new Error(set.errors.join('; '))
  const entries = PROMPTS.map((prompt, index) => {
    const svg = svgsByName.get(prompt.name)
    if (!svg) throw new Error(`Missing cleaned portrait: ${prompt.name}`)
    const escaped = svg.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    return `  // ${index} — ${prompt.name}\n  '${escaped}',`
  })
  return `/**\n * SVG part library for the STAIJA avatar style.\n *\n * **Generated file** — produced by tools/avatars/clean.ts after the\n * generate → trace → clean pipeline. Hand-edits here will be\n * overwritten on the next \`npm run avatars:clean\`. To change a\n * portrait, edit the prompt in tools/avatars/prompts.ts and re-run\n * the pipeline.\n *\n * Architecture: whole-portrait avatars. Each entry is a complete\n * head/shoulders SVG fragment, scaled to fit the 0 0 80 80 viewBox.\n * The Dicebear style at ./style.ts seed-picks one per scholar.\n */\n\nexport const PORTRAITS: string[] = [\n${entries.join('\n')}\n]\n`
}

async function main(): Promise<void> {
  const { inputDir, outputDir, writeParts, background } = parseArgs(process.argv.slice(2))
  await access(inputDir)
  await mkdir(outputDir, { recursive: true })
  const entries = selectPortraitEntries(await readdir(inputDir))
  const set = validatePortraitSet(entries.map((entry) => basename(entry, '.svg')))
  if (!set.valid) throw new Error(set.errors.join('; '))
  const cleaned = new Map<string, string>()
  const output: Array<{ name: string; content: string }> = []
  for (const entry of entries) {
    const name = basename(entry, '.svg')
    const raw = await readFile(join(inputDir, entry), 'utf8')
    const { inner } = cleanOne(raw, { background })
    const content =
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `viewBox="0 0 80 80">${inner}</svg>`
    const validation = validateSvg(content, { requireUnitViewBox: true })
    if (!validation.valid) throw new Error(`${name}: ${validation.errors.join('; ')}`)
    cleaned.set(name, inner)
    output.push({ name: entry, content })
  }
  if (writeParts) validatePortraitSet([...cleaned.keys()])
  await Promise.all(
    output.map(({ name, content }) => writeFile(join(outputDir, name), content)),
  )
  try {
    const metadata = await readFile(join(inputDir, 'metadata.json'), 'utf8')
    await writeFile(join(outputDir, 'metadata.json'), metadata)
  } catch {
    // Metadata is optional for manually supplied traced SVGs.
  }
  if (writeParts) await writeFile(PARTS_TS, buildPartsTs(cleaned))
  console.log(`Cleaned ${cleaned.size} portraits.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
