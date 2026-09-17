import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Jimp } from 'jimp'
import { afterEach, describe, expect, it } from 'vitest'
import { buildPartsTs } from '../../tools/avatars/clean.ts'
import { compositeManifest } from '../../tools/avatars/composite.ts'
import { type AvatarSlotManifest } from '../../tools/avatars/contracts.ts'
import { AVATAR_MANIFESTS } from '../../tools/avatars/manifests.ts'
import { promoteAvatarCandidate } from '../../tools/avatars/promote.ts'
import { sha256 } from '../../tools/avatars/trace.ts'

const temporaryDirectories: string[] = []
const roles = ['background', 'body', 'head', 'hair-back', 'hair-front', 'eyes-open', 'eyes-closed', 'brows', 'mouth-rest', 'mouth-smile'] as const

function manifest(slot: number, name: string): AvatarSlotManifest {
  return {
    schemaVersion: 1,
    slot: slot as AvatarSlotManifest['slot'],
    name,
    canvas: { width: 256, height: 256, colorSpace: 'srgb', background: 'opaque' },
    layers: roles.map((role, zIndex) => ({
      id: role,
      role,
      file: `tools/avatars/layers/slot-${slot}/${role}.png`,
      zIndex,
      visible: role !== 'eyes-closed' && role !== 'mouth-smile',
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchor: { x: 128, y: 128 } },
    })),
    flattenedOutput: `tools/avatars/composited/${name}.png`,
    staticOutput: `public/avatars/portrait-${slot}.png`,
    lottieOutput: `src/assets/avatar-lotties/slot-${slot}.json`,
  }
}

async function fixture(): Promise<{ root: string; manifests: AvatarSlotManifest[] }> {
  const root = await mkdtemp(join(tmpdir(), 'staija-avatar-promote-test-'))
  temporaryDirectories.push(root)
  const manifests = AVATAR_MANIFESTS.map(({ name, slot }) => manifest(slot, name))
  const cleaned = new Map<string, string>()
  const inputs: Record<string, string> = {}
  for (const item of manifests) {
    const layerDirectory = join(root, 'tools/avatars/layers', `slot-${item.slot}`)
    await mkdir(layerDirectory, { recursive: true })
    const png = await new Jimp({ width: 256, height: 256, color: (item.slot + 1) * 0x10101000 + 0xff }).getBuffer('image/png')
    await Promise.all(item.layers.map(({ file }) => writeFile(join(root, file), png)))
    const outputPath = join(root, 'tools/avatars/composited', `${item.name}.png`)
    await compositeManifest(item, root, { slot: item.slot, outputPath, force: true })
    inputs[item.name] = sha256(await readFile(outputPath))
    const inner = `<g><path d="M0 0h80v80H0z" fill="#${item.slot}${item.slot}${item.slot}"/></g>`
    cleaned.set(item.name, inner)
    await mkdir(join(root, 'tools/avatars/candidate-traced'), { recursive: true })
    await mkdir(join(root, 'tools/avatars/candidate-clean'), { recursive: true })
    await writeFile(join(root, 'tools/avatars/candidate-traced', `${item.name}.svg`), `<svg viewBox="0 0 256 256"><path d="M0 0h256v256H0z"/></svg>`)
    await writeFile(join(root, 'tools/avatars/candidate-clean', `${item.name}.svg`), `<svg viewBox="0 0 80 80">${inner}</svg>`)
  }
  const metadata = `${JSON.stringify({ engine: 'vtracer', profile: 'poster-cutout-detail', inputs }, null, 2)}\n`
  await writeFile(join(root, 'tools/avatars/candidate-traced/metadata.json'), metadata)
  await writeFile(join(root, 'tools/avatars/candidate-clean/metadata.json'), metadata)
  await writeFile(join(root, 'tools/avatars/candidate-parts.ts'), buildPartsTs(cleaned))
  return { root, manifests }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('avatar candidate promotion', () => {
  it('defaults to a deterministic dry run without creating runtime artifacts', async () => {
    const { root, manifests } = await fixture()
    const first = await promoteAvatarCandidate({ manifests, paths: { root } })
    const second = await promoteAvatarCandidate({ manifests, paths: { root } })
    expect(first.applied).toBe(false)
    expect(second).toEqual(first)
    await expect(readFile(join(root, 'public/avatars/portrait-0.png'))).rejects.toThrow()
    await expect(readFile(join(root, 'src/services/avatar/parts.ts'))).rejects.toThrow()
  }, 20_000)

  it('refuses stale candidate metadata before writing a runtime artifact', async () => {
    const { root, manifests } = await fixture()
    const metadataPath = join(root, 'tools/avatars/candidate-traced/metadata.json')
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as { inputs: Record<string, string> }
    metadata.inputs[manifests[3].name] = '0'.repeat(64)
    await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`)
    await writeFile(join(root, 'tools/avatars/candidate-clean/metadata.json'), `${JSON.stringify(metadata)}\n`)
    await expect(promoteAvatarCandidate({ apply: true, manifests, paths: { root } })).rejects.toThrow('metadata input hash does not match composite')
    await expect(readFile(join(root, manifests[3].staticOutput))).rejects.toThrow()
  }, 20_000)

  it('applies only validated candidate composites, parts, and ten Lotties', async () => {
    const { root, manifests } = await fixture()
    const result = await promoteAvatarCandidate({ apply: true, manifests, paths: { root } })
    expect(result.applied).toBe(true)
    expect(Object.keys(result.composites)).toHaveLength(10)
    expect(Object.keys(result.lotties)).toHaveLength(10)
    for (const item of manifests) {
      expect(await readFile(join(root, item.staticOutput))).toEqual(await readFile(join(root, 'tools/avatars/composited', `${item.name}.png`)))
      expect(JSON.parse(await readFile(join(root, item.lottieOutput, ), 'utf8')).meta.slot).toBe(item.slot)
    }
    expect(await readFile(join(root, 'src/services/avatar/parts.ts'), 'utf8')).toEqual(await readFile(join(root, 'tools/avatars/candidate-parts.ts'), 'utf8'))
  }, 20_000)
})
