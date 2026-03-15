// ============================================================
// BatchRunner — Headless multi-seed Monte Carlo simulation runner
// Runs N simulations with different seeds and aggregates results.
// Can be used by CLI scripts or by the UI qualification panel.
// ============================================================

import { SimulationEngine } from '../SimulationEngine'
import type { SimulationParams, SimMetrics } from '../types'
import { DEFAULT_PARAMS } from '../types'
// computeGiniFast available via engine internals — not needed here directly

// ============================================================
// Types
// ============================================================

export interface BatchConfig {
  params: SimulationParams
  seeds: number[]           // list of seeds to run
  totalTicks: number        // how many ticks per run
  snapshotInterval: number  // record metrics every N ticks (1 = every tick)
}

export interface RunResult {
  seed: number
  finalMetrics: SimMetrics
  metricsTimeSeries: SimMetrics[]  // snapshots at snapshotInterval
  durationMs: number
}

export interface BatchResult {
  config: BatchConfig
  runs: RunResult[]
  aggregate: AggregateStats
  timestamp: string
}

export interface AggregateStats {
  // Gini
  giniMean: number
  giniStd: number
  giniMin: number
  giniMax: number
  giniValues: number[]
  // Wealth
  meanWealthMean: number
  meanWealthStd: number
  medianWealthMean: number
  medianWealthStd: number
  // Employment
  unemploymentRateMean: number
  unemploymentRateStd: number
  // GDP
  gdpMean: number
  gdpStd: number
  // Automation
  automationRateMean: number
  automationRateStd: number
  // Population
  populationMean: number
  // Satisfaction
  satisfactionMean: number
  satisfactionStd: number
  // Crime
  crimeRateMean: number
  crimeRateStd: number
  // Reproducibility check
  isReproducible: boolean  // true if same seed produces identical results
}

// ============================================================
// Utility: standard deviation
// ============================================================
function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1)
  return Math.sqrt(variance)
}

// ============================================================
// Default batch configuration
// ============================================================
export function defaultBatchConfig(overrides?: Partial<BatchConfig>): BatchConfig {
  const numSeeds = 30
  const seeds = Array.from({ length: numSeeds }, (_, i) => 42 + i * 7)
  return {
    params: { ...DEFAULT_PARAMS, populationSize: 100 },
    seeds,
    totalTicks: 520,      // 10 years
    snapshotInterval: 52,  // yearly snapshots
    ...overrides,
  }
}

// ============================================================
// Run a single simulation (headless)
// ============================================================
export function runSingle(
  params: SimulationParams,
  seed: number,
  totalTicks: number,
  snapshotInterval: number,
): RunResult {
  const t0 = performance.now()
  const engine = new SimulationEngine(params, seed)
  engine.init()

  const timeSeries: SimMetrics[] = []

  for (let t = 1; t <= totalTicks; t++) {
    engine.step()
    if (t % snapshotInterval === 0 || t === totalTicks) {
      timeSeries.push(engine.computeMetrics())
    }
  }

  const finalMetrics = engine.computeMetrics()
  const durationMs = performance.now() - t0

  return { seed, finalMetrics, metricsTimeSeries: timeSeries, durationMs }
}

// ============================================================
// Run full batch (synchronous — suitable for Web Worker or CLI)
// ============================================================
export function runBatch(
  config: BatchConfig,
  onProgress?: (completed: number, total: number) => void,
): BatchResult {
  const runs: RunResult[] = []

  for (let i = 0; i < config.seeds.length; i++) {
    const result = runSingle(
      config.params,
      config.seeds[i],
      config.totalTicks,
      config.snapshotInterval,
    )
    runs.push(result)
    onProgress?.(i + 1, config.seeds.length)
  }

  const aggregate = computeAggregate(runs, config)

  return {
    config,
    runs,
    aggregate,
    timestamp: new Date().toISOString(),
  }
}

// ============================================================
// Run batch incrementally (yields control between runs for UI)
// ============================================================
export async function runBatchAsync(
  config: BatchConfig,
  onProgress?: (completed: number, total: number, partial?: AggregateStats) => void,
): Promise<BatchResult> {
  const runs: RunResult[] = []

  for (let i = 0; i < config.seeds.length; i++) {
    const result = runSingle(
      config.params,
      config.seeds[i],
      config.totalTicks,
      config.snapshotInterval,
    )
    runs.push(result)

    // Yield to event loop every run for UI responsiveness
    await new Promise(resolve => setTimeout(resolve, 0))

    const partial = runs.length >= 2 ? computeAggregate(runs, config) : undefined
    onProgress?.(i + 1, config.seeds.length, partial)
  }

  const aggregate = computeAggregate(runs, config)

  return {
    config,
    runs,
    aggregate,
    timestamp: new Date().toISOString(),
  }
}

