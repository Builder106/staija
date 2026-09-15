import { createHash } from 'node:crypto'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, resolve } from 'node:path'
import { Jimp } from 'jimp'
import {
  AVATAR_CANVAS_SIZE,
  type AvatarSlotManifest,
  type CompositeOptions,
  type CompositeResult,
} from './contracts.ts'
import { assertValidAvatarManifest, sortedVisibleLayers } from './manifest-validation.ts'
import { AVATAR_MANIFESTS } from './manifests.ts'

const TRANSPARENT = 0x00000000

function sha256(contents: Uint8Array): string {
  return createHash('sha256').update(contents).digest('hex')
}

function assertInsideRoot(repositoryRoot: string, relativePath: string): string {
  if (isAbsolute(relativePath)) throw new Error(`Layer path must be relative: ${relativePath}`)
  const root = resolve(repositoryRoot)
  const resolved = resolve(root, relativePath)
  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    throw new Error(`Layer path escapes repository root: ${relativePath}`)
  }
  return resolved
}

async function readLayer(path: string, layerId: string): Promise<Jimp> {
  try {
    const image = await Jimp.read(path)
    if (image.width !== AVATAR_CANVAS_SIZE || image.height !== AVATAR_CANVAS_SIZE) {
      throw new Error(`layer must be ${AVATAR_CANVAS_SIZE}x${AVATAR_CANVAS_SIZE}`)
    }
    return image
  } catch (error) {
    throw new Error(`Unable to read layer ${layerId}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function compositeManifest(
  manifest: AvatarSlotManifest,
  repositoryRoot: string,
  options: CompositeOptions,
): Promise<CompositeResult> {
  assertValidAvatarManifest(manifest)
  if (manifest.slot !== options.slot) throw new Error('Composite slot does not match manifest slot')
  if (!options.force) {
    try {
      await access(options.outputPath)
      throw new Error(`Output already exists: ${options.outputPath}`)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Output already exists:')) throw error
    }
  }

  const canvas = new Jimp({ width: AVATAR_CANVAS_SIZE, height: AVATAR_CANVAS_SIZE, color: TRANSPARENT })
  const layers = sortedVisibleLayers(manifest)
  for (const layer of layers) {
    const image = await readLayer(assertInsideRoot(repositoryRoot, layer.file), layer.id)
    if (layer.transform.scaleX !== 1 || layer.transform.scaleY !== 1) {
      if (layer.transform.scaleX !== layer.transform.scaleY) {
        throw new Error(`Layer ${layer.id} requires non-uniform scaling, which is not supported by the compositor`)
      }
      image.scale(layer.transform.scaleX)
    }
    if (layer.transform.rotation !== 0) image.rotate(layer.transform.rotation)
    if (layer.opacity !== 1) image.opacity(layer.opacity)
    const centeredOffset = (AVATAR_CANVAS_SIZE - image.width) / 2
    canvas.composite(image, Math.round(layer.transform.x + centeredOffset), Math.round(layer.transform.y + centeredOffset), {
      mode: layer.blendMode === 'multiply' ? Jimp.BLEND_MULTIPLY : layer.blendMode === 'screen' ? Jimp.BLEND_SCREEN : Jimp.BLEND_SOURCE_OVER,
    })
  }

  const bytes = await canvas.getBuffer('image/png')
  await mkdir(dirname(options.outputPath), { recursive: true })
  await writeFile(options.outputPath, bytes)
  return {
    slot: manifest.slot,
    outputPath: options.outputPath,
    width: AVATAR_CANVAS_SIZE,
    height: AVATAR_CANVAS_SIZE,
    sha256: sha256(bytes),
    layerIds: layers.map((layer) => layer.id),
  }
}

function parseSlot(value: string | undefined): AvatarSlotManifest['slot'] {
  if (!value || !/^\d+$/.test(value)) throw new Error('Expected --slot 0 through 9')
  const slot = Number(value)
  if (!Number.isInteger(slot) || slot < 0 || slot > 9) throw new Error('Expected --slot 0 through 9')
  return slot as AvatarSlotManifest['slot']
}

function parseSlots(): readonly AvatarSlotManifest['slot'][] {
  const slotIndex = process.argv.indexOf('--slot')
  if (process.argv.includes('--all')) {
    if (slotIndex !== -1) throw new Error('Use either --slot or --all')
    return AVATAR_MANIFESTS.map((manifest) => manifest.slot)
  }
  return [parseSlot(slotIndex === -1 ? undefined : process.argv[slotIndex + 1])]
}

async function main(): Promise<void> {
  const slots = parseSlots()
  const force = process.argv.includes('--force')
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const results = []
  for (const slot of slots) {
    const manifest = AVATAR_MANIFESTS[slot]
    const outputPath = resolve(repositoryRoot, manifest.flattenedOutput)
    results.push(await compositeManifest(manifest, repositoryRoot, {
      slot,
      outputPath,
      force,
    }))
  }
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
