// ============================================================
// CivicEngine — Referendum pipeline: opinions, influence, blocs, vote
// Stateless functions that operate on agents + referendum state
// Only runs when a referendum is active (not every tick)
// ============================================================

import type { Agent, Location } from '../types'
import type {
  Referendum, ReferendumTopic, ReferendumResult,
  OpinionBloc, OpinionLabel, VoteChoice, VoteBreakdownEntry,
  CivicWeightVector,
} from './types'
import { REFERENDUM_CONFIGS, DEFAULT_MAX_ROUNDS, UNDECIDED_THRESHOLD, INFLUENCE_RING_WEIGHTS, NEIGHBOR_INFLUENCE_RADIUS } from './referendums'
import { RELIGION_WEIGHT_MODIFIERS } from '../religion/types'
import type { ReligiousAffiliation } from '../religion/types'
import { uid } from '../utils'

// --- Clamp helper ---
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

// ============================================================
// Group-Targeted Self-Interest Bias
// Detects if a referendum question targets a specific religious
// (or demographic) group and computes a per-group impact score.
// Members of targeted groups get a strong self-preservation bias.
// ============================================================

// Keywords that identify each religious group in question text
const GROUP_KEYWORDS: Record<ReligiousAffiliation, string[]> = {
  christian: ['christian', 'christians', 'christianity', 'church', 'churches', 'catholic', 'protestant', 'orthodox', 'chrétien', 'chrétiens', 'chrétienne', 'christianisme', 'église'],
  muslim:    ['muslim', 'muslims', 'islam', 'islamic', 'mosque', 'mosques', 'musulman', 'musulmans', 'musulmane', 'mosquée'],
  hindu:     ['hindu', 'hindus', 'hinduism', 'temple', 'hindou', 'hindous', 'hindouisme'],
  buddhist:  ['buddhist', 'buddhists', 'buddhism', 'bouddh', 'bouddhiste', 'bouddhistes', 'bouddhisme'],
  unaffiliated: ['atheist', 'atheists', 'atheism', 'secular', 'secularism', 'agnostic', 'non-religious', 'athée', 'athées', 'athéisme', 'laïc', 'laïque'],
}

// Catch-all keywords that target ALL religious groups
const ALL_RELIGION_KEYWORDS = ['religion', 'religions', 'religious', 'faith', 'faiths', 'worship', 'believer', 'believers', 'religieux', 'religieuse', 'croyant', 'croyants', 'culte']

// Negative framing → question HARMS the targeted group
const NEGATIVE_FRAME = ['war', 'attack', 'ban', 'restrict', 'deport', 'punish', 'tax', 'limit', 'against', 'fight', 'expel', 'discriminate', 'oppose', 'exclude', 'eliminate', 'remove', 'destroy', 'persecute', 'suppress', 'abolish', 'forbid', 'prohibit', 'guerre', 'attaquer', 'bannir', 'interdire', 'punir', 'combattre', 'expulser', 'supprimer', 'détruire', 'persécuter', 'contre']

// Positive framing → question BENEFITS the targeted group
const POSITIVE_FRAME = ['support', 'fund', 'protect', 'help', 'aid', 'welcome', 'embrace', 'include', 'promote', 'subsidize', 'defend', 'strengthen', 'empower', 'soutenir', 'financer', 'protéger', 'aider', 'accueillir', 'promouvoir', 'défendre', 'renforcer']

/**
 * Compute per-group impact score from the referendum question text.
 * Returns a map: affiliation → impact (-1 = strongly harms, +1 = strongly benefits, 0 = not targeted)
 */
