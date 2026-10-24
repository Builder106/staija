import { describe, it, expect } from 'vitest';
import { compileSafeMath } from '../../src/services/safeMathParser';
import { validateGeometrySpec, type GeometrySpec } from '../../src/types/geometry';

describe('Safe Math Expression Parser & Evaluator', () => {
  it('correctly evaluates standard arithmetic and precedence', () => {
    const fn1 = compileSafeMath('2 + 3 * 4');
    expect(fn1(0)).toBe(14);

    const fn2 = compileSafeMath('(2 + 3) * 4');
    expect(fn2(0)).toBe(20);

    const fn3 = compileSafeMath('10 / 2 - 3');
    expect(fn3(0)).toBe(2);

    const fn4 = compileSafeMath('2 ^ 3');
    expect(fn4(0)).toBe(8);

    const fn5 = compileSafeMath('10 % 3');
    expect(fn5(0)).toBe(1);
  });

  it('evaluates variable x in linear and polynomial functions', () => {
    const linear = compileSafeMath('2 * x + 5');
    expect(linear(0)).toBe(5);
    expect(linear(3)).toBe(11);
    expect(linear(-2)).toBe(1);

    const quad = compileSafeMath('x^2 - 4 * x + 4');
    expect(quad(2)).toBe(0);
    expect(quad(0)).toBe(4);
    expect(quad(4)).toBe(4);
  });

  it('evaluates trigonometric, exponential and logarithmic math functions', () => {
    const trig = compileSafeMath('sin(x)');
    expect(trig(0)).toBeCloseTo(0);
    expect(trig(Math.PI / 2)).toBeCloseTo(1);

    const expFn = compileSafeMath('exp(-x)');
    expect(expFn(0)).toBeCloseTo(1);
    expect(expFn(1)).toBeCloseTo(Math.exp(-1));

    const logFn = compileSafeMath('ln(x)');
    expect(logFn(Math.E)).toBeCloseTo(1);

    const sqrtFn = compileSafeMath('sqrt(x + 9)');
    expect(sqrtFn(0)).toBe(3);
    expect(sqrtFn(7)).toBe(4);
  });

  it('evaluates constants pi and e', () => {
    const circleCircumference = compileSafeMath('2 * pi * x');
    expect(circleCircumference(1)).toBeCloseTo(2 * Math.PI);

    const ePower = compileSafeMath('e ^ x');
    expect(ePower(1)).toBeCloseTo(Math.E);
  });

  it('supports parameterized slider variables', () => {
    const wave = compileSafeMath('a * sin(k * x)');
    expect(wave(Math.PI / 2, { a: 3, k: 1 })).toBeCloseTo(3);
    expect(wave(Math.PI / 4, { a: 2, k: 2 })).toBeCloseTo(2);
  });

  it('strictly rejects malicious execution and non-math inputs', () => {
    expect(() => compileSafeMath('eval("2+2")')).toThrow();
    expect(() => compileSafeMath('window.location')).toThrow();
    expect(() => compileSafeMath('alert(1)')).toThrow();
    expect(() => compileSafeMath('<script>alert(1)</script>')).toThrow();
    expect(() => compileSafeMath('Function("return 1")()')).toThrow();
    expect(() => compileSafeMath('constructor.prototype')).toThrow();
    expect(() => compileSafeMath('2 + 2; delete window;')).toThrow();
    expect(() => compileSafeMath('{ x: 1 }')).toThrow();
    expect(() => compileSafeMath('[1, 2, 3]')).toThrow();
    expect(() => compileSafeMath('$process.exit()')).toThrow();
  });
});

describe('Declarative Geometry Specification Validation', () => {
  it('validates a complete STEM geometry spec with coordinates, functiongraph, and sliders', () => {
    const input: GeometrySpec = {
      title: 'Damped Harmonic Oscillator',
      description: 'Interactive visualization of spring-mass damping',
      boundingBox: [-10, 10, 10, -10],
      axis: true,
      grid: true,
      elements: [
        {
          kind: 'point',
          id: 'origin',
          name: 'Origin',
          coords: [0, 0],
          fixed: true,
        },
        {
          kind: 'slider',
          name: 'gamma',
          point1: [-8, 8],
          point2: [-4, 8],
          range: [0, 0.2, 1],
        },
        {
          kind: 'functiongraph',
          name: 'Oscillation',
          fn: 'exp(-0.2 * x) * cos(2 * x)',
          color: '#4f46e5',
        },
      ],
    };

    const res = validateGeometrySpec(input);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.spec.title).toBe('Damped Harmonic Oscillator');
      expect(res.spec.elements).toHaveLength(3);
      expect(res.spec.elements[0].kind).toBe('point');
      expect(res.spec.elements[1].kind).toBe('slider');
      expect(res.spec.elements[2].kind).toBe('functiongraph');
    }
  });

  it('validates geometric shapes (circles, lines, vectors, polygons)', () => {
    const input: GeometrySpec = {
      elements: [
        {
          kind: 'point',
          id: 'p1',
          coords: [1, 1],
        },
        {
          kind: 'point',
          id: 'p2',
          coords: [4, 5],
        },
        {
          kind: 'segment',
          point1: 'p1',
          point2: 'p2',
          color: '#10b981',
        },
        {
          kind: 'vector',
          point1: [0, 0],
          point2: [3, 2],
        },
        {
          kind: 'circle',
          center: 'p1',
          radius: 3,
        },
        {
          kind: 'polygon',
          vertices: [
            [0, 0],
            [3, 0],
            [3, 4],
          ],
        },
        {
          kind: 'text',
          text: 'Hypotenuse',
          coords: [1.5, 2],
        },
      ],
    };

    const res = validateGeometrySpec(input);
    expect(res.valid).toBe(true);
  });

  it('rejects invalid bounding box dimensions', () => {
    const input = {
      boundingBox: [-10, 10, 10], // only 3 elements
      elements: [],
    };
    const res = validateGeometrySpec(input);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.error).toContain('boundingBox');
    }
  });

  it('rejects invalid element coordinates or missing required properties', () => {
    const input = {
      elements: [
        {
          kind: 'point',
          coords: [1], // invalid length
        },
      ],
    };
    const res = validateGeometrySpec(input);
    expect(res.valid).toBe(false);
  });

  it('rejects unsupported element kinds', () => {
    const input = {
      elements: [
        {
          kind: 'malicious-iframe',
        },
      ],
    };
    const res = validateGeometrySpec(input);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.error).toContain('Unsupported geometry element');
    }
  });
});

