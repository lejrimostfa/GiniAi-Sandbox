// ============================================================
// GovernmentSystem — taxes, treasury, pensions, benefits, UBI
// Budget flows through persistent governmentTreasury
// Users can modify fiscal policy by editing constants or this file
// ============================================================

import type { SimulationContext } from '../SimulationContext'
import {
  POLICE_SALARY,
  PENSION_PER_RETIREE,
  INFRA_COST_PER_LOCATION,
  BENEFIT_PER_UNEMPLOYED,
  UBI_TREASURY_SHARE,
  BENEFIT_DECAY_TICKS,
  BENEFIT_DECAY_RATE,
} from '../constants'

// --- Helper: spend from treasury, never go below 0 ---
function spend(ctx: SimulationContext, amount: number): number {
  const available = Math.max(0, ctx.governmentTreasury)
  const actual = Math.min(amount, available)
  ctx.governmentTreasury -= actual
  return actual
}

// ============================================================
// Main government processing — called once per tick
// ============================================================
export function processGovernment(ctx: SimulationContext): void {
  if (ctx.params.redistributionLevel <= 0) return

  const living = ctx.agents.filter((a) => a.state !== 'dead')
  const taxRate = ctx.params.redistributionLevel * 0.3 // max 30% tax
  let taxPool = 0

  // --- Collect taxes from agents who actually earned this tick ---
  for (const agent of living) {
    if (agent.tickEarnings > 0) {
      const tax = agent.tickEarnings * taxRate
      agent.wealth -= tax
      taxPool += tax
    }
  }
  ctx.tickTaxRevenue += taxPool
  ctx.governmentTreasury += taxPool

  // --- 1. Police salaries FIRST (fonctionnaires are priority — must be paid) ---
  const policeAgents = living.filter((a) => a.state === 'police')
  const totalPoliceCost = policeAgents.length * POLICE_SALARY
  const policeFunded = spend(ctx, totalPoliceCost)
  const actualPolicePay = policeAgents.length > 0 ? policeFunded / policeAgents.length : 0
  for (const p of policeAgents) {
    p.wealth += actualPolicePay
    p.tickEarnings += actualPolicePay
    p.income = actualPolicePay // actual pay, may be reduced if treasury short
  }
  ctx.tickGovExpPolice = policeFunded

  // --- 2. Pensions (retired agents) ---
  const retirees = living.filter((a) => a.state === 'retired')
  const totalPensionCost = retirees.length * PENSION_PER_RETIREE
  const pensionFunded = spend(ctx, totalPensionCost)
  const actualPension = retirees.length > 0 ? pensionFunded / retirees.length : 0
  for (const retiree of retirees) {
    retiree.wealth += actualPension
  }
  ctx.tickRedistribution += pensionFunded
  ctx.tickGovExpPensions = pensionFunded

  // --- 3. Unemployment benefits (with decay after BENEFIT_DECAY_TICKS) ---
  // Long-term unemployed get reduced benefits — incentivizes job seeking
  // and prevents infinite wealth floor that compresses inequality
  const unemployed = living.filter((a) => a.state === 'unemployed')
  let totalBenefitCost = 0
  for (const u of unemployed) {
    const decayFactor = u.ticksUnemployed > BENEFIT_DECAY_TICKS ? BENEFIT_DECAY_RATE : 1.0
    totalBenefitCost += BENEFIT_PER_UNEMPLOYED * decayFactor
  }
  const benefitFunded = spend(ctx, totalBenefitCost)
  // Distribute proportionally (preserving decay ratios)
  if (totalBenefitCost > 0) {
    const fundingRatio = benefitFunded / totalBenefitCost
    for (const u of unemployed) {
      const decayFactor = u.ticksUnemployed > BENEFIT_DECAY_TICKS ? BENEFIT_DECAY_RATE : 1.0
      u.wealth += BENEFIT_PER_UNEMPLOYED * decayFactor * fundingRatio
    }
  }
  ctx.tickRedistribution += benefitFunded
  ctx.tickGovExpBenefits = benefitFunded

  // --- 4. Infrastructure maintenance ---
  const infraCost = ctx.locations.length * INFRA_COST_PER_LOCATION
  const infraSpent = spend(ctx, infraCost)
  ctx.tickGovExpInfra = infraSpent

  // --- 5. Dynamic police hiring/firing ---
  processPoliceHiring(ctx, living)

  // --- 6. Strikes: dissatisfied workers temporarily stop working ---
  processStrikes(ctx, living)

  // --- 7. Remaining surplus → UBI (only if enableUBI is on) ---
  if (ctx.governmentTreasury > 0 && ctx.params.enableUBI) {
    const ubiPool = ctx.governmentTreasury * UBI_TREASURY_SHARE
    const ubiSpent = spend(ctx, ubiPool)
    const ubi = ubiSpent / living.length
    for (const agent of living) {
      agent.wealth += ubi
    }
    ctx.tickRedistribution += ubiSpent
    ctx.tickGovExpUBI = ubiSpent
  }
}

