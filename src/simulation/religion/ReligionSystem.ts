// ============================================================
// ReligionSystem — Initialization, transmission, compatibility, evolution
// All effects are probabilistic soft modifiers, never deterministic
// ============================================================

import type { Agent } from '../types'
import type { SimulationContext } from '../SimulationContext'
import type {
  ReligiousAffiliation,
  ReligionProfile,
  ReligionConfig,
} from './types'
import { AFFILIATIONS } from './types'

// ============================================================
// Helpers
// ============================================================
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

// Sample from a clipped normal distribution in [0,1] with given mean and stddev
function clippedNormal(mean: number, stddev: number, rng: () => number): number {
  // Box-Muller transform for normal distribution
  const u1 = rng() || 0.0001 // avoid log(0)
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return clamp(mean + z * stddev, 0, 1)
}

// ============================================================
// 1. Assign affiliation — weighted random by configured shares
// ============================================================
export function assignAffiliation(config: ReligionConfig, rng: () => number): ReligiousAffiliation {
  const r = rng()
  let cumulative = 0
  for (const aff of AFFILIATIONS) {
    cumulative += config.shares[aff]
    if (r < cumulative) return aff
  }
  // Fallback (rounding)
  return AFFILIATIONS[AFFILIATIONS.length - 1]
}

// ============================================================
// 2. Initialize a religion profile from affiliation + config
//    Uses group-specific overlapping distributions (clipped normal)
//    Stddev = 0.18 ensures substantial intra-group variance
// ============================================================
const STDDEV = 0.18

export function initReligionProfile(
  affiliation: ReligiousAffiliation,
  config: ReligionConfig,
  rng: () => number,
): ReligionProfile {
  const religiosity = clippedNormal(config.meanReligiosity[affiliation], STDDEV, rng)
  const practiceLevel = clippedNormal(config.meanPracticeLevel[affiliation], STDDEV, rng)
  const communityEmbeddedness = clippedNormal(config.meanCommunityEmbeddedness[affiliation], STDDEV, rng)
  const religiousTransmissionStrength = clippedNormal(config.meanTransmissionStrength[affiliation], STDDEV, rng)

  // Discrimination exposure: computed later based on population shares
  // For now, initialize to a small baseline
  const discriminationExposure = 0

  return {
    affiliation,
    religiosity,
    practiceLevel,
    communityEmbeddedness,
    religiousTransmissionStrength,
    discriminationExposure,
  }
}

// ============================================================
// 3. Default (neutral) religion profile — unaffiliated fallback
// ============================================================
export function defaultReligionProfile(): ReligionProfile {
  return {
    affiliation: 'unaffiliated',
    religiosity: 0.1,
    practiceLevel: 0.05,
    communityEmbeddedness: 0.2,
    religiousTransmissionStrength: 0.1,
    discriminationExposure: 0,
  }
}

// ============================================================
// 4. Compute discrimination exposure based on local population shares
//    Minority religions face higher discrimination
//    Modulated by global discriminationIntensity
// ============================================================
export function computeDiscriminationExposure(
  affiliation: ReligiousAffiliation,
  localShares: Record<ReligiousAffiliation, number>,
  intensity: number,
  rng: () => number,
): number {
  const ownShare = localShares[affiliation] || 0
  // Smaller share → higher exposure (inverted and scaled)
  // Share 0.5+ → near-zero discrimination, share <0.05 → high discrimination
  const baseFactor = clamp(1 - ownShare * 2, 0, 1)
  // Unaffiliated get lower discrimination (secular context assumed)
  const affiliationMod = affiliation === 'unaffiliated' ? 0.3 : 1.0
  const noise = (rng() - 0.5) * 0.08
  return clamp(baseFactor * affiliationMod * intensity + noise, 0, 1)
}

// ============================================================
// 5. Compute all agents' discrimination exposure (bulk)
//    Called once at init and periodically during evolution
// ============================================================
export function updateDiscriminationExposure(
  agents: Agent[],
  config: ReligionConfig,
  rng: () => number,
): void {
  // Compute actual population shares
  const living = agents.filter(a => a.state !== 'dead' && a.religion)
  const total = living.length || 1
  const counts: Record<ReligiousAffiliation, number> = {
    christian: 0, muslim: 0, unaffiliated: 0, hindu: 0, buddhist: 0,
  }
  for (const a of living) {
    if (a.religion) counts[a.religion.affiliation]++
  }
  const localShares: Record<ReligiousAffiliation, number> = {
    christian: counts.christian / total,
    muslim: counts.muslim / total,
    unaffiliated: counts.unaffiliated / total,
    hindu: counts.hindu / total,
    buddhist: counts.buddhist / total,
  }

  for (const a of living) {
    if (a.religion) {
      a.religion.discriminationExposure = computeDiscriminationExposure(
        a.religion.affiliation,
        localShares,
        config.discriminationIntensity,
        rng,
      )
    }
  }
}

