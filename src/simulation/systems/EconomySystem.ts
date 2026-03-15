// ============================================================
// EconomySystem — satisfaction decay, consumption, business creation
// Users can modify economic mechanics by editing this file
// ============================================================

import type { SimulationContext } from '../SimulationContext'
import { clamp } from '../utils'
import {
  BANKRUPTCY_THRESHOLD,
} from '../constants'

// ============================================================
// Main economy processing — called once per tick
// ============================================================
export function processEconomy(ctx: SimulationContext): void {
  // Cache vacancy rate once (used by business creation guard inside loop)
  const cachedVacancyRate = ctx.getVacancyRate()
  for (const agent of ctx.agents) {
    if (agent.state === 'dead' || agent.state === 'child') continue

    // --- Passive living cost (food, transport, utilities) ---
    // Everyone pays this regardless of state — the universal cost of being alive
    agent.wealth -= ctx.config.passiveLivingCost

    // --- Capital returns (Piketty's r > g) ---
    // Wealthy agents earn passive returns on their capital (interest, dividends, appreciation)
    // This is the primary driver of wealth concentration in the real world
    if (agent.wealth > ctx.config.capitalReturnThreshold) {
      const annualReturn = (agent.wealth - ctx.config.capitalReturnThreshold) * ctx.config.capitalReturnRate
      agent.wealth += annualReturn / ctx.params.ticksPerYear
    }

    // Satisfaction: state-dependent boosts/penalties, all decay gently
    // All rates scaled by ticksPerYear so annual effect stays constant
    const tpy = ctx.params.ticksPerYear
    const satBoost = 0.18 / tpy     // employed: +0.18/year (net +0.06 after decay)
    const satDecay = 0.12 / tpy      // base decay: -0.12/year
    const unempDrain = 0.20 / tpy    // unemployed: -0.20/year additional (total -0.32/yr)
    const sickDrain = 0.12 / tpy     // sick: -0.12/year additional

    if (agent.state === 'employed' || agent.state === 'business_owner' || agent.state === 'police') {
      agent.satisfaction = clamp(agent.satisfaction + satBoost, 0, 1)
    } else if (agent.state === 'unemployed') {
      // Unemployment is deeply dissatisfying
      agent.satisfaction = clamp(agent.satisfaction - unempDrain, 0, 1)
    } else if (agent.state === 'criminal') {
      // Criminals have low life satisfaction
      agent.satisfaction = clamp(agent.satisfaction - unempDrain * 1.5, 0, 1)
    } else if (agent.state === 'prisoner') {
      // Prisoners have very low satisfaction, slowly decaying
      agent.satisfaction = clamp(agent.satisfaction - unempDrain * 0.5, 0, 1)
      continue // prisoners don't consume, create businesses, etc.
    }
    if (agent.isSick) {
      agent.satisfaction = clamp(agent.satisfaction - sickDrain, 0, 1)
    }
    agent.satisfaction = clamp(agent.satisfaction - satDecay, 0, 1)
    agent.ticksSinceConsumption++

    // Need consumption?
    if (agent.ticksSinceConsumption >= ctx.consumptionInterval) {
      agent.needsConsumption = true
    }

    // --- Parent pays for children ---
    // Adults with children at the same home pay a small per-child cost each consumption cycle
    if (agent.needsConsumption && agent.children > 0) {
      const childCostPerTick = 2 * agent.children / tpy // ~$2/child/year spread across ticks
      agent.wealth -= childCostPerTick
    }

    // Floor wealth at a minimum (prevent extreme debt spiral)
    agent.wealth = Math.max(agent.wealth, -500)

    // Bankruptcy event
    if (agent.wealth < BANKRUPTCY_THRESHOLD && agent.state !== 'retired') {
      if (!agent.lifeEvents.some((e) => e.type === 'bankrupt' && e.tick > ctx.tick - 50)) {
        agent.lifeEvents.push({
          tick: ctx.tick,
          type: 'bankrupt',
          description: `Bankrupt (debt: $${Math.round(agent.wealth)})`,
        })
      }
    }

    // Business creation — wealthy + educated agents become entrepreneurs
    // Guarded by vacancy rate: no new businesses if >10% of slots are already empty
    // Business creation: suppressed by actual displacement (fewer opportunities in automated economy)
    // Guard: only when vacancy < 10% AND displacement is not too high
    const actualDisplacement = ctx.totalDisplacementRate
    if (cachedVacancyRate < 0.10 && actualDisplacement < 0.60) {
      const avgWealth = ctx.params.totalWealth / ctx.params.populationSize
      const wealthThreshold = avgWealth * 1.2
      const canEntrepreneurize =
        (agent.state === 'employed' || agent.state === 'unemployed') &&
        agent.ownedBusinessId === null &&
        agent.wealth > wealthThreshold &&
        (agent.education === 'high' || agent.education === 'medium') &&
        agent.satisfaction > 0.35 &&
        agent.creditScore > 0.3 &&
        agent.age >= 25 && agent.age <= 60
      // Annual rate ~4%, suppressed by displacement: at 30% displacement → halved
      const annualBizRate = 0.04 * Math.max(0.1, 1 - actualDisplacement * 2)
      const bizChance = annualBizRate / ctx.params.ticksPerYear
      if (canEntrepreneurize && ctx.rng() < bizChance) {
        ctx.createBusiness(agent)
      }
    }
  }
}
