import { describe, expect, it } from 'vitest'
import { cleanOne, selectPortraitEntries } from '../../tools/avatars/clean.ts'
import { validatePortraitSet, validateSvg } from '../../tools/avatars/verify.ts'

const validSvg = '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#f1f5f9"/><path d="M0 0h100v100H0z"/></svg>'

describe('avatar SVG verification', () => {
  it('accepts a wrapped SVG with a valid viewBox and path', () => expect(validateSvg(validSvg)).toEqual({ valid: true, errors: [] }))
  it('accepts the XML declaration emitted by VTracer', () => {
    expect(validateSvg(`<?xml version="1.0" encoding="UTF-8"?>\n${validSvg}`)).toEqual({
      valid: true,
      errors: [],
    })
  })
  it('rejects embedded images and non-scaling strokes', () => {
    const invalid = '<svg viewBox="0 0 10 10"><image href="data:image/png;base64,x"/><path vector-effect="non-scaling-stroke"/></svg>'
    expect(validateSvg(invalid).errors).toEqual(['embedded image is not allowed', 'non-scaling-stroke marker is not allowed'])
  })
  it('requires exactly the ten configured portrait names', () => expect(validatePortraitSet(['portrait-bald'])).toMatchObject({ valid: false }))
})

describe('avatar SVG cleaning', () => {
  it('selects the ten configured stems and ignores historical extras', () => {
    const portraitNames = [
      'portrait-bald',
      'portrait-afro-medium',
      'portrait-locs',
      'portrait-braids-long',
      'portrait-hijab',
      'portrait-gele',
      'portrait-twa-glasses',
      'portrait-twists-puff',
      'portrait-fade-glasses',
      'portrait-bantu',
    ]
    const entries = [
      ...portraitNames.map((name) => `${name}.svg`),
      'portrait-bald-old.svg',
      'portrait-bald-legacy.svg',
      'variant.svg',
    ]
    expect(selectPortraitEntries(entries)).toHaveLength(10)
  })

  it('preserves the 80 by 80 scaling contract', () => expect(cleanOne(validSvg).inner).toContain('scale(0.800000)'))
  it('preserves the full-canvas background by default', () => {
    expect(cleanOne(validSvg).inner).toContain('<rect')
  })
  it('removes the background only in transparent mode', () => {
    expect(cleanOne(validSvg, { background: 'transparent' }).inner).not.toContain('<rect')
  })
  it('translates a nonzero square viewBox origin', () => {
    const svg = '<svg viewBox="10 20 100 100"><path d="M10 20h100v100H10z"/></svg>'
    expect(cleanOne(svg).inner).toContain('translate(-10 -20) scale(0.800000)')
  })
  it('rejects a rectangular source viewBox', () => {
    expect(() => cleanOne('<svg viewBox="0 0 100 80"><path d="M0 0h100v80H0z"/></svg>')).toThrow('must be square')
  })
})