function computeGroupImpact(question: string): Record<ReligiousAffiliation, number> {
  const q = question.toLowerCase()
  const impact: Record<ReligiousAffiliation, number> = {
    christian: 0, muslim: 0, hindu: 0, buddhist: 0, unaffiliated: 0,
  }

  // Detect framing direction
  const hasNeg = NEGATIVE_FRAME.some(kw => q.includes(kw))
  const hasPos = POSITIVE_FRAME.some(kw => q.includes(kw))
  // Net direction: negative frame → answering YES harms the group (-1)
  // positive frame → answering YES benefits the group (+1)
  const direction = hasNeg && !hasPos ? -1 : hasPos && !hasNeg ? 1 : hasNeg && hasPos ? -0.5 : 0
  if (direction === 0) return impact

  // Check if ALL religious groups are targeted
  const targetsAllReligion = ALL_RELIGION_KEYWORDS.some(kw => q.includes(kw))
  if (targetsAllReligion) {
    for (const aff of Object.keys(impact) as ReligiousAffiliation[]) {
      // "unaffiliated" is inversely affected when "all religion" is targeted
      impact[aff] = aff === 'unaffiliated' ? -direction * 0.3 : direction
    }
    return impact
  }

  // Check specific group mentions
  for (const [aff, keywords] of Object.entries(GROUP_KEYWORDS) as [ReligiousAffiliation, string[]][]) {
    if (keywords.some(kw => q.includes(kw))) {
      impact[aff] = direction
    }
  }

  return impact
}

// --- Score to label ---
function scoreToLabel(score: number): OpinionLabel {
  if (score > UNDECIDED_THRESHOLD) return 'YES'
  if (score < -UNDECIDED_THRESHOLD) return 'NO'
  return 'UNDECIDED'
}

// ============================================================
// 1. Create a new referendum
//    For preset topics, question/weights come from REFERENDUM_CONFIGS.
//    For custom topics, caller must provide question + weights.
// ============================================================
export function createReferendum(
  topic: ReferendumTopic,
  customQuestion?: string,
  customWeights?: CivicWeightVector,
): Referendum {
  if (topic === 'custom') {
    if (!customQuestion || !customWeights) {
      throw new Error('Custom referendum requires question and weights')
    }
    return {
      id: uid('ref'),
      topic,
      question: customQuestion,
      phase: 'opinion_init',
      influenceRound: 0,
      maxRounds: DEFAULT_MAX_ROUNDS,
      blocs: [],
      result: null,
      customWeights,
    }
  }
  const config = REFERENDUM_CONFIGS[topic]
  if (!config) throw new Error(`Unknown referendum topic: ${topic}`)
  return {
    id: uid('ref'),
    topic,
    question: config.question,
    phase: 'opinion_init',
    influenceRound: 0,
    maxRounds: DEFAULT_MAX_ROUNDS,
    blocs: [],
    result: null,
  }
}

