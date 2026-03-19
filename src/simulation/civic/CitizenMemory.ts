// ============================================================
// CitizenMemory — Compact agent memory builder
// Extracts salient events, tags, and political summary for UI/inspector
// Designed to be fast, serializable, and useful for future LLM layer
// ============================================================

import type { Agent } from '../types'
import type { CitizenMemorySummary, CitizenTag } from './types'

// --- Priority events (higher priority = more likely to be selected) ---
const SALIENT_EVENT_TYPES = new Set([
  'automated', 'economic_layoff', 'fired', 'hired', 'started_business',
  'bankrupt', 'divorced', 'married', 'crime_victim', 'became_criminal',
  'rehabilitated', 'upskilled', 'home_bought', 'mortgage_paid', 'evicted',
  'disease', 'recovered', 'premature_death', 'voted', 'sent_to_prison',
  'released_from_prison', 'went_on_strike',
])

const MAX_SALIENT_EVENTS = 10

// ============================================================
// Build a compact memory summary for a citizen
// ============================================================
export function buildCitizenMemory(agent: Agent): CitizenMemorySummary {
  // --- Salient events: filter and take last N ---
  const salient = agent.lifeEvents
    .filter(e => SALIENT_EVENT_TYPES.has(e.type))
    .slice(-MAX_SALIENT_EVENTS)
    .map(e => ({ tick: e.tick, type: e.type, description: e.description }))

  // --- Tags: derived from agent state and history ---
  const tags: CitizenTag[] = []

  const hasAutoEvent = agent.lifeEvents.some(e => e.type === 'automated' || e.type === 'economic_layoff')
  if (hasAutoEvent) tags.push('displaced_by_ai')

  if (agent.homeOwned) tags.push('homeowner')

  if (agent.wealth < 30 || agent.state === 'unemployed') tags.push('precarious')

  if (agent.lifeEvents.some(e => e.type === 'crime_victim')) tags.push('victim_of_crime')

  if (agent.state === 'business_owner') tags.push('entrepreneur')

  if (agent.state === 'retired') tags.push('retired')

  if (agent.lifeEvents.some(e => e.type === 'became_criminal' || e.type === 'sent_to_prison')) {
    tags.push('criminal_record')
  }

  if (agent.education === 'high') tags.push('educated_high')
  if (agent.education === 'low') tags.push('educated_low')

  if (agent.children >= 3) tags.push('large_family')

  if (agent.lifeEvents.some(e => e.type === 'divorced')) tags.push('divorced')

  if (agent.isSick) tags.push('sick')

  // --- Political summary: one-line derived from civic profile ---
  const cp = agent.civicProfile
  const parts: string[] = []

  if (cp.economicInsecurity > 0.6) parts.push('economically anxious')
  else if (cp.economicInsecurity < 0.3) parts.push('economically secure')

  if (cp.institutionalTrust > 0.6) parts.push('trusts institutions')
  else if (cp.institutionalTrust < 0.3) parts.push('distrusts institutions')

  if (cp.automationShock > 0.5) parts.push('automation-impacted')

  if (cp.authoritarianTendency > 0.6) parts.push('authoritarian-leaning')
  else if (cp.authoritarianTendency < 0.3) parts.push('libertarian-leaning')

  if (cp.conformity > 0.7) parts.push('conformist')
  else if (cp.conformity < 0.3) parts.push('independent-minded')

  if (cp.politicalAttention > 0.6) parts.push('politically engaged')
  else if (cp.politicalAttention < 0.3) parts.push('politically apathetic')

  const politicalSummary = parts.length > 0 ? parts.join(', ') : 'moderate views'

  // --- Last vote ---
  const lastVoteEvent = agent.opinionState?.voted ? agent.opinionState.vote : null
  const lastBlocLabel = agent.opinionState?.label ?? null

  return {
    salientEvents: salient,
    tags,
    politicalSummary,
    lastVote: lastVoteEvent,
    lastBlocLabel,
  }
}
