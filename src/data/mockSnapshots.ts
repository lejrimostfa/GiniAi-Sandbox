// --- Mock Snapshot Generator ---
// Generates plausible evolving socio-economic patterns for testing
// Will be replaced by real backend data via DataProvider

import type { Snapshot, Cell, SnapshotMetrics, CellState, SimParams } from '../types/simulation'
import { DEFAULT_SIM_PARAMS } from '../types/simulation'

/** Simple seeded PRNG (mulberry32) */
function createRng(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Compute Gini coefficient from an array of values */
function computeGini(values: number[]): number {
  const n = values.length
  if (n === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  let sum = 0
  let weightedSum = 0
  for (let i = 0; i < n; i++) {
    sum += sorted[i]
    weightedSum += (i + 1) * sorted[i]
  }
  if (sum === 0) return 0
  return (2 * weightedSum) / (n * sum) - (n + 1) / n
}

/** Simple flood-fill to find connected clusters of precarious agents */
function findClusters(cells: Cell[], width: number, height: number): Map<number, number> {
  const grid = new Map<string, Cell>()
  for (const c of cells) grid.set(`${c.x},${c.y}`, c)

  const visited = new Set<string>()
  const clusterSizes: number[] = []
  const cellCluster = new Map<number, number>()

  function floodFill(startX: number, startY: number, clusterId: number): number {
    const stack: [number, number][] = [[startX, startY]]
    let size = 0
    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!
      const key = `${cx},${cy}`
      if (visited.has(key)) continue
      const cell = grid.get(key)
      if (!cell || cell.state !== 'P') continue
      visited.add(key)
      size++
      const idx = cy * width + cx
      cellCluster.set(idx, clusterId)
      // 4-connected neighbors
      if (cx > 0) stack.push([cx - 1, cy])
      if (cx < width - 1) stack.push([cx + 1, cy])
      if (cy > 0) stack.push([cx, cy - 1])
      if (cy < height - 1) stack.push([cx, cy + 1])
    }
    return size
  }

  let clusterId = 0
  for (const cell of cells) {
    if (cell.state === 'P' && !visited.has(`${cell.x},${cell.y}`)) {
      const size = floodFill(cell.x, cell.y, clusterId)
      clusterSizes.push(size)
      clusterId++
    }
  }

  return cellCluster
}

/** Generate a single snapshot for a given step and params */
function generateSnapshot(step: number, params: SimParams, prevCells?: Cell[]): Snapshot {
  const { gridWidth, gridHeight, automationIntensity, ownershipConcentration, redistributionLevel, seed } = params
  const rng = createRng(seed + step * 137)
  const totalCells = gridWidth * gridHeight
  const cells: Cell[] = []

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const idx = y * gridWidth + x

      // Spatial bias: owners cluster in top-right, precarious in bottom-left
      const ownerBias = ((x / gridWidth) * 0.5 + (y / gridHeight) * 0.5) * ownershipConcentration
      const precBias = ((1 - x / gridWidth) * 0.4 + (1 - y / gridHeight) * 0.4) * automationIntensity

      // Time-evolving probabilities
      const timeDecay = Math.min(step / 50, 1)
      const pOwner = ownerBias * (0.5 + 0.5 * timeDecay) + rng() * 0.05
      const pPrec = precBias * (0.3 + 0.7 * timeDecay) + rng() * 0.08

      let state: CellState
      const roll = rng()
      if (roll < pOwner) {
        state = 'O'
      } else if (roll < pOwner + pPrec) {
        state = 'P'
      } else {
        state = 'W'
      }

      // Previous state influence (persistence)
      if (prevCells && prevCells[idx]) {
        const prev = prevCells[idx]
        if (rng() < 0.7) state = prev.state // 70% persistence
      }

      // Resource: owners high, workers medium, precarious low
      let resource: number
      if (state === 'O') {
        resource = 0.5 + rng() * 0.5
      } else if (state === 'W') {
        resource = 0.2 + rng() * 0.4
      } else {
        resource = rng() * 0.25
      }

      // Stress: higher for precarious, affected by local density
      let stress: number
      if (state === 'P') {
        stress = 0.4 + rng() * 0.5
      } else if (state === 'W') {
        stress = rng() * 0.3
      } else {
        stress = rng() * 0.1
      }

      // Redistribution: applies to precarious agents when rho > 0
      let redistribution = 0
      if (state === 'P' && redistributionLevel > 0) {
        redistribution = redistributionLevel * (0.3 + rng() * 0.7)
        stress *= (1 - redistribution * 0.3) // redistribution reduces stress
        resource += redistribution * 0.2
      }

      const deprived = state === 'P' && resource < 0.1

      cells.push({
        x, y, state, resource, stress, redistribution, deprived,
      })
    }
  }

  // Compute local densities
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const idx = y * gridWidth + x
      let oCount = 0, pCount = 0, total = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
            const nIdx = ny * gridWidth + nx
            if (cells[nIdx].state === 'O') oCount++
            if (cells[nIdx].state === 'P') pCount++
            total++
          }
        }
      }
      cells[idx].ownerLocalDensity = oCount / total
      cells[idx].precariousLocalDensity = pCount / total
    }
  }

  // Cluster IDs
  const clusterMap = findClusters(cells, gridWidth, gridHeight)
  for (const [idx, cid] of clusterMap) {
    cells[idx].clusterId = cid
  }

  // Compute metrics
  const wCount = cells.filter(c => c.state === 'W').length
  const pCount = cells.filter(c => c.state === 'P').length
  const oCount = cells.filter(c => c.state === 'O').length
  const resources = cells.map(c => c.resource)

  // Cluster sizes for precarious
  const clusterSizeMap = new Map<number, number>()
  for (const cell of cells) {
    if (cell.clusterId !== undefined) {
      clusterSizeMap.set(cell.clusterId, (clusterSizeMap.get(cell.clusterId) || 0) + 1)
    }
  }
  const clusterSizes = [...clusterSizeMap.values()]

  const metrics: SnapshotMetrics = {
    workerShare: wCount / totalCells,
    precariousShare: pCount / totalCells,
    ownerShare: oCount / totalCells,
    gini: computeGini(resources),
    deprivationShare: cells.filter(c => c.deprived).length / totalCells,
    mobilityPW: 0.05 + rng() * 0.1 * (1 - automationIntensity),
    mobilityWP: 0.03 + rng() * 0.15 * automationIntensity,
    largestPrecariousCluster: clusterSizes.length > 0 ? Math.max(...clusterSizes) : 0,
    meanClusterSize: clusterSizes.length > 0 ? clusterSizes.reduce((a, b) => a + b, 0) / clusterSizes.length : 0,
    redistributionLevel: redistributionLevel,
    stressIndex: cells.reduce((sum, c) => sum + c.stress, 0) / totalCells,
  }

  return { step, gridWidth, gridHeight, cells, metrics }
}

/** Generate a timeline of N snapshots */
export function generateTimeline(numSteps: number = 100, params: SimParams = DEFAULT_SIM_PARAMS): Snapshot[] {
  const timeline: Snapshot[] = []
  let prevCells: Cell[] | undefined

  for (let step = 0; step < numSteps; step++) {
    const snapshot = generateSnapshot(step, params, prevCells)
    timeline.push(snapshot)
    prevCells = snapshot.cells
  }

  return timeline
}