// ============================================================
// 2. Initialize opinions — compute initial score per agent
// ============================================================
export function initializeOpinions(
  agents: Agent[],
  referendum: Referendum,
  rng: () => number,
): void {
  // Resolve weights: custom referendums carry their own, preset topics use REFERENDUM_CONFIGS
  const weights: CivicWeightVector | undefined =
    referendum.customWeights ?? REFERENDUM_CONFIGS[referendum.topic]?.weights
  if (!weights) return

  // Pre-compute group impact for self-interest bias (once per referendum)
  const groupImpact = computeGroupImpact(referendum.question)

  for (const agent of agents) {
    // Skip children and dead agents
    if (agent.state === 'child' || agent.state === 'dead') {
      agent.opinionState = null
      continue
    }

    const cp = agent.civicProfile
    const w = weights

    // Weighted sum of civic profile traits
    let score =
      cp.economicInsecurity * w.economicInsecurity +
      cp.institutionalTrust * w.institutionalTrust +
      cp.automationShock * w.automationShock +
      cp.authoritarianTendency * w.authoritarianTendency +
      cp.conformity * w.conformity +
      cp.politicalAttention * w.politicalAttention

    // --- Religion × Civic Weight Modifier ---
    // Shifts effective score based on agent's religious worldview
    // Proportional to religiosity: secular agents barely affected
    // Formula: score += Σ (civicProfile[trait] × modifier[trait] × religiosity)
    if (agent.religion) {
      const mods = RELIGION_WEIGHT_MODIFIERS[agent.religion.affiliation]
      if (mods) {
        const rel = agent.religion.religiosity
        score +=
          cp.economicInsecurity * mods.economicInsecurity * rel +
          cp.institutionalTrust * mods.institutionalTrust * rel +
          cp.automationShock * mods.automationShock * rel +
          cp.authoritarianTendency * mods.authoritarianTendency * rel +
          cp.conformity * mods.conformity * rel +
          cp.politicalAttention * mods.politicalAttention * rel
      }
    }

    // --- Self-Interest Bias ---
    // If the referendum question targets the agent's religious group,
    // apply a strong self-preservation or self-benefit modifier.
    // Strength scales with religiosity + communityEmbeddedness (in-group loyalty).
    // Impact: -1 = question harms my group (push toward NO), +1 = benefits (push toward YES)
    if (agent.religion) {
      const impact = groupImpact[agent.religion.affiliation]
      if (impact !== 0) {
        const rel = agent.religion
        const selfInterestStrength = 0.3 + rel.religiosity * 0.3 + rel.communityEmbeddedness * 0.2
        score += impact * selfInterestStrength
      }
    }

    // Personal bias: each agent has a random baseline disposition [-0.2, +0.2]
    // This ensures opinion diversity even when civic profiles are similar
    const personalBias = (rng() - 0.5) * 0.4
    score += personalBias

    // Additional noise
    score += (rng() - 0.5) * 0.1
    score = clamp(score, -1, 1)

    // Conviction: floor of 0.15 so even lukewarm agents have some conviction
    // Scales with |score| and political attention
    const conviction = clamp(
      0.15 + Math.abs(score) * 0.5 + cp.politicalAttention * 0.3 * rng(),
      0, 1
    )

    const label = scoreToLabel(score)

    agent.opinionState = {
      referendumId: referendum.id,
      score,
      conviction,
      label,
      blocId: null,
      voted: false,
      vote: null,
    }
  }

  referendum.phase = 'influence'
}

// ============================================================
// 3. Form blocs — group agents by label
// ============================================================
export function formBlocs(agents: Agent[], referendum: Referendum): void {
  const groups: Record<OpinionLabel, Agent[]> = {
    YES: [],
    NO: [],
    UNDECIDED: [],
  }

  for (const agent of agents) {
    if (!agent.opinionState || agent.opinionState.referendumId !== referendum.id) continue
    groups[agent.opinionState.label].push(agent)
  }

  referendum.blocs = (['YES', 'NO', 'UNDECIDED'] as OpinionLabel[]).map(label => {
    const members = groups[label]
    const scores = members.map(a => a.opinionState!.score)
    const avg = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0
    const variance = scores.length > 1
      ? scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length
      : 0
    const bloc: OpinionBloc = {
      id: uid(`bloc-${label.toLowerCase()}`),
      label,
      citizenIds: members.map(a => a.id),
      avgScore: avg,
      cohesion: Math.sqrt(variance), // std deviation — lower = more cohesive
    }
    // Assign blocId to each member
    for (const a of members) {
      a.opinionState!.blocId = bloc.id
    }
    return bloc
  })
}

