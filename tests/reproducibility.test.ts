// ============================================================
// Reproducibility Tests
// Verifies that the simulation produces identical results with the same seed
// ============================================================

import { describe, it, expect } from 'vitest'
import { SimulationEngine } from '../src/simulation/SimulationEngine'
import type { SimulationParams } from '../src/simulation/types'

function makeParams(overrides?: Partial<SimulationParams>): SimulationParams {
  return {
    populationSize: 50,
    totalWealth: 25000,
    startingGini: 0.35,
    averageLifespan: 75,
    ticksPerYear: 52,
    educationMix: { low: 0.4, medium: 0.4, high: 0.2 },
    aiGrowthRate: 0.3,
    aiDiffusionRate: 0.2,
    redistributionLevel: 0.5,
    enableUBI: false,
    economyType: 'industrial',
    immigrationEnabled: false,
    immigrationRate: 1.0,
    diseasesEnabled: true,
    behaviorConfig: {},
    ...overrides,
  }
}

describe('Simulation Reproducibility', () => {
  it('same seed + same params → identical metrics after 10 ticks', () => {
    const seed = 42
    const params = makeParams()

    const engine1 = new SimulationEngine(params, seed)
    engine1.init()
    const engine2 = new SimulationEngine(params, seed)
    engine2.init()

    for (let i = 0; i < 10; i++) {
      engine1.step()
      engine2.step()
    }

    const m1 = engine1.computeMetrics()
    const m2 = engine2.computeMetrics()

    expect(m1.tick).toBe(m2.tick)
    expect(m1.totalPopulation).toBe(m2.totalPopulation)
    expect(m1.giniCoefficient).toBe(m2.giniCoefficient)
    expect(m1.meanWealth).toBe(m2.meanWealth)
    expect(m1.medianWealth).toBe(m2.medianWealth)
    expect(m1.employedCount).toBe(m2.employedCount)
    expect(m1.unemployedCount).toBe(m2.unemployedCount)
    expect(m1.gdp).toBe(m2.gdp)
    expect(m1.automatedJobs).toBe(m2.automatedJobs)
    expect(m1.aiDisplacedJobs).toBe(m2.aiDisplacedJobs)
  })

  it('same seed + same params → identical agent wealth arrays after 20 ticks', () => {
    const seed = 123
    const params = makeParams()

    const engine1 = new SimulationEngine(params, seed)
    engine1.init()
    const engine2 = new SimulationEngine(params, seed)
    engine2.init()

    for (let i = 0; i < 20; i++) {
      engine1.step()
      engine2.step()
    }

    const state1 = engine1.getWorldState()
    const state2 = engine2.getWorldState()

    expect(state1.agents.length).toBe(state2.agents.length)
    for (let i = 0; i < state1.agents.length; i++) {
      expect(state1.agents[i].wealth).toBe(state2.agents[i].wealth)
      expect(state1.agents[i].state).toBe(state2.agents[i].state)
      expect(state1.agents[i].satisfaction).toBe(state2.agents[i].satisfaction)
    }
  })

  it('different seeds → different results', () => {
    const params = makeParams()

    const engine1 = new SimulationEngine(params, 42)
    engine1.init()
    const engine2 = new SimulationEngine(params, 99)
    engine2.init()

    for (let i = 0; i < 20; i++) {
      engine1.step()
      engine2.step()
    }

    const m1 = engine1.computeMetrics()
    const m2 = engine2.computeMetrics()

    // At least some metrics should differ
    const allSame =
      m1.giniCoefficient === m2.giniCoefficient &&
      m1.meanWealth === m2.meanWealth &&
      m1.employedCount === m2.employedCount
    expect(allSame).toBe(false)
  })

  it('reset produces identical results to fresh instantiation', () => {
    const seed = 42
    const params = makeParams()

    // Fresh engine
    const fresh = new SimulationEngine(params, seed)
    fresh.init()
    for (let i = 0; i < 10; i++) fresh.step()
    const freshMetrics = fresh.computeMetrics()

    // Engine that ran, then reset
    const reused = new SimulationEngine(params, 99)
    reused.init()
    for (let i = 0; i < 5; i++) reused.step()
    reused.reset(params, seed)
    for (let i = 0; i < 10; i++) reused.step()
    const reusedMetrics = reused.computeMetrics()

    expect(reusedMetrics.giniCoefficient).toBe(freshMetrics.giniCoefficient)
    expect(reusedMetrics.meanWealth).toBe(freshMetrics.meanWealth)
    expect(reusedMetrics.totalPopulation).toBe(freshMetrics.totalPopulation)
  })
})

describe('Simulation Basic Invariants', () => {
  it('population is always > 0 after init', () => {
    const engine = new SimulationEngine(makeParams(), 42)
    engine.init()
    const state = engine.getWorldState()
    expect(state.agents.length).toBeGreaterThan(0)
  })

  it('all agents have valid states after 50 ticks', () => {
    const engine = new SimulationEngine(makeParams(), 42)
    engine.init()
    for (let i = 0; i < 50; i++) engine.step()

    const validStates = ['employed', 'unemployed', 'retired', 'criminal', 'dead', 'child', 'business_owner', 'police']
    for (const agent of engine.getWorldState().agents) {
      expect(validStates).toContain(agent.state)
    }
  })

  it('Gini coefficient stays in [0, 1] over 100 ticks', () => {
    const engine = new SimulationEngine(makeParams(), 42)
    engine.init()
    for (let i = 0; i < 100; i++) {
      engine.step()
      const m = engine.computeMetrics()
      expect(m.giniCoefficient).toBeGreaterThanOrEqual(0)
      expect(m.giniCoefficient).toBeLessThanOrEqual(1)
    }
  })

  it('wealth floor is respected (-500)', () => {
    const engine = new SimulationEngine(makeParams(), 42)
    engine.init()
    for (let i = 0; i < 100; i++) engine.step()
    for (const agent of engine.getWorldState().agents) {
      if (agent.state !== 'dead') {
        expect(agent.wealth).toBeGreaterThanOrEqual(-500)
      }
    }
  })

  it('wealthArchive grows each tick', () => {
    const engine = new SimulationEngine(makeParams(), 42)
    engine.init()
    const initialLen = engine.getWorldState().agents[0]?.wealthArchive?.length ?? 0

    for (let i = 0; i < 10; i++) engine.step()

    const finalLen = engine.getWorldState().agents[0]?.wealthArchive?.length ?? 0
    expect(finalLen).toBeGreaterThan(initialLen)
  })

  it('stateHistory records transitions', () => {
    const engine = new SimulationEngine(makeParams({ populationSize: 100 }), 42)
    engine.init()
    // Run enough ticks for state transitions to happen
    for (let i = 0; i < 200; i++) engine.step()

    const agents = engine.getWorldState().agents
    // At least some agents should have state transitions
    const agentsWithTransitions = agents.filter(a => a.stateHistory.length > 1)
    expect(agentsWithTransitions.length).toBeGreaterThan(0)
  })

  it('total jobs + automated slots are non-negative', () => {
    const engine = new SimulationEngine(makeParams(), 42)
    engine.init()
    for (let i = 0; i < 100; i++) {
      engine.step()
      const m = engine.computeMetrics()
      expect(m.totalJobs).toBeGreaterThanOrEqual(0)
      expect(m.automatedJobs).toBeGreaterThanOrEqual(0)
      expect(m.aiDisplacedJobs).toBeGreaterThanOrEqual(0)
    }
  })
})
