// --- Simulation Data Model Types ---
// Core types for the socio-economic simulation snapshots

/** Agent state: Worker, Precarious, or Owner */
export type CellState = 'W' | 'P' | 'O'

/** Single cell/agent in the simulation grid */
export interface Cell {
  x: number
  y: number
  state: CellState
  resource: number
  stress: number
  redistribution: number
  // Optional extended fields
  clusterId?: number
  ownerLocalDensity?: number
  precariousLocalDensity?: number
  deprived?: boolean
}

/** Aggregate metrics for one simulation snapshot */
export interface SnapshotMetrics {
  workerShare: number
  precariousShare: number
  ownerShare: number
  gini: number
  deprivationShare: number
  mobilityPW: number   // P -> W transitions
  mobilityWP: number   // W -> P transitions
  largestPrecariousCluster: number
  meanClusterSize: number
  redistributionLevel: number
  stressIndex?: number
}

/** One time-step snapshot from the simulation */
export interface Snapshot {
  step: number
  gridWidth: number
  gridHeight: number
  cells: Cell[]
  metrics: SnapshotMetrics
}

/** Parameters that drive the simulation (mock or backend) */
export interface SimParams {
  automationIntensity: number  // r: [0, 1]
  ownershipConcentration: number // q: [0, 1]
  redistributionLevel: number   // rho: [0, 1]
  seed: number
  gridWidth: number
  gridHeight: number
}

/** Default simulation parameters */
export const DEFAULT_SIM_PARAMS: SimParams = {
  automationIntensity: 0.3,
  ownershipConcentration: 0.15,
  redistributionLevel: 0.2,
  seed: 42,
  gridWidth: 30,
  gridHeight: 30,
}
