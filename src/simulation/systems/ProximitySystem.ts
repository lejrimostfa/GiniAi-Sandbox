// ============================================================
// ProximitySystem — spatial interactions between nearby agents
// Handles: robbery, arrest, contagion, marriage, rehabilitation,
// healthcare, word-of-mouth, criminal influence, police pressure
// Users can modify social interaction mechanics by editing this file.
// ============================================================

import type { Agent } from '../types'
import { vec2Distance } from '../types'
import type { SimulationContext } from '../SimulationContext'
import { clamp } from '../utils'
import {
  INTERACTION_RADIUS,
  CRIME_PROXIMITY_RADIUS,
  REHAB_TICKS,
  MARRIAGE_SAT_THRESHOLD,
} from '../constants'
import { arrestCriminal } from './GovernmentSystem'

// ============================================================
// Main proximity processing — called once per tick
// ============================================================
export function processProximityInteractions(ctx: SimulationContext): void {
  const living = ctx.agents.filter((a) => a.state !== 'dead' && a.state !== 'prisoner')
  const N = living.length
  if (N < 2) return

  // Build interaction pairs: check all pairs within INTERACTION_RADIUS
  // O(N²) is fine for 200–500 agents (~50k checks, very fast)
  for (let i = 0; i < N; i++) {
    const a = living[i]
    for (let j = i + 1; j < N; j++) {
      const b = living[j]
      const dist = vec2Distance(a.position, b.position)
      if (dist > INTERACTION_RADIUS) continue

      // --- POLICE ARREST: police near criminal → arrest ---
      if (a.state === 'police' && b.state === 'criminal' && dist < CRIME_PROXIMITY_RADIUS) {
        arrestCriminal(ctx, a, b)
        continue
      } else if (b.state === 'police' && a.state === 'criminal' && dist < CRIME_PROXIMITY_RADIUS) {
        arrestCriminal(ctx, b, a)
        continue
      }

      // --- CRIME: criminal near non-criminal → robbery ---
      if (a.state === 'criminal' && b.state !== 'criminal' && b.state !== 'police' && dist < CRIME_PROXIMITY_RADIUS) {
        attemptRobbery(ctx, a, b)
      } else if (b.state === 'criminal' && a.state !== 'criminal' && a.state !== 'police' && dist < CRIME_PROXIMITY_RADIUS) {
        attemptRobbery(ctx, b, a)
      }

      // --- DISEASE CONTAGION: sick agent near healthy → transmission risk ---
      if (ctx.params.diseasesEnabled) {
        if (a.isSick && !b.isSick && b.state !== 'dead') {
          if (ctx.rng() < 0.04) { // 4% per-encounter transmission
            b.isSick = true
            b.ticksSick = 0
            b.satisfaction = clamp(b.satisfaction - 0.1, 0, 1)
            b.lifeEvents.push({ tick: ctx.tick, type: 'disease', description: 'Caught illness from nearby agent' })
            ctx.tickDiseases++
          }
        } else if (b.isSick && !a.isSick && a.state !== 'dead') {
          if (ctx.rng() < 0.04) {
            a.isSick = true
            a.ticksSick = 0
            a.satisfaction = clamp(a.satisfaction - 0.1, 0, 1)
            a.lifeEvents.push({ tick: ctx.tick, type: 'disease', description: 'Caught illness from nearby agent' })
            ctx.tickDiseases++
          }
        }
      }

      // --- POLICE PRESENCE: nearby civilians feel slight surveillance pressure ---
      // Less than crime impact, but perceptible — heavy policing erodes civil satisfaction
      if (a.state === 'police' && b.state !== 'police' && b.state !== 'criminal' && b.state !== 'dead' && b.state !== 'child') {
        b.satisfaction = clamp(b.satisfaction - 0.005, 0, 1)
      } else if (b.state === 'police' && a.state !== 'police' && a.state !== 'criminal' && a.state !== 'dead' && a.state !== 'child') {
        a.satisfaction = clamp(a.satisfaction - 0.005, 0, 1)
      }

      // --- CRIMINAL INFLUENCE: unemployed near criminal → faster radicalization ---
      if (a.state === 'unemployed' && b.state === 'criminal') {
        // Being near a criminal lowers satisfaction and accelerates desperation
        a.satisfaction = clamp(a.satisfaction - 0.02, 0, 1)
        a.ticksLowSatisfaction += 1 // counts double
      } else if (b.state === 'unemployed' && a.state === 'criminal') {
        b.satisfaction = clamp(b.satisfaction - 0.02, 0, 1)
        b.ticksLowSatisfaction += 1
      }

      // --- WORD OF MOUTH: employed agent near unemployed → job tip ---
      // Snap the unemployed agent directly to the workplace (same as sendToNearest pattern)
      if (a.state === 'employed' && b.state === 'unemployed' && ctx.rng() < 0.15) {
        const wp = ctx.locations.find((l) => l.id === a.workplaceId)
        if (wp && wp.filledSlots < wp.jobSlots) {
          b.position = { x: wp.position.x + (ctx.rng() - 0.5) * 2, y: wp.position.y + (ctx.rng() - 0.5) * 2 }
          b.target = null
          b.targetLocationId = wp.id
          b.stayTicksRemaining = 1 // brief visit for interview
          b.currentAction = 'job_seeking'
          b.lifeEvents.push({ tick: ctx.tick, type: 'hired', description: 'Got a job tip from a fellow citizen' })
        }
      } else if (b.state === 'employed' && a.state === 'unemployed' && ctx.rng() < 0.15) {
        const wp = ctx.locations.find((l) => l.id === b.workplaceId)
        if (wp && wp.filledSlots < wp.jobSlots) {
          a.position = { x: wp.position.x + (ctx.rng() - 0.5) * 2, y: wp.position.y + (ctx.rng() - 0.5) * 2 }
          a.target = null
          a.targetLocationId = wp.id
          a.stayTicksRemaining = 1
          a.currentAction = 'job_seeking'
          a.lifeEvents.push({ tick: ctx.tick, type: 'hired', description: 'Got a job tip from a fellow citizen' })
        }
      }

      // --- MARRIAGE: male + female, both single, both eligible, meet → potential marriage ---
      // Demographic filters: educated women less likely to couple, poor men less likely to find partner
      if (canMarry(a) && canMarry(b) && a.gender !== b.gender) {
        const female = a.gender === 'female' ? a : b
        const male = a.gender === 'male' ? a : b

        // Female education penalty: high-edu women are more independent → much less likely to couple
        // low=0%, medium=20%, high=55% reduction
        const femEduScore = female.education === 'high' ? 0.55 : female.education === 'medium' ? 0.20 : 0
        const femEduFactor = 1 - femEduScore

        // Male wealth penalty: poor men struggle to attract partners
        // Below $50 wealth → up to 50% reduction; above $200 → no penalty
        const maleWealthFactor = Math.min(1, Math.max(0.5, male.wealth / 200))

        const marriageChance = 0.08 * femEduFactor * maleWealthFactor
        if (ctx.rng() < marriageChance) {
          ctx.tickMarriages++
          a.partnerId = b.id
          b.partnerId = a.id
          // Second partner moves to first's home (shares housing status)
          b.homeId = a.homeId
          b.homeOwned = a.homeOwned
          b.homeDebt = 0          // partner doesn't take on existing mortgage
          b.homeDebtPayment = 0
          b.homeValue = a.homeValue
          a.satisfaction = clamp(a.satisfaction + 0.15, 0, 1)
          b.satisfaction = clamp(b.satisfaction + 0.15, 0, 1)
          a.lifeEvents.push({ tick: ctx.tick, type: 'married', description: `Married ${b.gender === 'male' ? '👨' : '👩'} partner` })
          b.lifeEvents.push({ tick: ctx.tick, type: 'married', description: `Married ${a.gender === 'male' ? '👨' : '👩'} partner` })
        }
      }
    }
  }

  // --- REHABILITATION: criminal near government/school → chance of rehab ---
  for (const agent of living) {
    if (agent.state !== 'criminal') continue
    if (agent.ticksAsCriminal < REHAB_TICKS) continue

    for (const loc of ctx.locations) {
      if (loc.type !== 'government' && loc.type !== 'school') continue
      if (vec2Distance(agent.position, loc.position) > loc.radius + 3) continue

      // Near a rehabilitation location — chance to reform
      if (agent.wealth > 30 && ctx.rng() < 0.12) {
        agent.state = 'unemployed'
        agent.ticksUnemployed = 0
        agent.ticksAsCriminal = 0
        agent.currentAction = 'idle'
        agent.lifeEvents.push({
          tick: ctx.tick, type: 'rehabilitated',
          description: `Rehabilitated near ${loc.type} — re-entering society`,
        })
      }
      break // only check closest qualifying location
    }
  }

  // --- HEALTHCARE: sick agent at government → can recover if wealthy ---
  for (const agent of living) {
    if (!agent.isSick || agent.ticksSick < 4) continue

    for (const loc of ctx.locations) {
      if (loc.type !== 'government') continue
      if (vec2Distance(agent.position, loc.position) > loc.radius + 2) continue

      // At a government healthcare facility — can recover if can afford it
      if (agent.wealth > 80 && ctx.rng() < 0.18) {
        agent.isSick = false
        agent.ticksSick = 0
        agent.wealth -= 40 // healthcare cost
        agent.lifeEvents.push({ tick: ctx.tick, type: 'disease', description: 'Recovered from illness (healthcare)' })
      }
      break
    }
  }
}