// ============================================================
// Police hiring/firing — scales with crime & dissatisfaction
// ============================================================
import type { Agent } from '../types'
import {
  POLICE_BASE_RATIO,
  POLICE_PER_CRIMINAL,
  POLICE_UNREST_THRESHOLD,
  POLICE_UNREST_HIRE_RATE,
  POLICE_MAX_HIRE_PER_TICK,
  POLICE_MAX_FIRE_PER_TICK,
  POLICE_MIN_AGE,
  POLICE_MAX_AGE,
} from '../constants'

function processPoliceHiring(ctx: SimulationContext, living: Agent[]): void {
  const criminals = living.filter((a) => a.state === 'criminal').length
  const police = living.filter((a) => a.state === 'police').length
  const N = living.length
  if (N === 0) return

  // Target police ratio: scales with crime rate + dissatisfaction
  const dissatisfied = living.filter(a =>
    a.state !== 'child' && a.state !== 'dead' && a.satisfaction < 0.3
  ).length
  const dissatisfactionRate = dissatisfied / N

  // Base: 1 police per POLICE_BASE_RATIO agents; increase with crime & dissatisfaction
  const basePolice = Math.ceil(N / POLICE_BASE_RATIO)
  const crimeBonus = Math.ceil(criminals * POLICE_PER_CRIMINAL)
  const unrestBonus = dissatisfactionRate > POLICE_UNREST_THRESHOLD
    ? Math.ceil(N * POLICE_UNREST_HIRE_RATE) : 0
  const targetPolice = basePolice + crimeBonus + unrestBonus

  // Hire: recruit from unemployed with low education
  if (police < targetPolice) {
    const toHire = Math.min(targetPolice - police, POLICE_MAX_HIRE_PER_TICK)
    const candidates = living.filter(a =>
      a.state === 'unemployed' && a.age >= POLICE_MIN_AGE && a.age <= POLICE_MAX_AGE && a.education === 'low'
    )
    for (let i = 0; i < toHire && i < candidates.length; i++) {
      const recruit = candidates[i]
      recruit.state = 'police'
      recruit.income = POLICE_SALARY
      recruit.ticksUnemployed = 0
      recruit.currentAction = 'patrolling'
      recruit.workplaceId = null // police don't have a workplace — paid by government
      recruit.lifeEvents.push({
        tick: ctx.tick, type: 'joined_police',
        description: 'Recruited into police force by government',
      })
      // Send to nearest police station
      ctx.sendToNearest(recruit, 'police_station')
    }
  }

  // Fire: if police force too large relative to need + treasury too low
  if (police > targetPolice + 2 && ctx.governmentTreasury < 0) {
    const toFire = Math.min(police - targetPolice, POLICE_MAX_FIRE_PER_TICK)
    const policeList = living.filter(a => a.state === 'police')
    for (let i = 0; i < toFire && i < policeList.length; i++) {
      const officer = policeList[i]
      officer.state = 'unemployed'
      officer.income = 0
      officer.ticksUnemployed = 0
      officer.currentAction = 'idle'
      officer.lifeEvents.push({
        tick: ctx.tick, type: 'fired',
        description: 'Laid off from police force (budget cuts)',
      })
    }
  }

  // Ensure at least 1 police station exists
  const stations = ctx.locations.filter(l => l.type === 'police_station')
  if (stations.length === 0) {
    const gov = ctx.locations.find(l => l.type === 'government')
    const pos = gov ? { x: gov.position.x + 8, y: gov.position.y + 3 } : { x: 0, y: 0 }
    ctx.locations.push({
      id: `police_station_${ctx.tick}`,
      type: 'police_station',
      position: pos,
      radius: 2.5,
      jobSlots: 0, filledSlots: 0, automatedSlots: 0, aiDisplacedSlots: 0, wage: 0,
    })
  }
}