// ============================================================
// 6. Marriage religion compatibility score
//    Returns a modifier in [-0.15, +0.10] that multiplies marriage chance
//    Same affiliation + high religiosity → bonus
//    Mixed + high religiosity mismatch → penalty
//    Low practice on both sides → near-neutral
// ============================================================
export function computeReligionCompatibility(a: Agent, b: Agent): number {
  if (!a.religion || !b.religion) return 0

  const ra = a.religion
  const rb = b.religion

  if (ra.affiliation === rb.affiliation) {
    // Same affiliation: bonus scaled by average religiosity and community
    const avgRel = (ra.religiosity + rb.religiosity) / 2
    const avgComm = (ra.communityEmbeddedness + rb.communityEmbeddedness) / 2
    return 0.02 + avgRel * 0.04 + avgComm * 0.04 // range: +0.02 to +0.10
  }

  // Different affiliation
  const maxRel = Math.max(ra.religiosity, rb.religiosity)
  const avgComm = (ra.communityEmbeddedness + rb.communityEmbeddedness) / 2

  // Penalty scales with how religious the MORE religious partner is
  let penalty = -0.03 - maxRel * 0.06 - avgComm * 0.06 // range: -0.03 to -0.15

  // Unaffiliated partner reduces penalty (tolerance)
  if (ra.affiliation === 'unaffiliated' || rb.affiliation === 'unaffiliated') {
    penalty *= 0.5
  }

  return penalty
}

// ============================================================
// 7. Fertility modifier from religion
//    Returns an additive modifier to birth probability
//    Range: roughly [-0.06, +0.09] — soft push, not dominant
// ============================================================
export function computeFertilityModifier(agent: Agent, partner: Agent): number {
  if (!agent.religion || !partner.religion) return 0

  // Average religion traits of the couple
  const avgRel = (agent.religion.religiosity + partner.religion.religiosity) / 2
  const avgComm = (agent.religion.communityEmbeddedness + partner.religion.communityEmbeddedness) / 2
  const avgPractice = (agent.religion.practiceLevel + partner.religion.practiceLevel) / 2

  // familyOrientation derived from religion traits
  const familyOrientation = 0.3 * avgRel + 0.3 * avgComm + 0.2 * avgPractice

  // Center around 0.4 (neutral point), scale effect
  // familyOrientation 0.8 → +0.06, familyOrientation 0.1 → -0.045
  return (familyOrientation - 0.4) * 0.15
}

// ============================================================
// 8. Transmit religion to child
//    Based on parents' affiliations, religiosity, practice, transmission strength
//    Mixed parents → higher chance of unaffiliated
// ============================================================
export function transmitReligion(
  parent1: Agent,
  parent2: Agent,
  config: ReligionConfig,
  rng: () => number,
): ReligionProfile {
  const r1 = parent1.religion
  const r2 = parent2.religion

  // If neither parent has religion, default to unaffiliated
  if (!r1 && !r2) return defaultReligionProfile()

  // If only one has religion, use that one (with reduced strength)
  if (!r1 || !r2) {
    const p = r1 || r2!
    const transmitProb = p.religiousTransmissionStrength * 0.6
    if (rng() < transmitProb) {
      return initReligionProfile(p.affiliation, config, rng)
    }
    return initReligionProfile('unaffiliated', config, rng)
  }

  // Both parents have religion
  if (r1.affiliation === r2.affiliation) {
    // Same affiliation: high transmission
    const avgTransmit = (r1.religiousTransmissionStrength + r2.religiousTransmissionStrength) / 2
    const avgRel = (r1.religiosity + r2.religiosity) / 2
    const transmitProb = 0.5 + avgTransmit * 0.3 + avgRel * 0.15
    // 50% base + up to 45% from high transmission/religiosity = 50-95%

    if (rng() < transmitProb) {
      return initReligionProfile(r1.affiliation, config, rng)
    }
    // Failed transmission → unaffiliated child
    return initReligionProfile('unaffiliated', config, rng)
  }

  // Mixed parents: weighted by religiosity and transmission strength
  const score1 = r1.religiosity * 0.4 + r1.religiousTransmissionStrength * 0.4 + r1.communityEmbeddedness * 0.2
  const score2 = r2.religiosity * 0.4 + r2.religiousTransmissionStrength * 0.4 + r2.communityEmbeddedness * 0.2
  const total = score1 + score2

  // Chance of unaffiliated is higher when both parents are weakly religious
  const weakParents = (score1 < 0.3 && score2 < 0.3)
  const unaffiliatedChance = weakParents ? 0.5 : 0.2

  if (rng() < unaffiliatedChance) {
    return initReligionProfile('unaffiliated', config, rng)
  }

  // Otherwise, probabilistic choice between parent affiliations
  const prob1 = total > 0 ? score1 / total : 0.5
  const chosenAff = rng() < prob1 ? r1.affiliation : r2.affiliation
  return initReligionProfile(chosenAff, config, rng)
}

