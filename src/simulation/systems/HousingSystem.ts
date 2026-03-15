// ============================================================
// HousingSystem — rent, mortgage, ownership, government expansion
// Users can modify housing mechanics by editing this file
// Runs once per year (called from annual block in step())
// ============================================================

import type { SimulationContext } from '../SimulationContext'
import { clamp } from '../utils'

// ============================================================
// Main housing processing — called once per year
// ============================================================
export function processHousing(ctx: SimulationContext): void {
  const tpy = ctx.params.ticksPerYear

  // --- 1. Recount residents per home ---
  for (const loc of ctx.locations) {
    if (loc.type === 'home') loc.residentsCount = 0
  }
  for (const agent of ctx.agents) {
    if (agent.state === 'dead') continue
    // Children share parent's home — don't double-count (only count head of household)
    if (agent.state === 'child') continue
    // Couples: only count alphabetically-first partner
    if (agent.partnerId && agent.id > agent.partnerId) continue
    const home = ctx.locations.find((l) => l.id === agent.homeId)
    if (home) home.residentsCount = (home.residentsCount ?? 0) + 1
  }

  // --- 2. Process each adult agent's housing ---
  for (const agent of ctx.agents) {
    if (agent.state === 'dead' || agent.state === 'child') continue

    const home = ctx.locations.find((l) => l.id === agent.homeId)
    if (!home) continue

    // Couples: only alphabetically-first partner pays (avoids double-charging)
    if (agent.partnerId) {
      const partner = ctx.agents.find((a) => a.id === agent.partnerId)
      if (partner && agent.id > partner.id) continue
    }

    // --- 2a. Homeowner: no rent, no mortgage if paid off ---
    if (agent.homeOwned && agent.homeDebt <= 0) {
      // Owned home → satisfaction boost (stability) — scaled per year
      agent.satisfaction = clamp(agent.satisfaction + 0.08 / tpy, 0, 1)
      continue
    }

    // --- 2b. Mortgage payment ---
    if (agent.homeDebt > 0 && agent.homeDebtPayment > 0) {
      const annualPayment = agent.homeDebtPayment * tpy
      const payment = Math.min(annualPayment, agent.homeDebt)

      if (agent.partnerId) {
        const partner = ctx.agents.find((a) => a.id === agent.partnerId)
        agent.wealth -= payment / 2
        if (partner) partner.wealth -= payment / 2
      } else {
        agent.wealth -= payment
      }
      agent.homeDebt -= payment

      // Mortgage fully paid → agent owns the home!
      if (agent.homeDebt <= 0) {
        agent.homeDebt = 0
        agent.homeDebtPayment = 0
        agent.homeOwned = true
        agent.creditScore = clamp(agent.creditScore + 0.1, 0, 1)
        agent.satisfaction = clamp(agent.satisfaction + 0.2, 0, 1)
        agent.lifeEvents.push({
          tick: ctx.tick, type: 'mortgage_paid',
          description: `Mortgage paid off! Now owns home (value: $${Math.round(agent.homeValue)})`,
        })
      }
      continue
    }

    // --- 2c. Renter: pay annual rent ---
    // Rent transfers to property owner (if any) or government treasury
    // This creates a wealth transfer channel from renters → landlords/state
    const rent = home.rent ?? 30
    if (agent.partnerId) {
      const partner = ctx.agents.find((a) => a.id === agent.partnerId)
      agent.wealth -= rent / 2
      if (partner) partner.wealth -= rent / 2
    } else {
      agent.wealth -= rent
    }
    // Transfer rent to home owner (landlord) or government treasury
    if (home.ownerId) {
      const landlord = ctx.agents.find((a) => a.id === home.ownerId && a.state !== 'dead')
      if (landlord) {
        landlord.wealth += rent * 0.7 // landlord keeps 70% (30% goes to maintenance/taxes)
        ctx.governmentTreasury += rent * 0.3 // property tax portion
      } else {
        ctx.governmentTreasury += rent // no living landlord → all goes to treasury
      }
    } else {
      // Public/government housing — rent goes to treasury
      ctx.governmentTreasury += rent
    }

    // --- 2d. Can this renter afford to buy? Take mortgage ---
    // Conditions: employed, good credit, enough wealth for down payment (20%)
    const canBuy = !agent.homeOwned && agent.homeDebt <= 0 &&
      (agent.state === 'employed' || agent.state === 'business_owner') &&
      agent.creditScore > 0.4 &&
      agent.wealth > agent.homeValue * 0.20 && // 20% down payment
      agent.income > 0

    if (canBuy && ctx.rng() < 0.15) {
      const downPayment = agent.homeValue * 0.20
      agent.wealth -= downPayment
      agent.homeDebt = agent.homeValue - downPayment // 80% mortgage
      // Repay over 15 years
      const mortgageYears = 15
      agent.homeDebtPayment = agent.homeDebt / (mortgageYears * tpy)
      agent.lifeEvents.push({
        tick: ctx.tick, type: 'home_bought',
        description: `Bought home (value: $${Math.round(agent.homeValue)}, down: $${Math.round(downPayment)}, mortgage: $${Math.round(agent.homeDebt)})`,
      })
    }

    // --- 2e. Eviction: can't afford rent ---
    if (agent.wealth < -150) {
      const allHomes = ctx.locations.filter((l) => l.type === 'home')
      const cheapest = allHomes.reduce((best, h) =>
        (h.rent ?? 30) < (best.rent ?? 30) ? h : best, allHomes[0])
      if (cheapest && cheapest.id !== agent.homeId) {
        agent.homeId = cheapest.id
        agent.homeOwned = false
        agent.homeDebt = 0
        agent.homeDebtPayment = 0
        agent.homeValue = cheapest.housingValue ?? 300
        agent.satisfaction = clamp(agent.satisfaction - 0.15, 0, 1)
        agent.lifeEvents.push({
          tick: ctx.tick, type: 'evicted',
          description: `Evicted — moved to cheaper home (rent: $${cheapest.rent ?? 30})`,
        })
      }
    }
  }

  // --- 3. Government housing expansion: build new homes if shortage ---
  ctx.expandHousingIfNeeded()
}
