// ============================================================
// SensitivityAnalysis — One-At-a-Time (OAT) sensitivity analysis
// Varies each parameter independently while holding others at baseline.
// Reports impact on key output metrics (Gini, GDP, unemployment, etc.)
// ============================================================

import { runSingle } from './BatchRunner'
import type { SimulationParams, SimMetrics } from '../types'
import { DEFAULT_PARAMS } from '../types'

// ============================================================
// Types
// ============================================================

export interface SensitivityParam {
  name: string
  key: keyof SimulationParams
  baseValue: number
  values: number[]       // values to test
  unit: string           // e.g., '%', '$', 'rate'
}

export interface SensitivityResult {
  param: SensitivityParam
  outcomes: SensitivityOutcome[]
}

export interface SensitivityOutcome {
  paramValue: number
  gini: number
  meanWealth: number
  unemploymentRate: number
  gdp: number
  satisfaction: number
  crimeRate: number
  automationRate: number
}

export interface SensitivityReport {
  baseline: SensitivityOutcome
  results: SensitivityResult[]
  elasticities: SensitivityElasticity[]
  timestamp: string
  config: { seed: number; totalTicks: number; populationSize: number }
}

export interface SensitivityElasticity {
  paramName: string
  giniElasticity: number       // % change in Gini per % change in param
  gdpElasticity: number
  unemploymentElasticity: number
  satisfactionElasticity: number
}

// ============================================================
// Default parameters to analyze
// ============================================================
export function defaultSensitivityParams(): SensitivityParam[] {
  return [
    {
      name: 'AI Growth Rate',
      key: 'aiGrowthRate',
      baseValue: DEFAULT_PARAMS.aiGrowthRate,
      values: [0, 0.05, 0.10, 0.15, 0.20, 0.30],
      unit: 'rate/yr',
    },
    {
      name: 'AI Diffusion Rate',
      key: 'aiDiffusionRate',
      baseValue: DEFAULT_PARAMS.aiDiffusionRate,
      values: [0, 0.05, 0.10, 0.20, 0.30, 0.40],
      unit: 'rate/yr',
    },
    {
      name: 'Redistribution Level',
      key: 'redistributionLevel',
      baseValue: DEFAULT_PARAMS.redistributionLevel,
      values: [0, 0.10, 0.20, 0.30, 0.50, 0.70, 1.0],
      unit: '0-1',
    },
    {
      name: 'Starting Gini',
      key: 'startingGini',
      baseValue: DEFAULT_PARAMS.startingGini,
      values: [0.15, 0.25, 0.35, 0.45, 0.55, 0.65],
      unit: 'index',
    },
    {
      name: 'Immigration Rate',
      key: 'immigrationRate',
      baseValue: 0.5,  // midpoint — tests both directions (closed→open economy)
      values: [0, 0.25, 0.50, 0.75, 1.0],
      unit: '0-1',
    },
  ]
}

// ============================================================
// Extract outcome from final metrics
// ============================================================
function metricsToOutcome(m: SimMetrics): SensitivityOutcome {
  const pop = m.totalPopulation
  return {
    paramValue: 0,  // filled by caller
    gini: m.giniCoefficient,
    meanWealth: m.meanWealth,
    unemploymentRate: pop > 0 ? m.unemployedCount / pop : 0,
    gdp: m.gdp,
    satisfaction: m.meanSatisfaction,
    crimeRate: m.crimeRate,
    automationRate: m.totalDisplacementRate,
  }
}

