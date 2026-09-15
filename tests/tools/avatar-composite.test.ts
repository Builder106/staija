import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Jimp } from 'jimp'
import { afterEach, describe, expect, it } from 'vitest'
import { compositeManifest } from '../../tools/avatars/composite.ts'
import { type AvatarSlotManifest } from '../../tools/avatars/contracts.ts'
import { validateAvatarManifest } from '../../tools/avatars/manifest-validation.ts'

const temporaryDirectories: string[] = []

async function fixtureManifest(): Promise<{ root: string; manifest: AvatarSlotManifest }> {
  const root = await mkdtemp(join(tmpdir(), 'staija-avatar-composite-'))
  temporaryDirectories.push(root)
  const layerPath = join(root, 'layers', 'base.png')
  await mkdir(join(root, 'layers'), { recursive: true })
  const image = new Jimp({ width: 256, height: 256, color: 0xff0000ff })
  await writeFile(layerPath, await image.getBuffer('image/png'))
  const roles = [
    'background', 'body', 'head', 'hair-back', 'hair-front', 'eyes-open',
    'eyes-closed', 'brows', 'mouth-rest', 'mouth-smile',
  ] as const
  return {
    root,
    manifest: {
      schemaVersion: 1,
      slot: 0,
      name: 'fixture',
      canvas: { width: 256, height: 256, colorSpace: 'srgb', background: 'opaque' },
      layers: roles.map((role, zIndex) => ({
        id: role,
        role,
        file: 'layers/base.png',
        zIndex,
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchor: { x: 128, y: 128 } },
      })),
      flattenedOutput: 'composited/fixture.png',
      staticOutput: 'public/avatars/portrait-0.png',
      lottieOutput: 'src/assets/avatar-lotties/slot-0.json',
    },
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('avatar manifest validation', () => {
  it('requires all animation-safe layer roles and rejects escaping paths', async () => {
    const { root, manifest } = await fixtureManifest()
    expect(validateAvatarManifest(manifest).valid).toBe(true)
    expect(validateAvatarManifest({ ...manifest, layers: [{ ...manifest.layers[0], file: '../outside.png' }] }).errors).toContain(
      'layers[0].file must be repository-relative',
    )
  })
})

describe('avatar compositor', () => {
  it('writes deterministic 256x256 PNG output and stable layer order', async () => {
    const { root, manifest } = await fixtureManifest()
    const first = await compositeManifest(manifest, root, { slot: 0, outputPath: join(root, 'out', 'first.png'), force: true })
    const second = await compositeManifest(manifest, root, { slot: 0, outputPath: join(root, 'out', 'second.png'), force: true })
    expect(first.width).toBe(256)
    expect(first.height).toBe(256)
    expect(first.layerIds).toEqual(manifest.layers.map((layer) => layer.id))
    expect(second.sha256).toBe(first.sha256)
    expect(await readFile(first.outputPath)).toEqual(await readFile(second.outputPath))
  })
})
