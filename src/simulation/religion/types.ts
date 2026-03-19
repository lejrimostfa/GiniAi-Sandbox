// ============================================================
// Religion Layer V1 — Types, Config, Defaults
// Probabilistic social layer: affects marriage, fertility,
// income bias, civic opinion — all through soft modifiers
// ============================================================

import type { CivicWeightVector } from '../civic/types'

// --- Religious Affiliation (5 world-scale categories) ---
export type ReligiousAffiliation =
  | 'christian'
  | 'muslim'
  | 'unaffiliated'
  | 'hindu'
  | 'buddhist'

export const AFFILIATIONS: ReligiousAffiliation[] = [
  'christian', 'muslim', 'unaffiliated', 'hindu', 'buddhist',
]

// --- Emoji mapping for UI ---
export const AFFILIATION_EMOJI: Record<ReligiousAffiliation, string> = {
  christian: '✝️',
  muslim: '☪️',
  hindu: '🕉️',
  buddhist: '☸️',
  unaffiliated: '∅',
}

// --- Color mapping for charts/heatmap ---
export const AFFILIATION_COLORS: Record<ReligiousAffiliation, string> = {
  christian: '#4A90D9',   // blue
  muslim: '#2ECC71',      // green
  hindu: '#E67E22',       // orange
  buddhist: '#F1C40F',    // yellow/gold
  unaffiliated: '#95A5A6', // grey
}

// --- Per-citizen religion profile ---
export interface ReligionProfile {
  affiliation: ReligiousAffiliation
  religiosity: number                    // [0,1] internal belief intensity
  practiceLevel: number                  // [0,1] external practice / visible engagement
  communityEmbeddedness: number          // [0,1] social anchoring in religious community
  religiousTransmissionStrength: number  // [0,1] likelihood of transmitting to children
  discriminationExposure: number         // [0,1] context-dependent, not purely religious
}

// --- Global religion configuration ---
export interface ReligionConfig {
  enabled: boolean
  shares: Record<ReligiousAffiliation, number>  // must sum to 1
  // Group-level initialization priors (mean values for clipped-normal sampling)
  meanReligiosity: Record<ReligiousAffiliation, number>
  meanPracticeLevel: Record<ReligiousAffiliation, number>
  meanCommunityEmbeddedness: Record<ReligiousAffiliation, number>
  meanTransmissionStrength: Record<ReligiousAffiliation, number>
  // Dynamic parameters
  disaffiliationBaseRate: number   // per-year probability of becoming unaffiliated
  conversionBaseRate: number       // per-year probability of switching (very low)
  discriminationIntensity: number  // 0-1 global multiplier on discrimination effects
}