// ============================================================
// Run OAT sensitivity analysis
// ============================================================
export async function runSensitivityAnalysis(
  options?: {
    seed?: number
    totalTicks?: number
    populationSize?: number
    params?: SensitivityParam[]
    baseParams?: SimulationParams
  },
  onProgress?: (completed: number, total: number, currentParam: string) => void,
): Promise<SensitivityReport> {
  const seed = options?.seed ?? 42
  const totalTicks = options?.totalTicks ?? 520     // 10 years
  const populationSize = options?.populationSize ?? 100
  const sensitivityParams = options?.params ?? defaultSensitivityParams()
  const baseParams: SimulationParams = {
    ...(options?.baseParams ?? DEFAULT_PARAMS),
    populationSize,
    immigrationEnabled: true,  // must be on for immigrationRate sensitivity to have effect
  }

  // Total runs = 1 baseline + sum of all param values
  const totalRuns = 1 + sensitivityParams.reduce((s, p) => s + p.values.length, 0)
  let completed = 0

  // Run baseline
  const baseResult = runSingle(baseParams, seed, totalTicks, totalTicks)
  const baseline = { ...metricsToOutcome(baseResult.finalMetrics), paramValue: 0 }
  completed++
  onProgress?.(completed, totalRuns, 'Baseline')

  // Run each parameter variation
  const results: SensitivityResult[] = []

  for (const sp of sensitivityParams) {
    const outcomes: SensitivityOutcome[] = []

    for (const value of sp.values) {
      const params = { ...baseParams, [sp.key]: value }
      const result = runSingle(params, seed, totalTicks, totalTicks)
      outcomes.push({
        ...metricsToOutcome(result.finalMetrics),
        paramValue: value,
      })

      completed++
      onProgress?.(completed, totalRuns, sp.name)

      // Yield to event loop
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    results.push({ param: sp, outcomes })
  }

  // Compute elasticities
  const elasticities = results.map(r => computeElasticity(r, baseline))

  return {
    baseline,
    results,
    elasticities,
    timestamp: new Date().toISOString(),
    config: { seed, totalTicks, populationSize },
  }
}

// ============================================================
// Compute elasticity (% change in output per % change in input)
// ============================================================
function computeElasticity(
  result: SensitivityResult,
  baseline: SensitivityOutcome,
): SensitivityElasticity {
  const baseVal = result.param.baseValue
  if (baseVal === 0) {
    return {
      paramName: result.param.name,
      giniElasticity: 0,
      gdpElasticity: 0,
      unemploymentElasticity: 0,
      satisfactionElasticity: 0,
    }
  }

  // Find the outcome most distant from baseValue (maximizes signal-to-noise)
  // This is more robust than looking for 2× base, which fails for bounded params (e.g., rate=1.0)
  const closest = result.outcomes.reduce((best, o) =>
    Math.abs(o.paramValue - baseVal) > Math.abs(best.paramValue - baseVal) ? o : best
  )

  const pctChangeParam = (closest.paramValue - baseVal) / baseVal
  if (Math.abs(pctChangeParam) < 0.001) {
    return {
      paramName: result.param.name,
      giniElasticity: 0,
      gdpElasticity: 0,
      unemploymentElasticity: 0,
      satisfactionElasticity: 0,
    }
  }

  const elasticity = (metric: number, baseMet: number) => {
    if (Math.abs(baseMet) < 0.0001) return 0
    return ((metric - baseMet) / baseMet) / pctChangeParam
  }

  return {
    paramName: result.param.name,
    giniElasticity: elasticity(closest.gini, baseline.gini),
    gdpElasticity: elasticity(closest.gdp, baseline.gdp),
    unemploymentElasticity: elasticity(closest.unemploymentRate, baseline.unemploymentRate),
    satisfactionElasticity: elasticity(closest.satisfaction, baseline.satisfaction),
  }
}

// ============================================================
// Export report as CSV
// ============================================================
export function sensitivityReportToCSV(report: SensitivityReport): string {
  const headers = ['parameter', 'value', 'gini', 'meanWealth', 'unemploymentRate', 'gdp', 'satisfaction', 'crimeRate', 'automationRate']

  const rows: string[] = []

  // Baseline
  const b = report.baseline
  rows.push(['BASELINE', '0', b.gini.toFixed(6), b.meanWealth.toFixed(2), b.unemploymentRate.toFixed(6), b.gdp.toFixed(2), b.satisfaction.toFixed(4), b.crimeRate.toFixed(4), b.automationRate.toFixed(6)].join(','))

  // Per-parameter outcomes
  for (const r of report.results) {
    for (const o of r.outcomes) {
      rows.push([
        r.param.name,
        o.paramValue.toString(),
        o.gini.toFixed(6),
        o.meanWealth.toFixed(2),
        o.unemploymentRate.toFixed(6),
        o.gdp.toFixed(2),
        o.satisfaction.toFixed(4),
        o.crimeRate.toFixed(4),
        o.automationRate.toFixed(6),
      ].join(','))
    }
  }

  return [headers.join(','), ...rows].join('\n')
}
