import { describe, it, expect } from 'vitest'

import { avatarSvg, avatarDataUri } from '../../src/services/avatar/svg'
import { avatarSeedFor } from '../../src/services/avatar'

describe('avatarSeedFor', () => {
  it('prefers uid over email', () => {
    expect(avatarSeedFor({ uid: 'abc', email: 'foo@bar.com' })).toBe('abc')
  })

  it('falls back to email when uid is missing', () => {
    expect(avatarSeedFor({ email: 'foo@bar.com' })).toBe('foo@bar.com')
  })

  it('falls back to a constant default when both are missing', () => {
    expect(avatarSeedFor({})).toBe('staija-default')
    expect(avatarSeedFor({ email: null })).toBe('staija-default')
  })
})

describe('avatarSvg', () => {
  // Architecture: whole-portrait avatars. PORTRAITS in
  // src/services/avatar/parts.ts is currently empty stubs — actual SVG
  // content lands there after the tools/avatars/ pipeline produces it.
  // These tests cover the framework contract that holds independent of
  // whether portraits are populated: valid SVG shape, correct viewBox,
  // determinism. Once PORTRAITS has real content, add coverage for
  // distinct seeds picking distinct portraits.

  it('returns a valid SVG string', () => {
    const svg = avatarSvg('alice')
    expect(svg).toMatch(/^<svg[^>]*>/)
    expect(svg).toMatch(/<\/svg>$/)
  })

  it('uses the 80x80 viewBox the parts library is authored against', () => {
    expect(avatarSvg('alice')).toMatch(/viewBox="0 0 80 80"/)
  })

  it('is deterministic — same seed always returns the same SVG', () => {
    const a = avatarSvg('amina')
    const b = avatarSvg('amina')
    expect(a).toBe(b)
  })
})

describe('avatarDataUri', () => {
  it('returns a data: URI string', () => {
    const uri = avatarDataUri('alice')
    expect(uri).toMatch(/^data:image\/svg\+xml/)
  })

  it('is deterministic per seed', () => {
    expect(avatarDataUri('amina')).toBe(avatarDataUri('amina'))
  })
})