// ============================================================
// 9. Hiring discrimination modifier
//    Returns a penalty factor [0, 1] where 1 = no penalty
//    Applied to hiring probability
// ============================================================
export function getHiringDiscriminationFactor(agent: Agent, intensity: number): number {
  if (!agent.religion) return 1
  // Up to ~15% reduction in hiring probability for max discrimination
  const penalty = agent.religion.discriminationExposure * intensity * 0.15
  return clamp(1 - penalty, 0.85, 1)
}

// ============================================================
// 10. Community network support bonus
//     Returns a small bonus [0, 0.05] that offsets economic shocks
// ============================================================
export function getNetworkSupportBonus(agent: Agent): number {
  if (!agent.religion) return 0
  return agent.religion.communityEmbeddedness * 0.05
}

// ============================================================
// 11. Religion evolution — called once per year
//     Handles: disaffiliation, conversion, religiosity drift
// ============================================================
export function processReligionEvolution(ctx: SimulationContext): void {
  const config = ctx.params.religionConfig
  if (!config || !config.enabled) return

  const living = ctx.agents.filter(a => a.state !== 'dead' && a.state !== 'child' && a.religion)

  for (const agent of living) {
    if (!agent.religion) continue

    // --- Disaffiliation ---
    // Higher for: educated, low community, low religiosity, low practice
    if (agent.religion.affiliation !== 'unaffiliated') {
      const eduBoost = agent.education === 'high' ? 0.5 : agent.education === 'medium' ? 0.2 : 0
      const communityResist = agent.religion.communityEmbeddedness * 0.6
      const religiosityResist = agent.religion.religiosity * 0.4
      const disaffProb = config.disaffiliationBaseRate * (1 + eduBoost) * (1 - communityResist) * (1 - religiosityResist)

      if (ctx.rng() < disaffProb) {
        agent.religion.affiliation = 'unaffiliated'
        agent.religion.religiosity = clamp(agent.religion.religiosity * 0.2, 0, 0.15)
        agent.religion.practiceLevel = 0
        agent.religion.communityEmbeddedness = clamp(agent.religion.communityEmbeddedness * 0.3, 0, 0.2)
        agent.religion.religiousTransmissionStrength = 0.1
      }
    }

    // --- Conversion (very rare) ---
    // Triggered mainly by marriage to different-religion partner
    if (agent.partnerId && ctx.rng() < config.conversionBaseRate) {
      const partner = ctx.agents.find(p => p.id === agent.partnerId)
      if (partner?.religion && partner.religion.affiliation !== agent.religion.affiliation) {
        // Convert to partner's religion if partner has high community + religiosity
        const partnerInfluence = partner.religion.communityEmbeddedness * 0.5 + partner.religion.religiosity * 0.5
        if (partnerInfluence > 0.6 && ctx.rng() < 0.3) {
          agent.religion.affiliation = partner.religion.affiliation
          agent.religion.religiosity = clamp(partnerInfluence * 0.6, 0.1, 0.6)
          agent.religion.practiceLevel = clamp(partnerInfluence * 0.4, 0.05, 0.4)
        }
      }
    }

    // --- Religiosity drift ---
    // Small random walk: community stabilizes, age slightly increases
    const communityPull = (agent.religion.communityEmbeddedness - agent.religion.religiosity) * 0.02
    const agePull = agent.age > 50 ? 0.005 : agent.age < 25 ? -0.003 : 0
    const noise = (ctx.rng() - 0.5) * 0.02
    agent.religion.religiosity = clamp(agent.religion.religiosity + communityPull + agePull + noise, 0, 1)

    // Practice drifts toward religiosity
    const practicePull = (agent.religion.religiosity - agent.religion.practiceLevel) * 0.03
    agent.religion.practiceLevel = clamp(agent.religion.practiceLevel + practicePull + (ctx.rng() - 0.5) * 0.01, 0, 1)
  }

  // Update discrimination exposure based on current population shares
  updateDiscriminationExposure(ctx.agents, config, ctx.rng)
}