// ============================================================
// 4. Run one influence round — social influence via 3 rings
// ============================================================
export function runInfluenceRound(
  agents: Agent[],
  _locations: Location[],
  referendum: Referendum,
  rng: () => number,
): void {
  // Pre-compute agent lookup by homeId and workplaceId for O(1) ring resolution
  const byHome = new Map<string, Agent[]>()
  const byWorkplace = new Map<string, Agent[]>()

  const eligible: Agent[] = []
  for (const a of agents) {
    if (!a.opinionState || a.opinionState.referendumId !== referendum.id) continue
    eligible.push(a)

    // Ring 1: household
    if (a.homeId) {
      let arr = byHome.get(a.homeId)
      if (!arr) { arr = []; byHome.set(a.homeId, arr) }
      arr.push(a)
    }
    // Ring 3: coworkers
    if (a.workplaceId) {
      let arr = byWorkplace.get(a.workplaceId)
      if (!arr) { arr = []; byWorkplace.set(a.workplaceId, arr) }
      arr.push(a)
    }
  }

  // Collect new scores (don't mutate during iteration)
  const newScores = new Map<string, number>()

  for (const agent of eligible) {
    const os = agent.opinionState!
    const cp = agent.civicProfile
    let totalWeight = 0
    let weightedSum = 0

    // Ring 1: household (same homeId)
    const household = byHome.get(agent.homeId) ?? []
    for (const other of household) {
      if (other.id === agent.id) continue
      weightedSum += other.opinionState!.score * INFLUENCE_RING_WEIGHTS.household
      totalWeight += INFLUENCE_RING_WEIGHTS.household
    }

    // Ring 2: spatial neighbors (within radius)
    const r2 = NEIGHBOR_INFLUENCE_RADIUS * NEIGHBOR_INFLUENCE_RADIUS
    for (const other of eligible) {
      if (other.id === agent.id) continue
      const dx = other.position.x - agent.position.x
      const dy = other.position.y - agent.position.y
      if (dx * dx + dy * dy <= r2) {
        weightedSum += other.opinionState!.score * INFLUENCE_RING_WEIGHTS.neighbors
        totalWeight += INFLUENCE_RING_WEIGHTS.neighbors
      }
    }

    // Ring 3: coworkers (same workplaceId)
    if (agent.workplaceId) {
      const coworkers = byWorkplace.get(agent.workplaceId) ?? []
      for (const other of coworkers) {
        if (other.id === agent.id) continue
        weightedSum += other.opinionState!.score * INFLUENCE_RING_WEIGHTS.coworkers
        totalWeight += INFLUENCE_RING_WEIGHTS.coworkers
      }
    }

    if (totalWeight > 0) {
      const ringAvg = weightedSum / totalWeight
      // Influence strength: conformity pulls toward group, conviction resists change
      const influenceStrength = cp.conformity * (1 - os.conviction * 0.6)
      const newScore = clamp(
        os.score + (ringAvg - os.score) * influenceStrength * 0.3,
        -1, 1
      )
      newScores.set(agent.id, newScore)
    }
  }

  // Apply new scores
  for (const agent of eligible) {
    const newScore = newScores.get(agent.id)
    if (newScore !== undefined) {
      agent.opinionState!.score = newScore
      agent.opinionState!.label = scoreToLabel(newScore)
      // Conviction adjusts: strengthens if aligned with group, weakens if pushed
      agent.opinionState!.conviction = clamp(
        Math.abs(newScore) * agent.civicProfile.politicalAttention * (0.6 + 0.4 * rng()),
        0, 1
      )
    }
  }

  referendum.influenceRound++
}

// ============================================================
// 5. Run vote — each agent votes or abstains
// ============================================================
export function runVote(
  agents: Agent[],
  referendum: Referendum,
  rng: () => number,
): void {
  referendum.phase = 'voting'

  for (const agent of agents) {
    if (!agent.opinionState || agent.opinionState.referendumId !== referendum.id) continue
    const os = agent.opinionState
    const cp = agent.civicProfile

    // Participation probability: higher attention + conviction = more likely to vote
    // Base floor of 0.35 ensures reasonable turnout even at early ticks
    const participationProb = clamp(
      0.35 + cp.politicalAttention * 0.3 + os.conviction * 0.25,
      0, 1
    )

    if (rng() < participationProb) {
      // Participates
      if (os.label === 'UNDECIDED') {
        // Undecided: lean toward score sign with some randomness
        os.vote = (os.score + (rng() - 0.5) * 0.1) > 0 ? 'YES' : 'NO'
      } else {
        os.vote = os.label as VoteChoice
      }
    } else {
      os.vote = 'ABSTAIN'
    }
    os.voted = true
  }
}

