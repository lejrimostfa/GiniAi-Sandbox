// ============================================================
// FamilySystem — marriage fertility, baby creation, demographic transition
// Users can modify birth mechanics by editing this file
// Runs every tick with per-tick probability for smooth birth curve
// ============================================================

import type { Agent } from '../types'
import type { SimulationContext } from '../SimulationContext'
import { clamp, uid } from '../utils'
import {
  POOR_COUPLE_WEALTH_THRESHOLD,
} from '../constants'

// ============================================================
// Main family processing — called once per tick
// ============================================================
export function processFamily(ctx: SimulationContext): void {
  // Runs every tick — birth probability is per-tick (annual rate / ticksPerYear)
  const baseBirthProb = 0.15 / ctx.params.ticksPerYear

  // --- Economic stress factor: high unemployment suppresses fertility ---
  // Real-world: fertility drops ~1% for each 1% rise in unemployment
  // Here: at 50% unemployment → birth rate halved
  const living = ctx.agents.filter(a => a.state !== 'dead' && a.state !== 'child')
  const unemployedCount = living.filter(a => a.state === 'unemployed').length
  const unemploymentRate = living.length > 0 ? unemployedCount / living.length : 0
  const econStressFactor = Math.max(0.2, 1 - unemploymentRate)
  const birthProbPerTick = baseBirthProb * econStressFactor

  const newChildren: Agent[] = []

  for (const agent of ctx.agents) {
    if (agent.state === 'dead' || !agent.partnerId) continue
    // Only process once per couple (alphabetically-first partner)
    if (agent.id > agent.partnerId) continue

    const partner = ctx.agents.find((a) => a.id === agent.partnerId)
    if (!partner || partner.state === 'dead') continue

    // Baby conditions: fertile age, limited children, and either employed or poor (desperate)
    const coupleWealth = agent.wealth + partner.wealth
    const isPoor = coupleWealth < POOR_COUPLE_WEALTH_THRESHOLD
    const atLeastOneEmployed = (agent.state === 'employed' || agent.state === 'business_owner' || agent.state === 'police')
      || (partner.state === 'employed' || partner.state === 'business_owner' || partner.state === 'police')
    // Poor/unemployed couples can also have children (no employment requirement)
    const canHaveChild = atLeastOneEmployed || isPoor
    const fertileAge = agent.age >= 20 && agent.age <= 45 && partner.age >= 20 && partner.age <= 45
    const notTooManyKids = isPoor ? agent.children < ctx.config.poorMaxChildren : agent.children < ctx.config.normalMaxChildren

    // --- Conception failure: probability increases with age, satisfaction, education, wealth ---
    // Real-world demographic transition: richer, more educated women have fewer children
    // Age factor: fertility peaks at 25, drops sharply after 35
    const avgAge = (agent.age + partner.age) / 2
    const agePenalty = avgAge > 35 ? (avgAge - 35) * 0.04 : 0 // +4% failure per year over 35

    // Education factor: WOMAN's education is the dominant driver of fertility reduction
    // Highly educated women delay/reduce childbearing (career focus, family planning)
    // Low education = NO penalty (no demographic transition effect)
    const female = agent.gender === 'female' ? agent : partner
    const femEduScore = female.education === 'high' ? 1.0 : female.education === 'medium' ? 0.4 : 0.0
    const maleEduScore = (female === agent ? partner : agent).education === 'high' ? 0.3 : 0.0
    const eduPenalty = (femEduScore * 0.45) + (maleEduScore * 0.10) // high-edu woman: +45% failure; man adds minor +3%

    // Wealth factor: wealthy couples delay/avoid children much more (career, lifestyle)
    const wealthPenalty = coupleWealth > 150
      ? Math.min(0.40, (coupleWealth - 150) * 0.002) // rich: up to +40% failure (steeper curve)
      : 0
    // Poverty fertility boost: very poor couples have significantly higher birth rate
    const povertyBoost = coupleWealth < POOR_COUPLE_WEALTH_THRESHOLD
      ? Math.min(ctx.config.povertyFertilityBoostMax, (POOR_COUPLE_WEALTH_THRESHOLD - coupleWealth) * 0.007) // poor: up to -40% failure (= more births)
      : 0

    // Satisfaction factor (continuous, replaces the old hard gate):
    // Low satisfaction = instability/stress → reduces fertility
    // High satisfaction = stable couple → no penalty (happy couples have babies)
    const avgSat = (agent.satisfaction + partner.satisfaction) / 2
    const satFactor = clamp(avgSat / 0.5, 0.15, 1.0)
    // sat=0.1 → 0.30 (70% reduction), sat=0.3 → 0.60, sat=0.5+ → 1.0 (no penalty)

    // Existing children penalty: each existing child reduces desire for more
    const kidsPenalty = agent.children * 0.12 // +12% per existing child

    const conceptionFailure = Math.min(0.75, agePenalty + eduPenalty + wealthPenalty + kidsPenalty - povertyBoost)
    const adjustedBirthProb = birthProbPerTick * (1 - Math.max(0, conceptionFailure)) * satFactor
    // Floor: even worst-case couple has ~5% annual chance (≈0.001/tick)
    const floorProb = 0.05 / ctx.params.ticksPerYear
    const finalBirthProb = Math.max(floorProb, adjustedBirthProb)

    if (canHaveChild && fertileAge && notTooManyKids && ctx.rng() < finalBirthProb) {
      // --- Hospital check: births are safer with a hospital ---
      const hasHospital = ctx.locations.some((l) => l.type === 'hospital')

      // Without hospital: risk of infant mortality (birth complications)
      if (!hasHospital && ctx.rng() < ctx.config.hospitalBirthMortalityNoHospital) {
        agent.lifeEvents.push({ tick: ctx.tick, type: 'birth_no_hospital', description: 'Birth complications — no hospital available' })
        partner.lifeEvents.push({ tick: ctx.tick, type: 'birth_no_hospital', description: 'Birth complications — no hospital available' })
        agent.satisfaction = clamp(agent.satisfaction - 0.20, 0, 1)
        partner.satisfaction = clamp(partner.satisfaction - 0.20, 0, 1)
        continue
      }

      // Hospital exists: government pays birth cost
      if (hasHospital) {
        ctx.governmentTreasury -= ctx.config.hospitalBirthCost
        ctx.tickGovExpHospital += ctx.config.hospitalBirthCost
        agent.lifeEvents.push({ tick: ctx.tick, type: 'birth_hospital', description: `Baby delivered at hospital (gov paid $${ctx.config.hospitalBirthCost})` })
      }

      agent.children++
      partner.children = agent.children // sync count

      // --- Create a real child agent ---
      const gender = ctx.rng() < 0.5 ? 'male' : 'female'
      const home = ctx.locations.find((l) => l.id === agent.homeId)
      const homePos = home?.position ?? agent.position
      const scatter = (home?.radius ?? 3) * 1.5

      const child: Agent = {
        id: uid('child'),
        position: { x: homePos.x + (ctx.rng() - 0.5) * scatter, y: homePos.y + (ctx.rng() - 0.5) * scatter },
        velocity: { x: 0, y: 0 },
        target: null,
        targetLocationId: null,
        age: 0,
        gender: gender as 'male' | 'female',
        education: 'low',
        state: 'child',
        wealth: 0,
        income: 0,
        tickEarnings: 0,
        homeId: agent.homeId,
        homeOwned: false,
        homeDebt: 0,
        homeDebtPayment: 0,
        homeValue: home?.housingValue ?? 300,
        partnerId: null,
        children: 0,
        workplaceId: null,
        satisfaction: 0.7,
        needsConsumption: false,
        ticksUnemployed: 0,
        ticksSinceConsumption: 0,
        currentAction: 'resting',
        stayTicksRemaining: 0,
        isSick: false,
        ticksSick: 0,
        ticksLowSatisfaction: 0,
        ticksAsCriminal: 0,
        crimeAttemptCooldown: 0,
        ticksInPrison: 0,
        prisonSentence: 0,
        deathTick: null,
        carryingResource: false,
        lastPaidTick: -10,
        loan: 0,
        loanPayment: 0,
        creditScore: 0.5,
        ownedBusinessId: null,
        businessDebt: 0,
        businessDebtPayment: 0,
        businessRevenue: 0,
        businessTicksUnprofitable: 0,
        ticksStudying: 0,
        trail: [],
        lifeEvents: [{
          tick: ctx.tick,
          type: 'born',
          description: `Born to ${agent.gender === 'male' ? '👨' : '👩'}+${partner.gender === 'male' ? '👨' : '👩'} family`,
        }],
        wealthHistory: [0],
        wealthArchive: [0],
        stateHistory: [{ tick: ctx.tick, from: 'child' as const, to: 'child' as const }],
      }

      newChildren.push(child)

      // Update home capacity tracking
      if (home) {
        home.residentsCount = (home.residentsCount ?? 0) + 1
      }

      agent.satisfaction = clamp(agent.satisfaction + 0.1, 0, 1)
      partner.satisfaction = clamp(partner.satisfaction + 0.1, 0, 1)
      agent.lifeEvents.push({ tick: ctx.tick, type: 'had_baby', description: `Had a baby (${agent.children} children)` })
      partner.lifeEvents.push({ tick: ctx.tick, type: 'had_baby', description: `Had a baby (${agent.children} children)` })
      ctx.tickBirths++
    }
  }

  // Add all new children to the agent pool
  if (newChildren.length > 0) {
    ctx.agents.push(...newChildren)
    // Check if housing expansion is needed after births
    ctx.expandHousingIfNeeded()
  }
}
