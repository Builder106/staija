import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Jimp } from 'jimp'
import { AVATAR_MANIFESTS } from './manifests.ts'
import { isAvatarSlot, type AvatarLayerRole, type AvatarSlot } from './contracts.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TRANSPARENT = 0x00000000
const EMPTY_ROLES = new Set<AvatarLayerRole>(['hair-back', 'hair-front', 'accessory'])

function parseSlots(): AvatarSlot[] {
  const slotIndex = process.argv.indexOf('--slot')
  if (slotIndex >= 0) {
    const value = Number(process.argv[slotIndex + 1])
    if (!isAvatarSlot(value)) throw new Error('Expected --slot 0 through 9')
    return [value]
  }
  if (process.argv.includes('--all')) return AVATAR_MANIFESTS.map((manifest) => manifest.slot)
  throw new Error('Usage: tsx tools/avatars/ensure-empty-layers.ts --slot <0-9> [--force] OR --all [--force]')
}

async function writeEmptyLayer(path: string, force: boolean): Promise<void> {
  const exists = await access(path).then(() => true, () => false)
  if (exists && !force) return
  const image = new Jimp({ width: 256, height: 256, color: TRANSPARENT })
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, await image.getBuffer('image/png'))
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force')
  for (const slot of parseSlots()) {
    const manifest = AVATAR_MANIFESTS[slot]
    for (const layer of manifest.layers) {
      if (!EMPTY_ROLES.has(layer.role)) continue
      await writeEmptyLayer(resolve(ROOT, layer.file), force)
    }
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
