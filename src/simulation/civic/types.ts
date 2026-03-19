// ============================================================
// Civic Layer Types — profiles, opinions, referendums, blocs, results
// ============================================================

// --- Civic Profile (continuous traits, [0,1]) ---
export interface CivicProfile {
  economicInsecurity: number    // 0 = secure, 1 = very insecure
  institutionalTrust: number    // 0 = distrust, 1 = high trust
  automationShock: number       // 0 = unaffected, 1 = severely impacted
  authoritarianTendency: number // 0 = libertarian, 1 = authoritarian
  conformity: number            // 0 = independent, 1 = follows group
  politicalAttention: number    // 0 = apathetic, 1 = very engaged
}

// --- Opinion State (per-citizen, per-referendum) ---
export type OpinionLabel = 'YES' | 'NO' | 'UNDECIDED'
export type VoteChoice = 'YES' | 'NO' | 'ABSTAIN'

export interface OpinionState {
  referendumId: string
  score: number           // -1 to +1 (negative = NO, positive = YES)
  conviction: number      // 0–1 (how strongly held)
  label: OpinionLabel
  blocId: string | null
  voted: boolean
  vote: VoteChoice | null
}

// --- Referendum ---
export type ReferendumTopic = 'immigration' | 'redistribution' | 'automation_control' | 'custom'
export type ReferendumPhase = 'opinion_init' | 'influence' | 'voting' | 'results'

// --- Weight vector over civic profile traits ---
export interface CivicWeightVector {
  economicInsecurity: number
  institutionalTrust: number
  automationShock: number
  authoritarianTendency: number
  conformity: number
  politicalAttention: number
}

export interface Referendum {
  id: string
  topic: ReferendumTopic
  question: string
  phase: ReferendumPhase
  influenceRound: number     // current round (0-based)
  maxRounds: number          // default 3
  blocs: OpinionBloc[]
  result: ReferendumResult | null
  customWeights?: CivicWeightVector  // used when topic === 'custom'
}

// --- Opinion Bloc ---
export interface OpinionBloc {
  id: string
  label: OpinionLabel
  citizenIds: string[]
  avgScore: number
  cohesion: number           // lower = more cohesive (std deviation of scores)
}

// --- Vote Breakdown per sub-group ---
export interface VoteBreakdownEntry {
  yes: number
  no: number
  abstain: number
}

// --- Referendum Result ---
export interface ReferendumResult {
  turnout: number            // 0–1
  yesVotes: number
  noVotes: number
  abstainVotes: number
  yesShare: number           // of participating voters (excluding abstain)
  noShare: number
  breakdowns: {
    byEducation: Record<string, VoteBreakdownEntry>
    byEmployment: Record<string, VoteBreakdownEntry>
    byWealth: Record<string, VoteBreakdownEntry>       // quartile labels
    byHomeOwnership: Record<string, VoteBreakdownEntry> // 'owner' | 'renter'
    byReligion?: Record<string, VoteBreakdownEntry>     // affiliation labels (only when religion enabled)
  }
}

// --- Referendum Config (weight vector over civic profile traits) ---
export interface ReferendumConfig {
  topic: ReferendumTopic
  question: string
  weights: CivicWeightVector
}

// --- Citizen Memory (compact summary for inspector + future LLM) ---
export type CitizenTag =
  | 'displaced_by_ai'
  | 'homeowner'
  | 'precarious'
  | 'victim_of_crime'
  | 'entrepreneur'
  | 'retired'
  | 'criminal_record'
  | 'educated_high'
  | 'educated_low'
  | 'large_family'
  | 'divorced'
  | 'sick'
  | 'immigrant'

export interface CitizenMemorySummary {
  salientEvents: { tick: number; type: string; description: string }[]
  tags: CitizenTag[]
  politicalSummary: string   // one-line derived summary
  lastVote: VoteChoice | null
  lastBlocLabel: OpinionLabel | null
}
