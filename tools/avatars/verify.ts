import { access, readFile, readdir } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PROMPTS } from './prompts.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_INPUT_DIR = join(HERE, 'clean')

export interface SvgValidationOptions { requireUnitViewBox?: boolean }
export interface ValidationResult { valid: boolean; errors: string[] }

function result(errors: string[]): ValidationResult { return { valid: errors.length === 0, errors } }

export function validateSvg(svg: string, options: SvgValidationOptions = {}): ValidationResult {
  const errors: string[] = []
  if (!/<svg\b[^>]*>[\s\S]*<\/svg>\s*$/i.test(svg)) {
    errors.push('missing SVG wrapper')
  }
  const viewBox = svg.match(/\bviewBox="([^\"]+)"/i)?.[1]?.trim().split(/\s+/).map(Number)
  if (!viewBox || viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value))) errors.push('missing or invalid viewBox')
  else if ((viewBox[2] ?? 0) <= 0 || (viewBox[3] ?? 0) <= 0) errors.push('viewBox must have positive dimensions')
  else if (options.requireUnitViewBox && viewBox.join(' ') !== '0 0 80 80') errors.push('cleaned viewBox must be 0 0 80 80')
  if (!/<path\b/i.test(svg)) errors.push('no path element')
  if (/<image\b/i.test(svg) || /(?:href|xlink:href)\s*=\s*["'](?:data:|[^"']+)["']/i.test(svg)) errors.push('embedded image is not allowed')
  if (/vector-effect\s*=\s*["']non-scaling-stroke["']/i.test(svg)) errors.push('non-scaling-stroke marker is not allowed')
  return result(errors)
}

export function validatePortraitSet(names: string[]): ValidationResult {
  const expected = PROMPTS.map(({ name }) => name).sort()
  const actual = [...new Set(names)].sort()
  const errors: string[] = []
  if (names.length !== expected.length) errors.push(`expected exactly ${expected.length} portraits, found ${names.length}`)
  const missing = expected.filter((name) => !actual.includes(name))
  const extra = actual.filter((name) => !expected.includes(name))
  if (missing.length) errors.push(`missing portraits: ${missing.join(', ')}`)
  if (extra.length) errors.push(`unexpected portraits: ${extra.join(', ')}`)
  if (new Set(names).size !== names.length) errors.push('duplicate portrait names')
  return result(errors)
}

export function verifySvgs(svgs: ReadonlyMap<string, string>): ValidationResult {
  const errors: string[] = [...validatePortraitSet([...svgs.keys()]).errors]
  for (const [name, svg] of svgs) {
    errors.push(...validateSvg(svg, { requireUnitViewBox: true }).errors.map((error) => `${name}: ${error}`))
  }
  return result(errors)
}

export async function verifyDirectory(inputDir: string = DEFAULT_INPUT_DIR): Promise<ValidationResult> {
  await access(inputDir)
  const entries = (await readdir(inputDir)).filter(
    (entry) => extname(entry).toLowerCase() === '.svg',
  )
  const expected = new Set(PROMPTS.map(({ name }) => name))
  const relevant = entries.filter((entry) => expected.has(basename(entry, '.svg')))
  const svgs = new Map<string, string>()
  for (const entry of relevant) {
    svgs.set(basename(entry, '.svg'), await readFile(join(inputDir, entry), 'utf8'))
  }
  return verifySvgs(svgs)
}

function parseInputDir(argv: readonly string[]): string {
  const index = argv.indexOf('--input-dir')
  const value = index >= 0 ? argv[index + 1] : undefined
  if (index >= 0 && !value) throw new Error('--input-dir requires a path')
  const path = value ?? DEFAULT_INPUT_DIR
  return resolve(isAbsolute(path) ? path : join(HERE, path))
}

async function main(): Promise<void> {
  const inputDir = parseInputDir(process.argv.slice(2))
  const validation = await verifyDirectory(inputDir)
  if (!validation.valid) throw new Error(validation.errors.join('; '))
  console.log(`Verified ${PROMPTS.length} portraits in ${inputDir}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
