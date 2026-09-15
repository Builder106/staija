import { describe, expect, it } from 'vitest'
import {
  TRACE_PROFILES,
  parseTraceArgs,
  selectedSlots,
  validateInputFiles,
  ensureViewBox,
  validateSvgOutput,
} from '../../tools/avatars/trace.ts'

describe('avatar tracing profiles', () => {
  it('defines the existing and tuning poster profiles', () => {
    expect(Object.keys(TRACE_PROFILES)).toEqual([
      'poster-spline',
      'poster-cutout',
      'poster-polygon',
      'poster-cutout-balanced',
      'poster-cutout-detail',
      'poster-polygon-detail',
    ])
    expect(TRACE_PROFILES['poster-spline']).toMatchObject({
      preset: 'poster',
      hierarchical: 'stacked',
      mode: 'spline',
      maxColors: 18,
    })
    expect(TRACE_PROFILES['poster-cutout'].hierarchical).toBe('cutout')
    expect(TRACE_PROFILES['poster-polygon'].mode).toBe('polygon')
    expect(TRACE_PROFILES['poster-cutout-balanced']).toEqual({
      preset: 'poster',
      clustering: 'color-cluster',
      hierarchical: 'cutout',
      mode: 'spline',
      filterSpeckle: 2,
      simplify: 1,
      maxColors: 24,
      optimize: 1,
    })
    expect(TRACE_PROFILES['poster-cutout-detail']).toEqual({
      preset: 'poster',
      clustering: 'color-cluster',
      hierarchical: 'cutout',
      mode: 'spline',
      filterSpeckle: 1,
      simplify: 0.5,
      maxColors: 32,
      optimize: 1,
    })
    expect(TRACE_PROFILES['poster-polygon-detail']).toEqual({
      preset: 'poster',
      clustering: 'color-cluster',
      hierarchical: 'cutout',
      mode: 'polygon',
      filterSpeckle: 1,
      maxColors: 32,
      optimize: 1,
    })
  })
})

describe('parseTraceArgs', () => {
  it('parses all supported options', () => {
    const options = parseTraceArgs([
      '--all',
      '--force',
      '--profile',
      'poster-cutout-detail',
      '--output-dir',
      './benchmark',
    ])
    expect(options.all).toBe(true)
    expect(options.force).toBe(true)
    expect(options.profile).toBe('poster-cutout-detail')
    expect(options.inputDir).toMatch(/tools\/avatars\/raw$/)
    expect(options.outputDir).toMatch(/benchmark$/)
  })

  it('requires exactly one selection mode', () => {
    expect(() => parseTraceArgs([])).toThrow('--all or --slot')
    expect(() => parseTraceArgs(['--all', '--slot', '1'])).toThrow('--all or --slot')
    expect(() => parseTraceArgs(['--slot', '10'])).toThrow('out of range')
  })
})

describe('input and output validation', () => {
  it('adds a viewBox when VTracer emits width and height only', () => {
    const svg = '<?xml version="1.0"?><svg width="768" height="768"><path d="M0 0"/></svg>'
    expect(ensureViewBox(svg, 'portrait-bald')).toContain('viewBox="0 0 768 768"')
  })

  it('selects all prompt slots or one slot', () => {
    expect(selectedSlots(parseTraceArgs(['--all']))).toHaveLength(10)
    expect(selectedSlots(parseTraceArgs(['--slot', '3']))).toEqual([3])
  })

  it('rejects missing, duplicate, and unexpected raster inputs', () => {
    expect(() => validateInputFiles(['portrait-bald.png'], [0, 1])).toThrow('Missing')
    expect(() => validateInputFiles(['portrait-bald.png', 'portrait-bald.jpg'], [0])).toThrow('Multiple')
    expect(() => validateInputFiles(['other.png'], [0])).toThrow('Unexpected')
  })

  it('rejects incomplete SVG output', () => {
    expect(() => validateSvgOutput('<svg></svg>', 'portrait-bald')).toThrow('without paths')
    expect(() => validateSvgOutput('<svg><path d="M0 0"/></svg>', 'portrait-bald')).not.toThrow()
  })
})
