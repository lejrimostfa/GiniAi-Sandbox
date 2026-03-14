// --- Pedagogical Scenarios ---
// Pre-configured parameter sets for teaching socio-economic dynamics

import type { SimParams } from '../types/simulation'

export interface Scenario {
  id: string
  name: string
  description: string
  params: SimParams
}

/** Predefined pedagogical scenarios */
export const SCENARIOS: Scenario[] = [
  {
    id: 'equilibrium',
    name: 'Initial Equilibrium',
    description: 'Equal distribution, no automation. A balanced starting point to observe the baseline dynamics of the system.',
    params: {
      automationIntensity: 0.05,
      ownershipConcentration: 0.05,
      redistributionLevel: 0.1,
      seed: 42,
      gridWidth: 30,
      gridHeight: 30,
    },
  },
  {
    id: 'automation-shock',
    name: 'Automation Shock',
    description: 'Sudden high automation displaces workers. Observe how quickly precarious clusters form and whether mobility collapses.',
    params: {
      automationIntensity: 0.7,
      ownershipConcentration: 0.2,
      redistributionLevel: 0.1,
      seed: 42,
      gridWidth: 30,
      gridHeight: 30,
    },
  },
  {
    id: 'extreme-concentration',
    name: 'Extreme Concentration',
    description: 'High ownership concentration with low redistribution. Watch capital infrastructure dominate and resource inequality spike.',
    params: {
      automationIntensity: 0.4,
      ownershipConcentration: 0.6,
      redistributionLevel: 0.05,
      seed: 42,
      gridWidth: 30,
      gridHeight: 30,
    },
  },
  {
    id: 'welfare-state',
    name: 'Welfare State',
    description: 'Strong redistribution counteracts automation. Does support stabilize without reintegrating? Look for persistent dependency.',
    params: {
      automationIntensity: 0.5,
      ownershipConcentration: 0.3,
      redistributionLevel: 0.7,
      seed: 42,
      gridWidth: 30,
      gridHeight: 30,
    },
  },
  {
    id: 'mobility-collapse',
    name: 'Mobility Collapse',
    description: 'Self-reinforcing precarious clusters trap agents. Observe spatial clustering and near-zero upward mobility.',
    params: {
      automationIntensity: 0.6,
      ownershipConcentration: 0.5,
      redistributionLevel: 0.1,
      seed: 77,
      gridWidth: 30,
      gridHeight: 30,
    },
  },
  {
    id: 'regime-transition',
    name: 'Regime Transition',
    description: 'Moderate parameters that shift over time. Watch the system move between different socio-economic regimes.',
    params: {
      automationIntensity: 0.35,
      ownershipConcentration: 0.25,
      redistributionLevel: 0.3,
      seed: 123,
      gridWidth: 30,
      gridHeight: 30,
    },
  },
]
