// ============================================================
// Statistical Functions Tests
// Tests for Gini coefficient, wealth distribution, and utility functions
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  computeGiniFast,
  computeGini,
  generateWealthDistribution,
  createRNG,
  clamp,
  lerp,
  shuffle,
} from '../src/simulation/utils'

// ============================================================
// Gini Coefficient Tests
// ============================================================
describe('computeGiniFast', () => {
  it('returns 0 for perfectly equal distribution', () => {
    const equal = [100, 100, 100, 100, 100]
    const gini = computeGiniFast(equal)
    expect(gini).toBeCloseTo(0, 2)
  })

  it('returns close to 1 for maximally unequal distribution', () => {
    // One agent has everything, rest have 0
    const unequal = [0, 0, 0, 0, 10000]
    const gini = computeGiniFast(unequal)
    expect(gini).toBeGreaterThan(0.7)
    expect(gini).toBeLessThanOrEqual(1.0)
  })

  it('returns known Gini for simple distributions', () => {
    // [1, 2, 3, 4, 5] → Gini ≈ 0.2667
    const gini = computeGiniFast([1, 2, 3, 4, 5])
    expect(gini).toBeCloseTo(0.2667, 1)
  })

  it('handles negative wealth values correctly (floor-shift method)', () => {
    // All negative but equal → Gini should be 0
    const allNegativeEqual = [-100, -100, -100, -100]
    expect(computeGiniFast(allNegativeEqual)).toBeCloseTo(0, 2)

    // Mixed negative and positive
    const mixed = [-50, -20, 0, 50, 200]
    const gini = computeGiniFast(mixed)
    expect(gini).toBeGreaterThanOrEqual(0)
    expect(gini).toBeLessThanOrEqual(1)
  })

  it('handles all-zero distribution', () => {
    const zeros = [0, 0, 0, 0, 0]
    const gini = computeGiniFast(zeros)
    expect(gini).toBe(0)
  })

  it('handles single-agent population', () => {
    const single = [1000]
    const gini = computeGiniFast(single)
    expect(gini).toBe(0)
  })

  it('handles empty array', () => {
    const gini = computeGiniFast([])
    expect(gini).toBe(0)
  })

  it('result is always clamped between 0 and 1', () => {
    // Extreme distributions
    const distributions = [
      [0, 0, 0, 0, 1000000],
      [-500, -500, -500, -500, 1000],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 10000],
      [-1000, -500, 0, 500, 1000],
    ]
    for (const dist of distributions) {
      const gini = computeGiniFast(dist)
      expect(gini).toBeGreaterThanOrEqual(0)
      expect(gini).toBeLessThanOrEqual(1)
    }
  })

  it('agrees with O(n²) reference implementation', () => {
    const dist = [10, 25, 50, 75, 100, 200, 500]
    const fast = computeGiniFast(dist)
    const ref = computeGini(dist)
    expect(fast).toBeCloseTo(ref, 2)
  })

  it('is scale-invariant (multiplying all values by constant preserves Gini)', () => {
    const base = [10, 20, 30, 40, 50]
    const scaled = base.map(v => v * 100)
    expect(computeGiniFast(base)).toBeCloseTo(computeGiniFast(scaled), 3)
  })

  it('increases when inequality increases', () => {
    const equal = [50, 50, 50, 50, 50]
    const unequal = [10, 20, 50, 80, 90]
    const veryUnequal = [1, 5, 10, 50, 500]
    expect(computeGiniFast(equal)).toBeLessThan(computeGiniFast(unequal))
    expect(computeGiniFast(unequal)).toBeLessThan(computeGiniFast(veryUnequal))
  })
})

