import { describe, expect, it } from 'vitest'
import { inspectSvg, parseSizes, sha256 } from '../../tools/avatars/compare.ts'

describe('avatar comparison tool', () => {
  it('parses unique positive render sizes', () => expect(parseSizes('32,56,32')).toEqual([32, 56]))
  it('rejects invalid render sizes', () => expect(() => parseSizes('32,0')).toThrow())
  it('reports deterministic SVG metrics and structural validation', () => {
    const svg = '<svg viewBox="0 0 80 80"><path fill="#fff" d="M0 0h80v80z"/></svg>'
    expect(inspectSvg(svg)).toMatchObject({ byteSize: svg.length, pathCount: 1, fillColorCount: 1, viewBox: '0 0 80 80', alpha: 'opaque', structural: { valid: true } })
  })
  it('hashes identical content identically', () => expect(sha256('avatar')).toBe(sha256('avatar')))
})