// ============================================================
// Religion × Civic Weight Modifier Matrix
// How each religion modifies the APPLICATION of civic weights
// during referendum opinion computation.
//
// Mechanism: effectiveScore += Σ (civicProfile[trait] × modifier[trait] × religiosity)
// - Topic-agnostic: works for all referendums (predefined or LLM-generated)
// - Proportional to religiosity: secular agents barely affected
// - Soft: max single-trait contribution ≈ ±0.10 (5-10% of score range)
//
// Positive modifier = AMPLIFIES that trait's influence direction
// Negative modifier = DAMPENS or REVERSES that trait's influence
// ============================================================
export const RELIGION_WEIGHT_MODIFIERS: Record<ReligiousAffiliation, CivicWeightVector> = {
  // --- Christian: tradition, moral community, civic duty ---
  // Conformity & authority amplified (community norms, moral consensus)
  // Institutional trust amplified (church-state familiarity, establishment)
  // Political engagement slightly boosted (civic duty tradition)
  christian: {
    economicInsecurity: 0.03,       // mild: charity orientation, concern for poor
    institutionalTrust: 0.06,       // trust in established institutions
    automationShock: 0.00,          // neutral on technology
    authoritarianTendency: 0.05,    // hierarchy, moral authority
    conformity: 0.08,               // community norms, tradition
    politicalAttention: 0.04,       // civic duty, engaged citizenship
  },

  // --- Muslim: ummah, solidarity, social justice, community ---
  // Strong conformity & solidarity amplification
  // Economic insecurity trait amplified (zakat, justice for disadvantaged)
  // Community-driven political engagement
  muslim: {
    economicInsecurity: 0.08,       // strong: zakat, solidarity with disadvantaged
    institutionalTrust: 0.04,       // respect for authority structures
    automationShock: 0.02,          // slight caution toward disruption
    authoritarianTendency: 0.06,    // moral authority, social order
    conformity: 0.10,               // strong community norms, collective identity
    politicalAttention: 0.05,       // community engagement, duty
  },

  // --- Hindu: dharma, social harmony, hierarchy ---
  // Moderate conformity & institutional trust
  // Respect for established social order
  hindu: {
    economicInsecurity: 0.03,       // moderate concern
    institutionalTrust: 0.05,       // respect for established order
    automationShock: 0.00,          // neutral/positive toward innovation
    authoritarianTendency: 0.04,    // hierarchical tradition
    conformity: 0.06,               // social harmony, dharma
    politicalAttention: 0.03,       // moderate engagement
  },

  // --- Buddhist: individual path, compassion, non-attachment ---
  // Dampens conformity & authoritarianism (individual path)
  // Slight openness to change (impermanence)
  // Compassion amplifies economic concern
  buddhist: {
    economicInsecurity: 0.05,       // compassion for suffering
    institutionalTrust: 0.02,       // moderate respect
    automationShock: -0.03,         // openness to change, impermanence
    authoritarianTendency: -0.06,   // non-violence, anti-authoritarian
    conformity: -0.04,              // individual path, less group pressure
    politicalAttention: 0.02,       // moderate, mindful engagement
  },

  // --- Unaffiliated: secular, individualist, progressive ---
  // Dampens conformity & authoritarianism (independent thinking)
  // More open to innovation, skeptical of traditional institutions
  // Higher rational political engagement
  unaffiliated: {
    economicInsecurity: 0.02,       // mild rational self-interest
    institutionalTrust: -0.04,      // skeptical of traditional institutions
    automationShock: -0.05,         // more open to innovation / tech progress
    authoritarianTendency: -0.08,   // libertarian lean, personal freedom
    conformity: -0.08,              // independent thinking, less group pressure
    politicalAttention: 0.06,       // higher rational engagement
  },
}

// --- Default world-average configuration ---
// Based on Pew Research global religious composition (renormalized to 5 groups)
export const DEFAULT_RELIGION_CONFIG: ReligionConfig = {
  enabled: true,
  shares: {
    christian: 0.295,
    muslim: 0.262,
    unaffiliated: 0.248,
    hindu: 0.153,
    buddhist: 0.042,
  },
  // --- Group-specific mean priors ---
  // These define the CENTER of overlapping distributions (not fixed values)
  // Actual per-citizen values are sampled with variance around these means
  meanReligiosity: {
    christian: 0.55,       // broad variance, world average
    muslim: 0.65,          // slightly higher average religiosity
    unaffiliated: 0.10,    // very low by definition
    hindu: 0.50,           // medium
    buddhist: 0.45,        // medium, more philosophical
  },
  meanPracticeLevel: {
    christian: 0.45,       // variable (weekly church to cultural-only)
    muslim: 0.55,          // higher average public practice
    unaffiliated: 0.05,    // near-zero
    hindu: 0.40,           // medium, family-oriented practice
    buddhist: 0.30,        // lower average public practice
  },
  meanCommunityEmbeddedness: {
    christian: 0.45,
    muslim: 0.60,          // stronger community networks on average
    unaffiliated: 0.20,    // some secular community, mostly low
    hindu: 0.50,           // medium-strong community structure
    buddhist: 0.35,        // moderate
  },
  meanTransmissionStrength: {
    christian: 0.55,
    muslim: 0.70,          // higher average intergenerational transmission
    unaffiliated: 0.15,    // low — children often choose freely
    hindu: 0.65,           // strong family-based transmission
    buddhist: 0.40,        // moderate
  },
  // --- Dynamic parameters ---
  disaffiliationBaseRate: 0.008, // ~0.8% per year base rate
  conversionBaseRate: 0.001,     // ~0.1% per year (very rare)
  discriminationIntensity: 0.5,  // moderate default
}
