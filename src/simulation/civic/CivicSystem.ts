// ============================================================
// CivicSystem — Initialize and update civic profiles from agent state
// Profiles are derived from the agent's material situation (wealth, employment, etc.)
// and reactively updated when life events occur.
// ============================================================

import type { Agent } from '../types'
import type { CivicProfile } from './types'

// --- Clamp helper ---
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

// ============================================================
// Initialize civic profile from agent's current material state
// Called once at agent creation or when civic layer is bootstrapped
// ============================================================
export function initCivicProfile(agent: Agent, avgWealth: number, rng: () => number): CivicProfile {
  // Skip children — give them neutral profiles
  if (agent.state === 'child') {
    return {
      economicInsecurity: 0.3 + rng() * 0.1,
      institutionalTrust: 0.5 + rng() * 0.1,
      automationShock: 0.0,
      authoritarianTendency: 0.3 + rng() * 0.2,
      conformity: 0.7 + rng() * 0.1,      // children are conformist
      politicalAttention: 0.05 + rng() * 0.05,
    }
  }

  // --- economicInsecurity: higher when poor/unemployed ---
  const wealthRatio = avgWealth > 0 ? agent.wealth / avgWealth : 0.5
  let economicInsecurity = clamp(1.0 - wealthRatio * 0.8, 0, 1)
  if (agent.state === 'unemployed') economicInsecurity = clamp(economicInsecurity + 0.25, 0, 1)
  if (agent.state === 'criminal') economicInsecurity = clamp(economicInsecurity + 0.3, 0, 1)
  economicInsecurity += (rng() - 0.5) * 0.1 // noise

  // --- institutionalTrust: higher for homeowners, employed, good credit ---
  let institutionalTrust = 0.4
  if (agent.homeOwned) institutionalTrust += 0.15
  if (agent.state === 'employed' || agent.state === 'business_owner') institutionalTrust += 0.15
  if (agent.creditScore > 0.6) institutionalTrust += 0.1
  if (agent.satisfaction > 0.5) institutionalTrust += 0.1
  if (agent.state === 'criminal' || agent.state === 'prisoner') institutionalTrust -= 0.3
  institutionalTrust += (rng() - 0.5) * 0.1

  // --- automationShock: derived from life events ---
  const autoEvents = agent.lifeEvents.filter(e =>
    e.type === 'automated' || e.type === 'economic_layoff'
  ).length
  let automationShock = clamp(autoEvents * 0.2, 0, 1)
  automationShock += (rng() - 0.5) * 0.05

  // --- authoritarianTendency: crime victims, low satisfaction ---
  const crimeVictimEvents = agent.lifeEvents.filter(e => e.type === 'crime_victim').length
  let authoritarianTendency = 0.3
  authoritarianTendency += crimeVictimEvents * 0.15
  if (agent.satisfaction < 0.3) authoritarianTendency += 0.15
  authoritarianTendency += (rng() - 0.5) * 0.15

  // --- conformity: older + less educated = more conformist ---
  let conformity = 0.4
  if (agent.age > 50) conformity += 0.15
  if (agent.age > 65) conformity += 0.1
  if (agent.education === 'low') conformity += 0.15
  if (agent.education === 'high') conformity -= 0.1
  conformity += (rng() - 0.5) * 0.1

  // --- politicalAttention: higher education + older = more attentive ---
  let politicalAttention = 0.3
  if (agent.education === 'high') politicalAttention += 0.25
  if (agent.education === 'medium') politicalAttention += 0.1
  if (agent.age > 30) politicalAttention += 0.1
  if (agent.age > 50) politicalAttention += 0.1
  if (agent.satisfaction > 0.5) politicalAttention += 0.05
  politicalAttention += (rng() - 0.5) * 0.1

  // --- Religion → civic bias: religiosity softly shapes civic traits ---
  if (agent.religion) {
    const rel = agent.religion
    // High religiosity → more conformist, slightly more authoritarian, higher community trust
    conformity += rel.religiosity * 0.12 + rel.communityEmbeddedness * 0.08
    authoritarianTendency += rel.religiosity * 0.08
    institutionalTrust += rel.communityEmbeddedness * 0.10
    // Discrimination exposure → less institutional trust, more economic insecurity
    economicInsecurity += rel.discriminationExposure * 0.10
    institutionalTrust -= rel.discriminationExposure * 0.12
    // High practice → slightly more political attention (engaged citizens)
    politicalAttention += rel.practiceLevel * 0.06
  }

  return {
    economicInsecurity: clamp(economicInsecurity, 0, 1),
    institutionalTrust: clamp(institutionalTrust, 0, 1),
    automationShock: clamp(automationShock, 0, 1),
    authoritarianTendency: clamp(authoritarianTendency, 0, 1),
    conformity: clamp(conformity, 0, 1),
    politicalAttention: clamp(politicalAttention, 0, 1),
  }
}