// ============================================================
// Wealth Distribution Generator Tests
// ============================================================
describe('generateWealthDistribution', () => {
  it('generates correct number of values', () => {
    const rng = createRNG(42)
    const dist = generateWealthDistribution(100, 1000, 0.35, rng)
    expect(dist).toHaveLength(100)
  })

  it('total wealth sums to approximately the target', () => {
    const rng = createRNG(42)
    const totalWealth = 50000
    const dist = generateWealthDistribution(100, totalWealth, 0.35, rng)
    const actualTotal = dist.reduce((a, b) => a + b, 0)
    // Allow 1% tolerance
    expect(actualTotal).toBeCloseTo(totalWealth, -1)
  })

  it('achieves target Gini within ±0.05 tolerance', () => {
    const targets = [0.25, 0.35, 0.45, 0.55]
    for (const targetGini of targets) {
      const rng = createRNG(42)
      const dist = generateWealthDistribution(200, 100000, targetGini, rng)
      const actualGini = computeGiniFast(dist)
      expect(Math.abs(actualGini - targetGini)).toBeLessThan(0.05)
    }
  })

  it('all values are non-negative', () => {
    const rng = createRNG(42)
    const dist = generateWealthDistribution(100, 50000, 0.40, rng)
    for (const v of dist) {
      expect(v).toBeGreaterThanOrEqual(0)
    }
  })

  it('produces different distributions with different seeds', () => {
    const rng1 = createRNG(42)
    const rng2 = createRNG(99)
    const dist1 = generateWealthDistribution(50, 10000, 0.35, rng1)
    const dist2 = generateWealthDistribution(50, 10000, 0.35, rng2)
    // At least some values should differ
    const allSame = dist1.every((v, i) => Math.abs(v - dist2[i]) < 0.001)
    expect(allSame).toBe(false)
  })

  it('produces identical distributions with same seed', () => {
    const rng1 = createRNG(42)
    const rng2 = createRNG(42)
    const dist1 = generateWealthDistribution(50, 10000, 0.35, rng1)
    const dist2 = generateWealthDistribution(50, 10000, 0.35, rng2)
    for (let i = 0; i < dist1.length; i++) {
      expect(dist1[i]).toBeCloseTo(dist2[i], 5)
    }
  })
})

// ============================================================
// PRNG (Seeded Random) Tests
// ============================================================
describe('createRNG', () => {
  it('produces deterministic sequences', () => {
    const rng1 = createRNG(42)
    const rng2 = createRNG(42)
    for (let i = 0; i < 1000; i++) {
      expect(rng1()).toBe(rng2())
    }
  })

  it('different seeds produce different sequences', () => {
    const rng1 = createRNG(42)
    const rng2 = createRNG(43)
    let sameCount = 0
    for (let i = 0; i < 100; i++) {
      if (rng1() === rng2()) sameCount++
    }
    expect(sameCount).toBeLessThan(5) // extremely unlikely to have >5 collisions
  })

  it('values are in [0, 1) range', () => {
    const rng = createRNG(42)
    for (let i = 0; i < 10000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('has reasonable uniformity (chi-squared-like check)', () => {
    const rng = createRNG(42)
    const bins = new Array(10).fill(0)
    const N = 10000
    for (let i = 0; i < N; i++) {
      const bin = Math.floor(rng() * 10)
      bins[Math.min(bin, 9)]++
    }
    const expected = N / 10
    for (const count of bins) {
      // Each bin should be within 20% of expected
      expect(count).toBeGreaterThan(expected * 0.8)
      expect(count).toBeLessThan(expected * 1.2)
    }
  })
})

// ============================================================
// Utility Functions Tests
// ============================================================
describe('clamp', () => {
  it('clamps below minimum', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })
  it('clamps above maximum', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })
  it('passes through values in range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })
  it('handles edge values', () => {
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })
})

describe('lerp', () => {
  it('returns start at t=0', () => {
    expect(lerp(10, 20, 0)).toBe(10)
  })
  it('returns end at t=1', () => {
    expect(lerp(10, 20, 1)).toBe(20)
  })
  it('returns midpoint at t=0.5', () => {
    expect(lerp(10, 20, 0.5)).toBe(15)
  })
})

describe('shuffle', () => {
  it('preserves array length', () => {
    const rng = createRNG(42)
    const arr = [1, 2, 3, 4, 5]
    const shuffled = shuffle([...arr], rng)
    expect(shuffled).toHaveLength(arr.length)
  })
  it('preserves all elements', () => {
    const rng = createRNG(42)
    const arr = [1, 2, 3, 4, 5]
    const shuffled = shuffle([...arr], rng)
    expect(shuffled.sort()).toEqual(arr.sort())
  })
  it('is deterministic with same seed', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const rng1 = createRNG(42)
    const rng2 = createRNG(42)
    expect(shuffle([...arr], rng1)).toEqual(shuffle([...arr], rng2))
  })
})
