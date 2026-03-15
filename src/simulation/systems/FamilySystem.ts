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
  POOR_SAT_THRESHOLD,
  NORMAL_SAT_THRESHOLD,
  POOR_MAX_CHILDREN,
  NORMAL_MAX_CHILDREN,
  POVERTY_FERTILITY_BOOST_MAX,
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
    // Poor couples have children even when unhappy (lower satisfaction threshold)
    const satThreshold = isPoor ? POOR_SAT_THRESHOLD : NORMAL_SAT_THRESHOLD
    const bothSatisfied = agent.satisfaction > satThreshold && partner.satisfaction > satThreshold
    const atLeastOneEmployed = (agent.state === 'employed' || agent.state === 'business_owner' || agent.state === 'police')
      || (partner.state === 'employed' || partner.state === 'business_owner' || partner.state === 'police')
    // Poor/unemployed couples can also have children (no employment requirement)
    const canHaveChild = atLeastOneEmployed || isPoor
    const fertileAge = agent.age >= 20 && agent.age <= 45 && partner.age >= 20 && partner.age <= 45
    const notTooManyKids = isPoor ? agent.children < POOR_MAX_CHILDREN : agent.children < NORMAL_MAX_CHILDREN

    // --- Conception failure: probability increases with age, satisfaction, education, wealth ---
    // Real-world demographic transition: richer, more educated, happier people have fewer children
    // Age factor: fertility peaks at 25, drops sharply after 35
    const avgAge = (agent.age + partner.age) / 2
    const agePenalty = avgAge > 35 ? (avgAge - 35) * 0.04 : 0 // +4% failure per year over 35

    // Education factor: high-edu couples have fewer children (demographic transition)
    const eduScore = (e: string) => e === 'high' ? 0.9 : e === 'medium' ? 0.5 : 0.2
    const coupleEdu = (eduScore(agent.education) + eduScore(partner.education)) / 2
    const eduPenalty = coupleEdu * 0.35 // high-edu couple: +31% failure

    // Wealth factor: wealthier couples delay/avoid children, poor couples have MORE
    const wealthPenalty = coupleWealth > 200
      ? Math.min(0.3, (coupleWealth - 200) * 0.001) // rich: up to +30% failure
      : 0
    // Poverty fertility boost: very poor couples have significantly higher birth rate
    const povertyBoost = coupleWealth < POOR_COUPLE_WEALTH_THRESHOLD
      ? Math.min(POVERTY_FERTILITY_BOOST_MAX, (POOR_COUPLE_WEALTH_THRESHOLD - coupleWealth) * 0.007) // poor: up to -40% failure (= more births)
      : 0

    // Satisfaction factor: very happy people are more career-focused, less urgency for kids
    const avgSat = (agent.satisfaction + partner.satisfaction) / 2
    const satPenalty = Math.max(0, (avgSat - 0.6) * 0.25) // above 0.6 sat → up to +10% failure

    // Existing children penalty: each existing child reduces desire for more
    const kidsPenalty = agent.children * 0.12 // +12% per existing child

    const conceptionFailure = Math.min(0.85, agePenalty + eduPenalty + wealthPenalty + satPenalty + kidsPenalty - povertyBoost)
    const adjustedBirthProb = birthProbPerTick * (1 - Math.max(0, conceptionFailure))

    if (bothSatisfied && canHaveChild && fertileAge && notTooManyKids && ctx.rng() < adjustedBirthProb) {
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