// ============================================================
// Helper: attempt robbery (criminal → victim, must be in proximity)
// Sporadic: criminals have a cooldown between attempts.
// Police presence reduces success probability.
// ============================================================
function attemptRobbery(ctx: SimulationContext, criminal: Agent, victim: Agent): void {
  // Cooldown: criminal can't attempt crime every tick
  if (criminal.crimeAttemptCooldown > 0) return

  // Set cooldown regardless of outcome (attempt was made)
  criminal.crimeAttemptCooldown = ctx.config.crimeAttemptCooldown

  // Compute success probability — base rate reduced by nearby police
  let successProb = ctx.config.crimeSuccessBaseProb
  const policeNearby = ctx.agents.filter(
    a => a.state === 'police' && vec2Distance(a.position, criminal.position) < ctx.config.policeDeterrentRadius
  )
  for (let p = 0; p < policeNearby.length; p++) {
    successProb *= ctx.config.policeDeterrentFactor // each nearby police multiplies by 0.4
  }

  if (ctx.rng() > successProb) {
    // Crime attempt failed
    criminal.lifeEvents.push({
      tick: ctx.tick, type: 'crime_failed',
      description: `Robbery attempt failed${policeNearby.length > 0 ? ` (${policeNearby.length} police nearby)` : ''}`,
    })
    return
  }

  ctx.tickCrimes++
  const stolen = Math.min(victim.wealth * 0.08, 80)
  if (stolen > 0) {
    victim.wealth -= stolen
    criminal.wealth += stolen * 0.5 // some lost in process
    criminal.lifeEvents.push({
      tick: ctx.tick, type: 'crime_perpetrator',
      description: `Stole $${Math.round(stolen)} from a nearby agent`,
    })
    victim.lifeEvents.push({
      tick: ctx.tick, type: 'crime_victim',
      description: `Robbed by criminal (-$${Math.round(stolen)})`,
    })
    victim.satisfaction = clamp(victim.satisfaction - 0.1, 0, 1)
  }
}

// ============================================================
// Helper: can this agent get married?
// ============================================================
function canMarry(agent: Agent): boolean {
  return (agent.state === 'employed' || agent.state === 'business_owner' || agent.state === 'police')
    && agent.partnerId === null
    && agent.satisfaction >= MARRIAGE_SAT_THRESHOLD
    && agent.age >= 20
    && agent.ticksLowSatisfaction === 0
}
