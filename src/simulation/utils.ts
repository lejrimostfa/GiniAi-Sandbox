// --- Simulation Utilities ---
// Random, distribution, and math helpers for the ABM engine

// ============================================================
// Seeded PRNG (Mulberry32) for reproducible simulations
// ============================================================
export function createRNG(seed: number) {
  let s = seed | 0
  return function random(): number {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type RNG = ReturnType<typeof createRNG>

// ============================================================
// Gini-based wealth distribution
// Generate N wealth values with a target Gini coefficient
// Uses power distribution X = U^k with binary search over k to hit target Gini.
// k < 1 → more equal (Gini < 0.33), k = 1 → uniform (Gini ≈ 0.33), k > 1 → more unequal.
// ============================================================
export function generateWealthDistribution(
  count: number,
  totalWealth: number,
  targetGini: number,
  rng: RNG,
): number[] {
  const clampedGini = Math.max(0.02, Math.min(0.95, targetGini))

  // Pre-generate uniform samples (reused across binary search iterations)
  const uniforms: number[] = []
  for (let i = 0; i < count; i++) uniforms.push(rng())

  // Binary search for exponent k that produces target Gini
  let lo = 0.01, hi = 80.0
  let bestK = 1.0

  for (let iter = 0; iter < 30; iter++) {
    const mid = (lo + hi) / 2
    const trial = uniforms.map((u) => Math.pow(u, mid))
    const trialSum = trial.reduce((a, b) => a + b, 0)
    const scaled = trial.map((v) => (v / trialSum) * totalWealth)
    const g = computeGiniFast(scaled)
    if (Math.abs(g - clampedGini) < 0.003) { bestK = mid; break }
    // Higher k → higher Gini (more inequality)
    if (g < clampedGini) { lo = mid } else { hi = mid }
    bestK = mid
  }

  const raw = uniforms.map((u) => Math.pow(u, bestK))
  const sum = raw.reduce((a, b) => a + b, 0)
  const scale = totalWealth / sum
  return raw.map((v) => Math.max(0, v * scale))
}

// ============================================================
// Compute Gini coefficient from array of values
// ============================================================
export function computeGini(values: number[]): number {
  const n = values.length
  if (n === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  if (mean === 0) return 0
  
  let sumDiff = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i] - sorted[j])
    }
  }
  return sumDiff / (2 * n * n * mean)
}

// ============================================================
// Fast approximate Gini (O(n log n) instead of O(n²))
// Handles negative wealth via floor-shift: all values are shifted so that
// the minimum becomes 0, then the standard Gini is computed.
// This is the established econometric approach (Chen, Tsaur & Rhai 1982):
//   shifted_i = x_i - min(x)   →   all shifted_i ≥ 0
// Preserves relative differences and correctly reports high inequality when
// most agents are in debt but a few are wealthy.
// ============================================================
export function computeGiniFast(values: number[]): number {
  const n = values.length
  if (n === 0) return 0

  // Floor-shift: translate so minimum wealth = 0
  const minVal = Math.min(...values)
  const shifted = minVal < 0 ? values.map((v) => v - minVal) : values
  const sorted = [...shifted].sort((a, b) => a - b)

  const mean = sorted.reduce((s, v) => s + v, 0) / n
  if (mean === 0) return 0 // everyone is equal (all same value before shift)

  // Standard sorted-order Gini: G = Σ (2i - n - 1) * x[i] / (n² * μ)
  let numerator = 0
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i]
  }
  return Math.min(1, Math.max(0, numerator / (n * n * mean)))
}

// ============================================================
// Pick random element from array
// ============================================================
export function pickRandom<T>(arr: T[], rng: RNG): T | undefined {
  if (arr.length === 0) return undefined
  return arr[Math.floor(rng() * arr.length)]
}

// ============================================================
// Shuffle array in place (Fisher-Yates)
// ============================================================
export function shuffle<T>(arr: T[], rng: RNG): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ============================================================
// Clamp value between min and max
// ============================================================
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ============================================================
// Linear interpolation
// ============================================================
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// ============================================================
// Unique ID generator
// ============================================================
let idCounter = 0
export function uid(prefix: string = 'id'): string {
  return `${prefix}_${++idCounter}`
}

export function resetUidCounter(): void {
  idCounter = 0
}

// ============================================================
// Median of array
// ============================================================
export function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}
