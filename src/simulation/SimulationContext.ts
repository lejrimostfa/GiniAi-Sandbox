// ============================================================
// SimulationContext — shared mutable state passed to all systems
// Each system reads/writes from this context during its process() call
// ============================================================

import type { Agent, Location, SimulationParams, MoneyEvent } from './types'
import type { RNG } from './utils'

export interface SimulationContext {
  // --- Core state ---
  agents: Agent[]
  locations: Location[]
  params: SimulationParams
  tick: number
  rng: RNG

  // --- Per-tick counters (reset at start of each tick) ---
  tickBirths: number
  tickDeaths: number
  tickDivorces: number
  tickMarriages: number
  tickPrematureDeaths: number
  tickDiseases: number
  tickCrimes: number
  tickLayoffs: number
  tickTaxRevenue: number
  tickRedistribution: number
  tickArrests: number
  tickStrikers: number

  // --- Government treasury (persistent across ticks) ---
  governmentTreasury: number
  tickGovExpPensions: number
  tickGovExpInfra: number
  tickGovExpBenefits: number
  tickGovExpPolice: number
  tickGovExpUBI: number

  // --- Cumulative automation counters ---
  cumulativeAutomatedJobs: number
  cumulativeAiDisplacedJobs: number
  cumulativeRoboticFired: number
  cumulativeAiFired: number

  // --- Rolling window buffers ---
  recentBirths: number[]
  recentCrimes: number[]
  recentDiseases: number[]

  // --- Money events for floating indicators ---
  moneyEvents: MoneyEvent[]

  // --- Event emission ---
  emit: (type: string, data: unknown) => void

  // --- Derived helpers (from params) ---
  getRetirementAge: () => number
  getMaxAge: () => number
  consumptionInterval: number
  currentWeekOfYear: () => number
  isAnnualQuarter: (fraction: number) => boolean

  // --- Movement helpers (will be populated by engine) ---
  sendToNearest: (agent: Agent, locType: string) => void
  sendToHiringWorkplace: (agent: Agent) => void
  killAgent: (agent: Agent, reason: string) => void
  fireAgent: (agent: Agent, reason: 'fired' | 'automated' | 'ai_displaced' | 'economic_layoff') => void

  // --- Business helpers ---
  bankruptBusiness: (owner: Agent) => void
  createBusiness: (agent: Agent) => void

  // --- Housing helpers ---
  expandHousingIfNeeded: () => void
  reassignHomelessAgents: () => void

  // --- Metrics (read-only snapshot for guards) ---
  totalDisplacementRate: number
  getVacancyRate: () => number
}

// --- Reset per-tick counters ---
export function resetTickCounters(ctx: SimulationContext): void {
  ctx.moneyEvents = []
  ctx.tickBirths = 0
  ctx.tickDeaths = 0
  ctx.tickDivorces = 0
  ctx.tickMarriages = 0
  ctx.tickPrematureDeaths = 0
  ctx.tickDiseases = 0
  ctx.tickCrimes = 0
  ctx.tickLayoffs = 0
  ctx.tickTaxRevenue = 0
  ctx.tickRedistribution = 0
  ctx.tickArrests = 0
  ctx.tickStrikers = 0
  ctx.tickGovExpPensions = 0
  ctx.tickGovExpInfra = 0
  ctx.tickGovExpBenefits = 0
  ctx.tickGovExpPolice = 0
  ctx.tickGovExpUBI = 0
}
