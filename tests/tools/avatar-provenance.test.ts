import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface LegacySlot {
  slot: number
  name: string
  generationSeed: number
  subjectPrompt: string
  originalPng: {
    path: string
    gitBlob: string
  }
}

interface LegacyProvenance {
  schemaVersion: number
  kind: string
  reconstructedFrom: {
    commit: string
  }
  generation: {
    provider: string
    model: string
    width: number
    height: number
  }
  runtimeSelection: {
    role: string
  }
  slots: LegacySlot[]
}

async function readProvenance(): Promise<LegacyProvenance> {
  const file = resolve(process.cwd(), 'tools/avatars/provenance/legacy-whole-portraits.v1.json')
  const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
  return parsed as LegacyProvenance
}

function generationSeed(name: string): number {
  let seed = 0
  for (const character of name) seed = ((seed << 5) - seed + character.charCodeAt(0)) | 0
  return Math.abs(seed) % 100000
}

describe('legacy whole-portrait provenance', () => {
  it('records the recoverable source-art recipe for all ten initial thumbnails', async () => {
    const provenance = await readProvenance()

    expect(provenance.schemaVersion).toBe(1)
    expect(provenance.kind).toBe('legacy-whole-portrait-provenance')
    expect(provenance.reconstructedFrom.commit).toBe('f32c10ebe61738774b2adc786974923f8ded1c3c')
    expect(provenance.generation).toMatchObject({ provider: 'pollinations', model: 'flux', width: 1024, height: 1024 })
    expect(provenance.runtimeSelection.role).toContain('did not generate the source art')
    expect(provenance.slots.map(({ slot }) => slot)).toEqual([...Array(10).keys()])

    for (const slot of provenance.slots) {
      expect(slot.generationSeed).toBe(generationSeed(slot.name))
      expect(slot.subjectPrompt).not.toHaveLength(0)
      expect(slot.originalPng.path).toBe(`public/avatars/portrait-${slot.slot}.png`)
      expect(slot.originalPng.gitBlob).toMatch(/^[a-f0-9]{40}$/)
    }
  })
})
