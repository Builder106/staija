import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Jimp } from 'jimp'
import { AVATAR_MANIFESTS } from '../../tools/avatars/manifests.ts'
import { createAvatarReview } from '../../tools/avatars/review.ts'

const temporaryDirectories: string[] = []

async function fixtureDirectory(): Promise<{ root: string; baselineDir: string; candidateDir: string; outputDir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'staija-avatar-review-'))
  temporaryDirectories.push(root)
  const baselineDir = join(root, 'baseline')
  const candidateDir = join(root, 'candidate')
  const outputDir = join(root, 'review')
  await Promise.all([mkdir(baselineDir), mkdir(candidateDir)])
  for (const manifest of AVATAR_MANIFESTS) {
    const baseline = new Jimp({ width: 256, height: 256, color: ((manifest.slot + 1) << 24) | 0x000000ff })
    const candidate = new Jimp({ width: 256, height: 256, color: ((manifest.slot + 11) << 24) | 0x000000ff })
    await baseline.write(join(baselineDir, `portrait-${manifest.slot}.png`))
    await candidate.write(join(candidateDir, `${manifest.name}.png`))
  }
  return { root, baselineDir, candidateDir, outputDir }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('avatar review-sheet tool', () => {
  it('writes deterministic side-by-side sheets and a per-slot hash manifest', async () => {
    const fixture = await fixtureDirectory()
    const first = await createAvatarReview(fixture)
    const firstSheet = await readFile(join(fixture.outputDir, 'avatar-review-32.png'))
    const second = await createAvatarReview(fixture)
    const secondSheet = await readFile(join(fixture.outputDir, 'avatar-review-32.png'))

    expect(first).toMatchObject({ schemaVersion: 1, sizes: [32, 56, 80, 120, 256] })
    expect(first.slots).toHaveLength(10)
    expect(first.sheets).toHaveLength(5)
    expect(first.slots.every((slot) => /^[a-f0-9]{64}$/.test(slot.baselineSha256) && /^[a-f0-9]{64}$/.test(slot.candidateSha256))).toBe(true)
    expect(firstSheet.equals(secondSheet)).toBe(true)
    expect(second.sheets).toEqual(first.sheets)
    const sheet = await Jimp.read(firstSheet)
    expect([sheet.width, sheet.height]).toEqual([64, 320])
    expect(JSON.parse(await readFile(join(fixture.outputDir, 'avatar-review-manifest.json'), 'utf8'))).toEqual(first)
  }, 20_000)

  it('rejects a missing or incorrectly sized required PNG before writing output', async () => {
    const fixture = await fixtureDirectory()
    await writeFile(join(fixture.candidateDir, `${AVATAR_MANIFESTS[3]?.name}.png`), await new Jimp({ width: 255, height: 256 }).getBuffer('image/png'))

    await expect(createAvatarReview(fixture)).rejects.toThrow('candidate slot 3')
    await expect(readFile(join(fixture.outputDir, 'avatar-review-manifest.json'))).rejects.toThrow()
  })

  it('rejects output inside either input directory', async () => {
    const fixture = await fixtureDirectory()

    await expect(createAvatarReview({ ...fixture, outputDir: join(fixture.baselineDir, 'review') })).rejects.toThrow('must not be inside')
    await expect(createAvatarReview({ ...fixture, outputDir: join(fixture.candidateDir, 'review') })).rejects.toThrow('must not be inside')
  })
})