// ============================================================
// Strikes — widespread dissatisfaction causes workers to stop
// ============================================================
import {
  STRIKE_DISSATISFACTION_THRESHOLD,
  STRIKE_SAT_THRESHOLD,
} from '../constants'

function processStrikes(ctx: SimulationContext, living: Agent[]): void {
  const adults = living.filter(a =>
    a.state !== 'child' && a.state !== 'dead' && a.state !== 'retired'
  )
  if (adults.length === 0) return

  const dissatisfied = adults.filter(a => a.satisfaction < 0.25).length
  const dissatisfactionRate = dissatisfied / adults.length

  // Strikes trigger when dissatisfaction rate exceeds threshold
  if (dissatisfactionRate < STRIKE_DISSATISFACTION_THRESHOLD) return

  // Strike probability scales with dissatisfaction beyond threshold
  const strikeProbability = Math.min(0.3,
    (dissatisfactionRate - STRIKE_DISSATISFACTION_THRESHOLD) * 2
  )

  const employed = living.filter(a => a.state === 'employed')
  let strikers = 0
  for (const worker of employed) {
    if (worker.satisfaction < STRIKE_SAT_THRESHOLD && ctx.rng() < strikeProbability) {
      // Worker goes on strike this tick: no work, no earnings
      worker.currentAction = 'striking'
      worker.stayTicksRemaining = 0 // leave workplace
      ctx.sendToNearest(worker, 'government') // protest at government
      worker.lifeEvents.push({
        tick: ctx.tick, type: 'went_on_strike',
        description: `Went on strike (satisfaction: ${(worker.satisfaction * 100).toFixed(0)}%)`,
      })
      strikers++
    }
  }
  ctx.tickStrikers = strikers
}

// ============================================================
// Arrest mechanic — police encounters criminal
// ============================================================
import { clamp } from '../utils'
import {
  ARREST_SUCCESS_RATE,
  ARREST_CONFISCATE_RATE,
  ARREST_CONFISCATE_CAP,
} from '../constants'

export function arrestCriminal(ctx: SimulationContext, police: Agent, criminal: Agent): void {
  if (ctx.rng() > ARREST_SUCCESS_RATE) return

  ctx.tickArrests++
  // Criminal becomes unemployed (rehabilitation through arrest)
  criminal.state = 'unemployed'
  criminal.ticksAsCriminal = 0
  criminal.ticksUnemployed = 0
  criminal.currentAction = 'arrested'
  criminal.satisfaction = clamp(criminal.satisfaction + 0.05, 0, 1)
  // Confiscate stolen wealth (partial)
  const confiscated = Math.min(criminal.wealth * ARREST_CONFISCATE_RATE, ARREST_CONFISCATE_CAP)
  criminal.wealth -= confiscated
  ctx.governmentTreasury += confiscated

  criminal.lifeEvents.push({
    tick: ctx.tick, type: 'arrested_criminal',
    description: `Arrested by police (lost $${Math.round(confiscated)})`,
  })
  police.lifeEvents.push({
    tick: ctx.tick, type: 'arrested_criminal',
    description: `Arrested a criminal (confiscated $${Math.round(confiscated)})`,
  })

  // Send criminal home
  ctx.sendToNearest(criminal, 'home')
  criminal.stayTicksRemaining = 4 // detained at home for a few ticks
}