// ============================================================
// 6. Compute breakdowns and final result
// ============================================================
export function computeBreakdowns(
  agents: Agent[],
  referendum: Referendum,
): ReferendumResult {
  let yesVotes = 0
  let noVotes = 0
  let abstainVotes = 0
  let totalEligible = 0

  // Breakdown accumulators
  const byEducation: Record<string, VoteBreakdownEntry> = {}
  const byEmployment: Record<string, VoteBreakdownEntry> = {}
  const byWealth: Record<string, VoteBreakdownEntry> = {}
  const byHomeOwnership: Record<string, VoteBreakdownEntry> = {}
  const byReligion: Record<string, VoteBreakdownEntry> = {}

  // Compute wealth quartiles
  const eligibleAgents = agents.filter(a =>
    a.opinionState && a.opinionState.referendumId === referendum.id && a.opinionState.voted
  )
  const sortedWealth = eligibleAgents.map(a => a.wealth).sort((a, b) => a - b)
  const q1 = sortedWealth[Math.floor(sortedWealth.length * 0.25)] ?? 0
  const q2 = sortedWealth[Math.floor(sortedWealth.length * 0.50)] ?? 0
  const q3 = sortedWealth[Math.floor(sortedWealth.length * 0.75)] ?? 0

  function wealthQuartile(w: number): string {
    if (w <= q1) return 'Q1 (poorest)'
    if (w <= q2) return 'Q2'
    if (w <= q3) return 'Q3'
    return 'Q4 (richest)'
  }

  function addToBreakdown(record: Record<string, VoteBreakdownEntry>, key: string, vote: VoteChoice) {
    if (!record[key]) record[key] = { yes: 0, no: 0, abstain: 0 }
    if (vote === 'YES') record[key].yes++
    else if (vote === 'NO') record[key].no++
    else record[key].abstain++
  }

  for (const agent of eligibleAgents) {
    const os = agent.opinionState!
    totalEligible++

    if (os.vote === 'YES') yesVotes++
    else if (os.vote === 'NO') noVotes++
    else abstainVotes++

    const vote = os.vote!
    addToBreakdown(byEducation, agent.education, vote)
    addToBreakdown(byEmployment, agent.state, vote)
    addToBreakdown(byWealth, wealthQuartile(agent.wealth), vote)
    addToBreakdown(byHomeOwnership, agent.homeOwned ? 'owner' : 'renter', vote)
    if (agent.religion) {
      addToBreakdown(byReligion, agent.religion.affiliation, vote)
    }
  }

  const participating = yesVotes + noVotes
  const result: ReferendumResult = {
    turnout: totalEligible > 0 ? (yesVotes + noVotes) / totalEligible : 0,
    yesVotes,
    noVotes,
    abstainVotes,
    yesShare: participating > 0 ? yesVotes / participating : 0,
    noShare: participating > 0 ? noVotes / participating : 0,
    breakdowns: {
      byEducation,
      byEmployment,
      byWealth,
      byHomeOwnership,
      byReligion: Object.keys(byReligion).length > 0 ? byReligion : undefined,
    },
  }

  referendum.result = result
  referendum.phase = 'results'
  return result
}

// ============================================================
// Run full referendum pipeline in one call (convenience)
// ============================================================
export function runFullReferendum(
  topic: ReferendumTopic,
  agents: Agent[],
  locations: Location[],
  rng: () => number,
): Referendum {
  const referendum = createReferendum(topic)

  // 1. Initialize opinions
  initializeOpinions(agents, referendum, rng)

  // 2. Form initial blocs
  formBlocs(agents, referendum)

  // 3. Run influence rounds
  for (let i = 0; i < referendum.maxRounds; i++) {
    runInfluenceRound(agents, locations, referendum, rng)
  }

  // 4. Refresh blocs after influence
  formBlocs(agents, referendum)

  // 5. Vote
  runVote(agents, referendum, rng)

  // 6. Compute results
  computeBreakdowns(agents, referendum)

  // 7. Add voted life event to participating agents
  for (const agent of agents) {
    if (agent.opinionState?.voted && agent.opinionState.vote !== 'ABSTAIN') {
      agent.lifeEvents.push({
        tick: 0, // will be overridden by caller if needed
        type: 'voted',
        description: `Voted ${agent.opinionState.vote} on "${referendum.question}"`,
      })
    }
  }

  return referendum
}
