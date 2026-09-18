import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { AVATAR_MANIFESTS } from './manifests.ts'
import { compositeManifest } from './composite.ts'
import { cleanOne, buildPartsTs } from './clean.ts'
import { isTraceProfileName, sha256, TRACE_PROFILES, vTracerBackend, type TraceProfileName } from './trace.ts'
import { validateSvg } from './verify.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const COMPOSITED_DIR = join(HERE, 'composited')
const TRACED_DIR = join(HERE, 'candidate-traced')
const CLEAN_DIR = join(HERE, 'candidate-clean')
const PARTS_OUTPUT = join(HERE, 'candidate-parts.ts')
function profileName(): TraceProfileName {
  const index = process.argv.indexOf('--profile')
  const value = index === -1 ? 'poster-cutout' : process.argv[index + 1]
  if (!isTraceProfileName(value)) throw new Error(`Unknown profile: ${value ?? ''}`)
  return value
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force')
  const selectedProfile = profileName()
  const profile = TRACE_PROFILES[selectedProfile]
  await Promise.all([mkdir(COMPOSITED_DIR, { recursive: true }), mkdir(TRACED_DIR, { recursive: true }), mkdir(CLEAN_DIR, { recursive: true })])

  const cleaned = new Map<string, string>()
  const inputs: Record<string, string> = {}
  for (const manifest of AVATAR_MANIFESTS) {
    const compositePath = join(COMPOSITED_DIR, `${manifest.name}.png`)
    const tracePath = join(TRACED_DIR, `${manifest.name}.svg`)
    const cleanPath = join(CLEAN_DIR, `${manifest.name}.svg`)
    const composite = await compositeManifest(manifest, ROOT, { slot: manifest.slot, outputPath: compositePath, force })
    const compositeBytes = await readFile(composite.outputPath)
    const traced = await vTracerBackend.trace({
      inputPath: composite.outputPath,
      outputPath: tracePath,
      profile,
      slot: manifest.slot,
      inputSha256: sha256(compositeBytes),
    })
    const { inner } = cleanOne(traced.svg, { background: 'preserve' })
    const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">${inner}</svg>`
    const validation = validateSvg(content, { requireUnitViewBox: true })
    if (!validation.valid) throw new Error(`${manifest.name}: ${validation.errors.join('; ')}`)
    await writeFile(cleanPath, content)
    cleaned.set(manifest.name, inner)
    inputs[manifest.name] = sha256(compositeBytes)
    console.log(`✓ slot-${manifest.slot} ${manifest.name}`)
  }

  await writeFile(join(TRACED_DIR, 'metadata.json'), `${JSON.stringify({
    engine: 'vtracer',
    engineVersion: '1.0.0-alpha.4',
    profile: selectedProfile,
    version: '1.0.0-alpha.4',
    inputs,
  }, null, 2)}\n`)
  await writeFile(join(CLEAN_DIR, 'metadata.json'), await readFile(join(TRACED_DIR, 'metadata.json')))
  await writeFile(PARTS_OUTPUT, buildPartsTs(cleaned))
  console.log(`Generated ${cleaned.size} VTracer ${selectedProfile} candidate portraits and ${PARTS_OUTPUT}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