// ============================================================
// Default (neutral) civic profile — used as fallback
// ============================================================
export function defaultCivicProfile(): CivicProfile {
  return {
    economicInsecurity: 0.5,
    institutionalTrust: 0.5,
    automationShock: 0.0,
    authoritarianTendency: 0.3,
    conformity: 0.5,
    politicalAttention: 0.3,
  }
}

// ============================================================
// Update civic profile reactively from a life event
// Called after each relevant life event is pushed to agent.lifeEvents
// ============================================================
export function updateCivicProfileFromEvent(
  profile: CivicProfile,
  eventType: string,
  delta = 0.05,
): void {
  switch (eventType) {
    case 'automated':
    case 'economic_layoff':
      profile.economicInsecurity = clamp(profile.economicInsecurity + delta * 2, 0, 1)
      profile.institutionalTrust = clamp(profile.institutionalTrust - delta, 0, 1)
      profile.automationShock = clamp(profile.automationShock + delta * 3, 0, 1)
      break
    case 'hired':
      profile.economicInsecurity = clamp(profile.economicInsecurity - delta * 2, 0, 1)
      break
    case 'upskilled':
      profile.economicInsecurity = clamp(profile.economicInsecurity - delta, 0, 1)
      profile.politicalAttention = clamp(profile.politicalAttention + delta, 0, 1)
      break
    case 'crime_victim':
      profile.authoritarianTendency = clamp(profile.authoritarianTendency + delta * 2, 0, 1)
      profile.institutionalTrust = clamp(profile.institutionalTrust - delta, 0, 1)
      break
    case 'mortgage_paid':
    case 'home_bought':
      profile.institutionalTrust = clamp(profile.institutionalTrust + delta, 0, 1)
      profile.conformity = clamp(profile.conformity + delta * 0.5, 0, 1)
      break
    case 'bankrupt':
    case 'evicted':
      profile.economicInsecurity = clamp(profile.economicInsecurity + delta * 2, 0, 1)
      profile.institutionalTrust = clamp(profile.institutionalTrust - delta * 2, 0, 1)
      break
    case 'started_business':
      profile.economicInsecurity = clamp(profile.economicInsecurity - delta, 0, 1)
      profile.politicalAttention = clamp(profile.politicalAttention + delta, 0, 1)
      break
    case 'divorced':
      profile.institutionalTrust = clamp(profile.institutionalTrust - delta, 0, 1)
      break
    case 'married':
      profile.institutionalTrust = clamp(profile.institutionalTrust + delta * 0.5, 0, 1)
      profile.conformity = clamp(profile.conformity + delta * 0.5, 0, 1)
      break
    case 'became_criminal':
      profile.institutionalTrust = clamp(profile.institutionalTrust - delta * 3, 0, 1)
      profile.authoritarianTendency = clamp(profile.authoritarianTendency - delta, 0, 1)
      break
    case 'released_from_prison':
    case 'rehabilitated':
      profile.institutionalTrust = clamp(profile.institutionalTrust + delta, 0, 1)
      break
    case 'fired':
      profile.economicInsecurity = clamp(profile.economicInsecurity + delta, 0, 1)
      break
    case 'retired':
      profile.conformity = clamp(profile.conformity + delta, 0, 1)
      profile.politicalAttention = clamp(profile.politicalAttention - delta * 0.5, 0, 1)
      break
  }
}
