// ============================================================
// CausalPhenomenaSystem — disease, crime, death, divorce
// Events are CAUSED by agent state, not random probabilities.
// Each phenomenon has a clear causal chain.
// Users can modify societal dynamics by editing this file.
// ============================================================

import type { SimulationContext } from '../SimulationContext'
import { clamp } from '../utils'
import {
  DIVORCE_LOW_SAT_TICKS,
  DIVORCE_SAT_THRESHOLD,
} from '../constants'

// ============================================================
// Main causal phenomena processing — called once per tick
// ============================================================
export function processCausalPhenomena(ctx: SimulationContext): void {
  const N = ctx.agents.length
  if (N === 0) return

  for (const agent of ctx.agents) {
    if (agent.state === 'dead' || agent.state === 'child' || agent.state === 'prisoner') continue

    // --- Decrement crime attempt cooldown ---
    if (agent.crimeAttemptCooldown > 0) agent.crimeAttemptCooldown--

    // --- Track satisfaction trend ---
    if (agent.satisfaction < DIVORCE_SAT_THRESHOLD) {
      agent.ticksLowSatisfaction++
    } else {
      agent.ticksLowSatisfaction = Math.max(0, agent.ticksLowSatisfaction - 1)
    }

    // --- DISEASE (internal): caused by sustained poverty + low satisfaction ---
    // Causal chain: poor for many ticks → body breaks down → sick
    // NOTE: Disease can also SPREAD by proximity (see processProximityInteractions)
    if (!agent.isSick && ctx.params.diseasesEnabled) {
      const inPoverty = agent.wealth < ctx.config.diseaseWealthThreshold
      const lowSat = agent.satisfaction < 0.35
      if (inPoverty && lowSat && agent.ticksLowSatisfaction >= ctx.config.diseasePovertyTicks) {
        const povertyDuration = agent.ticksLowSatisfaction - ctx.config.diseasePovertyTicks
        if (ctx.rng() < 0.05 + povertyDuration * 0.02) {
          agent.isSick = true
          agent.ticksSick = 0
          agent.satisfaction = clamp(agent.satisfaction - 0.15, 0, 1)
          agent.lifeEvents.push({ tick: ctx.tick, type: 'disease', description: 'Fell ill (sustained poverty & stress)' })
          ctx.tickDiseases++
        }
      }
    } else if (agent.isSick) {
      // Already sick — track duration, satisfaction decays
      agent.ticksSick++
      agent.satisfaction = clamp(agent.satisfaction - 0.03, 0, 1)
      // NOTE: Recovery requires visiting hospital (see agentInteract → hospital interaction)
      // Hospital provides HOSPITAL_RECOVERY_PROB chance of cure per visit, government pays treatment cost
    }

    // --- PROLONGED UNEMPLOYMENT: multiple possible outcomes ---
    // Not everyone turns to crime — diversified paths based on agent profile
    if (agent.state === 'unemployed' && agent.ticksUnemployed >= ctx.config.crimeUnemploymentTicks) {
      const desperate = agent.wealth < ctx.config.crimeWealthThreshold
        && agent.satisfaction < ctx.config.crimeSatisfactionThreshold

      if (desperate) {
        const desperation = (agent.ticksUnemployed - ctx.config.crimeUnemploymentTicks) * 0.02
        const roll = ctx.rng()

        if (roll < 0.03 + desperation * 0.4) {
          // ~30% of desperate: CRIME — low-edu, young, no partner
          if (agent.education === 'low' || (agent.age < 35 && !agent.partnerId)) {
            agent.state = 'criminal'
            agent.income = 0
            agent.ticksAsCriminal = 0
            agent.currentAction = 'stealing'
            agent.lifeEvents.push({
              tick: ctx.tick, type: 'became_criminal',
              description: `Turned to crime after ${agent.ticksUnemployed} ticks of unemployment`,
            })
          }
        } else if (roll < 0.05 + desperation * 0.3) {
          // ~20% of desperate: DEPRESSION → sick (mental health crisis)
          if (!agent.isSick) {
            agent.isSick = true
            agent.ticksSick = 0
            agent.satisfaction = clamp(agent.satisfaction - 0.3, 0, 1)
            agent.lifeEvents.push({
              tick: ctx.tick, type: 'depression',
              description: `Fell into depression after ${agent.ticksUnemployed} ticks of unemployment`,
            })
          }
        } else if (roll < 0.06 + desperation * 0.2) {
          // ~15% of desperate: SUICIDE — extreme despair, no partner, no wealth
          if (agent.satisfaction < 0.10 && agent.wealth < -50 && !agent.partnerId) {
            ctx.killAgent(agent, `Suicide after prolonged unemployment (${agent.ticksUnemployed} ticks)`)
            ctx.tickPrematureDeaths++
            continue
          }
        }
        // Remaining ~35%: stay unemployed (resilient, waiting, informal economy)
      }
    }

    // --- CRIMINAL: track time, risk of violent death ---
    // NOTE: Stealing and rehabilitation are now proximity-based (see processProximityInteractions)
    if (agent.state === 'criminal') {
      agent.ticksAsCriminal++

      // Risk of violent death for criminals (dangerous lifestyle)
      if (ctx.rng() < 0.005 * (1 + agent.ticksAsCriminal * 0.1)) {
        ctx.killAgent(agent, 'Died from criminal lifestyle (violence)')
        continue
      }
    }

    // --- PREMATURE DEATH: caused by prolonged sickness + poverty + age ---
    if (ctx.params.diseasesEnabled && agent.isSick && agent.ticksSick >= ctx.config.deathSickTicks) {
      const ageFactor = agent.age > 50 ? 0.03 : 0.005
      const wealthFactor = agent.wealth < 0 ? 0.04 : 0.01
      if (ctx.rng() < ageFactor + wealthFactor) {
        ctx.killAgent(agent, `Premature death (sick ${agent.ticksSick} ticks, poverty)`)
        continue
      }
    }

    // --- DIVORCE (internal): caused by sustained low satisfaction ---
    // Only married agents can divorce
    if (agent.state !== 'criminal' && agent.partnerId) {
      if (agent.ticksLowSatisfaction >= DIVORCE_LOW_SAT_TICKS && agent.age > 22) {
        if (ctx.rng() < 0.02) {
          ctx.tickDivorces++
          // Break partner link
          const partner = ctx.agents.find((a) => a.id === agent.partnerId)
          if (partner) {
            partner.partnerId = null
            partner.satisfaction = clamp(partner.satisfaction - 0.15, 0, 1)
            partner.lifeEvents.push({
              tick: ctx.tick, type: 'divorced',
              description: 'Divorced (partner\'s low satisfaction)',
            })
            // Partner gets a new home (loses ownership — stays with primary agent)
            const homes = ctx.locations.filter((l) => l.type === 'home')
            if (homes.length > 0) {
              const newHome = homes.find((h) => (h.residentsCount ?? 0) < (h.maxResidents ?? 1))
                ?? homes[Math.floor(ctx.rng() * homes.length)]
              partner.homeId = newHome.id
              partner.homeOwned = false
              partner.homeDebt = 0
              partner.homeDebtPayment = 0
              partner.homeValue = newHome.housingValue ?? 300
            }
          }
          agent.partnerId = null
          // Children stay with this agent
          agent.wealth *= 0.7
          agent.satisfaction = clamp(agent.satisfaction - 0.2, 0, 1)
          agent.ticksLowSatisfaction = 0
          agent.lifeEvents.push({
            tick: ctx.tick, type: 'divorced',
            description: `Divorced after ${DIVORCE_LOW_SAT_TICKS}+ ticks of low satisfaction`,
          })

          // --- Divorce suicide risk: 1/10 chance for each ex-partner ---
          // Real-world: divorced individuals have significantly higher suicide rates
          if (ctx.rng() < 0.10) {
            agent.lifeEvents.push({
              tick: ctx.tick, type: 'divorce_suicide',
              description: 'Committed suicide following divorce',
            })
            ctx.killAgent(agent, 'Suicide following divorce')
            ctx.tickPrematureDeaths++
            continue
          }
          if (partner && partner.state !== 'dead' && ctx.rng() < 0.10) {
            partner.lifeEvents.push({
              tick: ctx.tick, type: 'divorce_suicide',
              description: 'Committed suicide following divorce',
            })
            ctx.killAgent(partner, 'Suicide following divorce')
            ctx.tickPrematureDeaths++
          }
        }
      }
    }

    // --- MARRIAGE: now requires proximity encounter (see processProximityInteractions) ---
    // No longer triggered by internal state alone
  }
}
