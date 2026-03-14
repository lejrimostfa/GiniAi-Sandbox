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
// Uses a Pareto-like distribution scaled to target Gini
// ============================================================
export function generateWealthDistribution(
  count: number,
  totalWealth: number,
  targetGini: number,
  rng: RNG,
): number[] {
  // Use exponential distribution with shape parameter derived from Gini
  // For exponential: Gini = 0.5, for uniform: Gini ≈ 0.33
  // We use a power-law: Gini ≈ 1/(2*alpha - 1) for Pareto
  // Invert: alpha ≈ (1 + 1/(2*Gini)) / 2 ... simplified approach:
  
  // Shape parameter: higher = more equal
  const shape = Math.max(0.1, (1 - targetGini) * 3)
  
  const raw: number[] = []
  for (let i = 0; i < count; i++) {
    // Generate from power distribution
    const u = rng()
    raw.push(Math.pow(1 - u, -1 / shape) - 1)
  }
  
  // Normalize to total wealth
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
// ============================================================
export function computeGiniFast(values: number[]): number {
  const n = values.length
  if (n === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  if (mean === 0) return 0
  
  let numerator = 0
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i]
  }
  return numerator / (n * n * mean)
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
