// ============================================================
// Predefined Referendum Configurations
// Each topic has a weight vector over civic profile traits
// Positive weight = trait pushes toward YES, negative = toward NO
// ============================================================

import type { ReferendumConfig } from './types'

export const REFERENDUM_CONFIGS: Record<string, ReferendumConfig> = {
  immigration: {
    topic: 'immigration',
    question: 'Should the city open its borders to more immigrants?',
    weights: {
      economicInsecurity: -0.3,      // insecure → oppose (fear of competition)
      institutionalTrust: 0.2,       // trust institutions → support
      automationShock: -0.2,         // automation-hit → oppose
      authoritarianTendency: -0.4,   // authoritarian → oppose
      conformity: -0.1,             // conformist → mild opposition (status quo)
      politicalAttention: 0.1,      // attentive → slight support (nuanced view)
    },
  },
  redistribution: {
    topic: 'redistribution',
    question: 'Should the government increase wealth redistribution?',
    weights: {
      economicInsecurity: 0.5,       // insecure → strong support
      institutionalTrust: 0.1,       // trust → mild support
      automationShock: 0.3,          // automation-hit → support safety net
      authoritarianTendency: -0.1,   // authoritarian → mild opposition
      conformity: 0.1,              // conformist → mild support (follow majority)
      politicalAttention: 0.1,      // attentive → slight support
    },
  },
  automation_control: {
    topic: 'automation_control',
    question: 'Should the government regulate and slow down automation?',
    weights: {
      economicInsecurity: 0.4,       // insecure → support regulation
      institutionalTrust: -0.1,      // trust → mild opposition (trust market)
      automationShock: 0.6,          // automation-hit → strong support
      authoritarianTendency: 0.1,    // authoritarian → mild support (control)
      conformity: 0.0,              // neutral
      politicalAttention: 0.1,      // attentive → slight support
    },
  },
}

// --- Default influence round count ---
export const DEFAULT_MAX_ROUNDS = 3

// --- Score thresholds ---
export const UNDECIDED_THRESHOLD = 0.15  // |score| < this → UNDECIDED

// --- Influence ring weights ---
export const INFLUENCE_RING_WEIGHTS = {
  household: 0.4,    // Ring 1: family/household (same homeId)
  neighbors: 0.25,   // Ring 2: spatial neighbors
  coworkers: 0.15,   // Ring 3: same workplaceId
}

// --- Spatial neighbor radius (reuse existing interaction radius) ---
export const NEIGHBOR_INFLUENCE_RADIUS = 8.0