// ============================================================
// Compute aggregate statistics from completed runs
// ============================================================
function computeAggregate(runs: RunResult[], config: BatchConfig): AggregateStats {
  const ginis = runs.map(r => r.finalMetrics.giniCoefficient)
  const meanWealths = runs.map(r => r.finalMetrics.meanWealth)
  const medianWealths = runs.map(r => r.finalMetrics.medianWealth)
  const unemploymentRates = runs.map(r => {
    const pop = r.finalMetrics.totalPopulation
    return pop > 0 ? r.finalMetrics.unemployedCount / pop : 0
  })
  const gdps = runs.map(r => r.finalMetrics.gdp)
  const automationRates = runs.map(r => r.finalMetrics.totalDisplacementRate)
  const populations = runs.map(r => r.finalMetrics.totalPopulation)
  const satisfactions = runs.map(r => r.finalMetrics.meanSatisfaction)
  const crimeRates = runs.map(r => r.finalMetrics.crimeRate)

  // Reproducibility check: run seed[0] twice, compare
  let isReproducible = true
  if (config.seeds.length > 0) {
    const check1 = runSingle(config.params, config.seeds[0], Math.min(config.totalTicks, 52), config.snapshotInterval)
    const check2 = runSingle(config.params, config.seeds[0], Math.min(config.totalTicks, 52), config.snapshotInterval)
    isReproducible =
      check1.finalMetrics.giniCoefficient === check2.finalMetrics.giniCoefficient &&
      check1.finalMetrics.meanWealth === check2.finalMetrics.meanWealth &&
      check1.finalMetrics.totalPopulation === check2.finalMetrics.totalPopulation
  }

  return {
    giniMean: mean(ginis),
    giniStd: std(ginis),
    giniMin: Math.min(...ginis),
    giniMax: Math.max(...ginis),
    giniValues: ginis,
    meanWealthMean: mean(meanWealths),
    meanWealthStd: std(meanWealths),
    medianWealthMean: mean(medianWealths),
    medianWealthStd: std(medianWealths),
    unemploymentRateMean: mean(unemploymentRates),
    unemploymentRateStd: std(unemploymentRates),
    gdpMean: mean(gdps),
    gdpStd: std(gdps),
    automationRateMean: mean(automationRates),
    automationRateStd: std(automationRates),
    populationMean: mean(populations),
    satisfactionMean: mean(satisfactions),
    satisfactionStd: std(satisfactions),
    crimeRateMean: mean(crimeRates),
    crimeRateStd: std(crimeRates),
    isReproducible,
  }
}

// ============================================================
// Export results as CSV string
// ============================================================
export function batchResultToCSV(result: BatchResult): string {
  const headers = [
    'seed', 'gini', 'meanWealth', 'medianWealth', 'unemploymentRate',
    'gdp', 'gdpPerCapita', 'automationRate', 'aiDisplacementRate',
    'population', 'satisfaction', 'crimeRate', 'diseaseRate',
    'births', 'deaths', 'durationMs',
  ]

  const rows = result.runs.map(r => {
    const m = r.finalMetrics
    const pop = m.totalPopulation
    return [
      r.seed,
      m.giniCoefficient.toFixed(6),
      m.meanWealth.toFixed(2),
      m.medianWealth.toFixed(2),
      pop > 0 ? (m.unemployedCount / pop).toFixed(6) : '0',
      m.gdp.toFixed(2),
      m.gdpPerCapita.toFixed(2),
      m.automationRate.toFixed(6),
      m.aiDisplacementRate.toFixed(6),
      pop,
      m.meanSatisfaction.toFixed(4),
      m.crimeRate.toFixed(4),
      m.diseaseRate.toFixed(4),
      m.births,
      m.deaths,
      r.durationMs.toFixed(0),
    ].join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}

// ============================================================
// Export time series as CSV string
// ============================================================
export function timeSeriesCSV(result: BatchResult): string {
  const headers = ['seed', 'tick', 'year', 'gini', 'meanWealth', 'medianWealth', 'unemploymentRate', 'gdp', 'satisfaction']

  const rows: string[] = []
  for (const run of result.runs) {
    for (const m of run.metricsTimeSeries) {
      const pop = m.totalPopulation
      rows.push([
        run.seed,
        m.tick,
        m.year,
        m.giniCoefficient.toFixed(6),
        m.meanWealth.toFixed(2),
        m.medianWealth.toFixed(2),
        pop > 0 ? (m.unemployedCount / pop).toFixed(6) : '0',
        m.gdp.toFixed(2),
        m.meanSatisfaction.toFixed(4),
      ].join(','))
    }
  }

  return [headers.join(','), ...rows].join('\n')
}
