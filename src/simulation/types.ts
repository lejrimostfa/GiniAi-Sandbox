// --- V2 Core Types ---
// Primer-style agent-based economic simulation types
// All simulation logic operates on these types (decoupled from rendering)

// ============================================================
// Vector2 — simple 2D position/velocity
// ============================================================
export interface Vec2 {
  x: number
  y: number
}

// ============================================================
// Education & Skills
// ============================================================
export type Education = 'low' | 'medium' | 'high'

export const EDUCATION_LEVELS: Education[] = ['low', 'medium', 'high']

export const EDUCATION_SKILL_MAP: Record<Education, number> = {
  low: 0.2,
  medium: 0.5,
  high: 0.9,
}

// ============================================================
// Gender
// ============================================================
export type Gender = 'male' | 'female'

// ============================================================
// Heatmap visual modes — color agents by property (blue→red)
// ============================================================
export type HeatmapMode = 'none' | 'wealth' | 'poverty' | 'illness' | 'unemployment' | 'satisfaction' | 'age' | 'education' | 'crime' | 'death' | 'birth' | 'familySize' | 'housing' | 'businesses' | 'automation'

// ============================================================
// Agent State
// ============================================================
export type AgentState = 'employed' | 'unemployed' | 'business_owner' | 'retired' | 'criminal' | 'dead' | 'child' | 'police' | 'prisoner'

// ============================================================
// Agent current action (for emoji display)
// ============================================================
export type AgentAction = 'idle' | 'working' | 'shopping' | 'job_seeking' | 'studying' | 'commuting' | 'resting' | 'stealing' | 'dying' | 'hauling' | 'patrolling' | 'arrested' | 'striking' | 'imprisoned'

// ============================================================
// Agent
// ============================================================
export interface Agent {
  id: string
  // --- Position & movement ---
  position: Vec2
  velocity: Vec2
  target: Vec2 | null
  targetLocationId: string | null // where heading (location id)
  // --- Identity ---
  age: number             // simulation years (18–80)
  gender: Gender
  education: Education
  // --- Economic state ---
  state: AgentState
  wealth: number          // accumulated savings
  income: number          // nominal per-tick income (set at hire, used for tax/credit calculations)
  tickEarnings: number    // actual earnings received THIS tick (reset each tick, used for taxation)
  // --- Housing ---
  homeId: string          // assigned home location
  homeOwned: boolean      // true = owns the home (no more rent/mortgage)
  homeDebt: number        // remaining mortgage balance (0 if owned or renting)
  homeDebtPayment: number // per-tick mortgage repayment amount
  homeValue: number       // purchase price of the home (for mortgage calculation)
  // --- Family ---
  partnerId: string | null   // spouse agent ID (null = single)
  children: number           // number of children at home
  // --- Employment ---
  workplaceId: string | null
  // --- Satisfaction & needs ---
  satisfaction: number    // 0–1
  needsConsumption: boolean  // wants to go to market
  // --- Activity tracking ---
  ticksUnemployed: number
  ticksSinceConsumption: number
  currentAction: AgentAction  // what the agent is currently doing (for emoji)
  stayTicksRemaining: number  // ticks left to stay at current location (0 = free to leave)
  // --- Causal societal state ---
  isSick: boolean             // currently ill (caused by sustained poverty)
  ticksSick: number           // how long sick
  ticksLowSatisfaction: number // consecutive ticks with satisfaction < threshold
  ticksAsCriminal: number     // how long in criminal state
  crimeAttemptCooldown: number // ticks remaining before next crime attempt
  ticksInPrison: number        // ticks served in current sentence
  prisonSentence: number       // total sentence length (0 if not in prison)
  deathTick: number | null    // tick when agent died (for ☠️ display duration)
  // --- Resource transport ---
  carryingResource: boolean  // currently hauling a resource to factory
  lastPaidTick: number       // last tick when agent received wage (cooldown)
  // --- Banking ---
  loan: number               // outstanding loan amount
  loanPayment: number        // per-tick repayment
  creditScore: number        // 0–1 (computed from employment, wealth, history)
  // --- Business ownership ---
  ownedBusinessId: string | null  // location id of business this agent owns (null if not owner)
  businessDebt: number            // outstanding business loan (separate from personal loan)
  businessDebtPayment: number     // per-tick business loan repayment
  businessRevenue: number         // accumulated revenue since last collection (employees generate this)
  businessTicksUnprofitable: number // consecutive ticks where revenue < debt payment
  // --- Education tracking ---
  ticksStudying: number          // ticks spent studying at university (for duration-based upskill)
  // --- Visual / history ---
  trail: Vec2[]           // recent positions (for trail rendering)
  lifeEvents: LifeEvent[] // log of major events
  wealthHistory: number[] // wealth at each tick (for sparkline, capped at MAX_WEALTH_HISTORY)
  // --- Full archives (uncapped, for export only) ---
  wealthArchive: number[]          // wealth at every tick since agent's creation (never trimmed)
  stateHistory: StateTransition[]  // log of every state change (for timeline reconstruction)
}

// ============================================================
// State Transition (for agent timeline reconstruction)
// ============================================================
export interface StateTransition {
  tick: number
  from: AgentState
  to: AgentState
}

// ============================================================
// Life Event (for agent inspector)
// ============================================================
export interface LifeEvent {
  tick: number
  type: 'hired' | 'fired' | 'automated' | 'economic_layoff' | 'automation_savings' | 'started_business' | 'retired' | 'upskilled' | 'born' | 'bankrupt' | 'divorced' | 'married' | 'had_child' | 'premature_death' | 'disease' | 'crime_victim' | 'crime_perpetrator' | 'became_criminal' | 'rehabilitated' | 'died' | 'loan_taken' | 'loan_default' | 'had_baby' | 'evicted' | 'resource_delivered' | 'wage_earned' | 'business_loan_taken' | 'business_bankrupt' | 'severance' | 'inheritance' | 'home_bought' | 'mortgage_paid' | 'home_built' | 'depression' | 'suicide' | 'divorce_suicide' | 'joined_police' | 'arrested_criminal' | 'went_on_strike' | 'sent_to_prison' | 'released_from_prison' | 'crime_failed' | 'recovered' | 'birth_hospital' | 'birth_no_hospital'
  description: string
}

// ============================================================
// Workplace Types
// ============================================================
export type WorkplaceType = 'manual' | 'skilled' | 'creative' | 'service'

export const WORKPLACE_TYPES: WorkplaceType[] = ['manual', 'skilled', 'creative', 'service']

export interface WorkplaceConfig {
  type: WorkplaceType
  label: string
  baseWage: number
  automationRisk: number   // 0–1, traditional robotic/physical automation risk
  aiExposure: number       // 0–1, AI/LLM displacement risk (from Anthropic Economic Index)
  requiredEducation: Education
  color: number            // hex color for rendering
}

// --- AI Exposure values derived from Anthropic Economic Index (March 2026) ---
// Source: "Labor market impacts of AI: A new measure and early evidence"
// Key finding: AI displaces cognitive/white-collar work, NOT physical labor
// automationRisk = traditional robotic/physical automation (factories, warehouses)
// aiExposure = AI/LLM task coverage (programming, data entry, customer service, office admin)
//
// Anthropic observed exposure by category:
//   Computer & Math: 94% theoretical, 33% observed → maps to 'skilled'
//   Office & Admin:  90% theoretical, 25% observed → maps to 'skilled'
//   Arts & Design:   60% theoretical, 15% observed → maps to 'creative'
//   Customer Service: ~65% observed                → maps to 'service'
//   Production/Mfg:  15% theoretical, 3% observed  → maps to 'manual'
//   Physical/Trade:   ~0% observed                 → maps to 'manual'
//
// Workers most exposed: older, female, higher-educated, higher-paid
// Young workers (22-25): 14% drop in hiring rate in exposed occupations
// 30% of workers have zero AI exposure (physical jobs)
export const WORKPLACE_CONFIGS: Record<WorkplaceType, WorkplaceConfig> = {
  manual: {
    type: 'manual',
    label: 'Factory',
    baseWage: 30,
    automationRisk: 0.8,   // high robotic automation risk
    aiExposure: 0.05,      // very low AI exposure (physical work)
    requiredEducation: 'low',
    color: 0x8899AA,
  },
  skilled: {
    type: 'skilled',
    label: 'Office',
    baseWage: 55,
    automationRisk: 0.1,   // low robotic risk
    aiExposure: 0.65,      // HIGH AI exposure (programming, data entry, finance, admin)
    requiredEducation: 'medium',
    color: 0x5B8FB9,
  },
  creative: {
    type: 'creative',
    label: 'Studio',
    baseWage: 70,
    automationRisk: 0.05,  // very low robotic risk
    aiExposure: 0.35,      // moderate AI exposure (design, writing, media)
    requiredEducation: 'high',
    color: 0x9B72AA,
  },
  service: {
    type: 'service',
    label: 'Shop',
    baseWage: 35,
    automationRisk: 0.3,   // moderate robotic risk (checkout, delivery)
    aiExposure: 0.45,      // moderate-high AI exposure (customer service, sales)
    requiredEducation: 'low',
    color: 0x81B29A,
  },
}

// ============================================================
// Location (Point of Interest on the world plane)
// ============================================================
export type LocationType = 'home' | 'workplace' | 'market' | 'school' | 'government' | 'resource' | 'factory' | 'bank' | 'police_station' | 'prison' | 'hospital' | 'amusement_park'

export interface Location {
  id: string
  type: LocationType
  position: Vec2
  radius: number          // visual size
  // Workplace-specific
  workplaceType?: WorkplaceType
  jobSlots: number        // total slots
  filledSlots: number     // currently filled
  automatedSlots: number  // permanently removed by robotic automation
  aiDisplacedSlots: number // permanently removed by AI/LLM displacement
  wage: number            // current wage offered
  // Market-specific
  goodsPrice?: number
  // School-specific
  educationCost?: number
  // Home-specific
  housingType?: 'house' | 'apartment' // type of housing
  housingValue?: number        // purchase price of the home (for mortgage)
  rent?: number                // annual rent cost for residents
  maxResidents?: number        // max families per building (apartment=5, house=1)
  residentsCount?: number      // current number of families/solo agents living here
  // Bank-specific
  interestRate?: number      // annual interest rate on loans
  maxLoanMultiplier?: number // max loan = income × this
  // Ownership
  ownerId?: string           // agent id of owner (business_owner who created this location)
  // Factory-specific
  resourceStock?: number     // raw resources waiting to be processed
}

// ============================================================
// Economy Type Presets
// ============================================================
export type EconomyType = 'agrarian' | 'industrial' | 'service' | 'tech'

export interface EconomyPreset {
  label: string
  description: string
  workplaceMix: Record<WorkplaceType, number> // percentage of each type
}

export const ECONOMY_PRESETS: Record<EconomyType, EconomyPreset> = {
  agrarian: {
    label: 'Agrarian',
    description: 'Low-tech economy dominated by manual labor',
    workplaceMix: { manual: 0.70, skilled: 0.15, creative: 0.05, service: 0.10 },
  },
  industrial: {
    label: 'Industrial',
    description: 'Factory-driven economy with growing skilled sector',
    workplaceMix: { manual: 0.40, skilled: 0.35, creative: 0.10, service: 0.15 },
  },
  service: {
    label: 'Service',
    description: 'Consumption-oriented economy, many shops and offices',
    workplaceMix: { manual: 0.15, skilled: 0.25, creative: 0.15, service: 0.45 },
  },
  tech: {
    label: 'Tech',
    description: 'Innovation-driven, high education, fewer manual jobs',
    workplaceMix: { manual: 0.10, skilled: 0.30, creative: 0.35, service: 0.25 },
  },
}

// ============================================================
// Behavior Configuration — all tunable agent behavior constants
// Exposed in Advanced Parameters UI, merged with defaults at runtime
// ============================================================
export interface BehaviorConfig {
  // --- Crime ---
  crimeUnemploymentTicks: number     // ticks unemployed before crime risk
  crimeWealthThreshold: number       // poverty line for crime trigger
  crimeSatisfactionThreshold: number // satisfaction below which crime possible
  crimeSuccessBaseProb: number       // base robbery success probability
  crimeAttemptCooldown: number       // ticks between crime attempts
  // --- Prison ---
  prisonSentenceMin: number          // minimum sentence (ticks)
  prisonSentenceMax: number          // maximum sentence (ticks)
  prisonCostPerPrisoner: number      // $/tick maintenance per prisoner
  // --- Police ---
  policeBaseRatio: number            // 1 police per N agents
  arrestSuccessRate: number          // probability of successful arrest
  policeDeterrentRadius: number      // spatial check radius for deterrence
  policeDeterrentFactor: number      // each nearby police multiplies success by this
  // --- Hospital ---
  hospitalBirthCost: number          // gov pays per birth
  hospitalTreatmentCost: number      // gov pays per sick visit
  hospitalMaintenanceCost: number    // base per-tick upkeep
  hospitalRecoveryProb: number       // recovery chance per visit
  hospitalBirthMortalityNoHospital: number // extra infant mortality without hospital
  // --- Amusement Park ---
  amusementParkEntryCost: number     // agent pays per visit
  amusementParkSatBoost: number      // satisfaction boost per visit
  amusementParkVisitProb: number     // probability agent decides to visit
  // --- Family & Fertility ---
  normalSatThreshold: number         // satisfaction threshold for conception
  poorSatThreshold: number           // lower threshold for poor couples
  normalMaxChildren: number          // max children for normal families
  poorMaxChildren: number            // max children for poor families
  povertyFertilityBoostMax: number   // max conception failure reduction for poor
  // --- Housing ---
  apartmentRentRatio: number         // annual rent as fraction of value (apartments)
  houseRentRatio: number             // annual rent as fraction of value (houses)
  // --- Strikes ---
  strikeDissatisfactionThreshold: number
  strikeBaseProbability: number
  // --- Economy ---
  capitalReturnRate: number          // annual return on wealth (Piketty r > g)
  capitalReturnThreshold: number     // min wealth for capital returns
  passiveLivingCost: number          // $/tick base cost of living
  entrepreneurProb: number           // per-tick probability of starting a business
  marketRevenueShare: number         // fraction of market spending routed to business owners (0–1)
  // --- Disease ---
  diseasePovertyTicks: number        // ticks in poverty before sickness
  diseaseWealthThreshold: number     // wealth below which disease risk rises
  deathSickTicks: number             // ticks sick before death risk rises
}

export const DEFAULT_BEHAVIOR_CONFIG: BehaviorConfig = {
  // Crime
  crimeUnemploymentTicks: 26,
  crimeWealthThreshold: 30,
  crimeSatisfactionThreshold: 0.25,
  crimeSuccessBaseProb: 0.35,
  crimeAttemptCooldown: 4,
  // Prison
  prisonSentenceMin: 13,
  prisonSentenceMax: 52,
  prisonCostPerPrisoner: 8,
  // Police
  policeBaseRatio: 50,
  arrestSuccessRate: 0.6,
  policeDeterrentRadius: 12,
  policeDeterrentFactor: 0.4,
  // Hospital
  hospitalBirthCost: 25,
  hospitalTreatmentCost: 15,
  hospitalMaintenanceCost: 5,
  hospitalRecoveryProb: 0.25,
  hospitalBirthMortalityNoHospital: 0.08,
  // Amusement Park
  amusementParkEntryCost: 8,
  amusementParkSatBoost: 0.12,
  amusementParkVisitProb: 0.10,
  // Family
  normalSatThreshold: 0.55,
  poorSatThreshold: 0.20,
  normalMaxChildren: 4,
  poorMaxChildren: 6,
  povertyFertilityBoostMax: 0.4,
  // Housing
  apartmentRentRatio: 0.035,
  houseRentRatio: 0.05,
  // Strikes
  strikeDissatisfactionThreshold: 0.35,
  strikeBaseProbability: 0.15,
  // Economy
  capitalReturnRate: 0.03,
  capitalReturnThreshold: 200,
  passiveLivingCost: 3,
  entrepreneurProb: 0.06,
  marketRevenueShare: 0.60,
  // Disease
  diseasePovertyTicks: 6,
  diseaseWealthThreshold: 40,
  deathSickTicks: 10,
}

// ============================================================
// Simulation Parameters (user-controlled)
// ============================================================
export interface SimulationParams {
  // Population
  populationSize: number        // 50–500
  averageLifespan: number       // average lifespan in sim years (default 75)
  // Wealth distribution
  startingGini: number          // 0.15–0.65
  totalWealth: number           // total money in system
  // Education
  educationMix: Record<Education, number> // percentages (sum = 1)
  // Automation (dual-channel: robotic + AI)
  aiGrowthRate: number          // 0–0.15 (per year) — traditional robotic automation speed
  aiDiffusionRate: number       // 0–0.20 (per year) — AI/LLM adoption speed
                                // Models the gap between theoretical AI capability and actual deployment
                                // Source: Anthropic Economic Index shows actual coverage is ~35% of theoretical
  // Redistribution
  redistributionLevel: number   // 0–1 (tax & transfer intensity)
  enableUBI: boolean             // whether surplus tax is distributed as UBI
  // Economy
  economyType: EconomyType
  // Simulation
  ticksPerYear: number          // how many ticks = 1 sim year (default 52, 1 tick = 1 week)
  // Immigration
  immigrationEnabled: boolean    // master toggle — immigration only active when user enables it
  immigrationRate: number        // 0–1 (intensity when enabled: 0 = trickle, 1 = full)
  // Toggles
  diseasesEnabled: boolean       // whether disease onset & contagion are active
  // Advanced behavior config (overrides defaults from BehaviorConfig)
  behaviorConfig: Partial<BehaviorConfig>
}

export const DEFAULT_PARAMS: SimulationParams = {
  populationSize: 200,
  averageLifespan: 75,
  startingGini: 0.35,
  totalWealth: 100000,
  educationMix: { low: 0.30, medium: 0.50, high: 0.20 },
  aiGrowthRate: 0.15,
  aiDiffusionRate: 0.20,        // AI displaces jobs faster than robotic automation
  redistributionLevel: 0.30,
  economyType: 'industrial',
  ticksPerYear: 52,
  enableUBI: false,
  immigrationEnabled: false,       // off by default — user must enable in UI
  immigrationRate: 1.0,           // intensity when enabled
  diseasesEnabled: false,
  behaviorConfig: {},
}

// ============================================================
// Simulation Snapshot Metrics (computed per tick)
// ============================================================
export interface SimMetrics {
  tick: number
  year: number
  // Population
  totalPopulation: number
  employedCount: number
  unemployedCount: number
  businessOwnerCount: number
  retiredCount: number
  childCount: number
  criminalCount: number
  prisonerCount: number
  policeCount: number
  // Inequality
  giniCoefficient: number
  medianWealth: number
  meanWealth: number
  top10WealthShare: number
  bottom50WealthShare: number
  // Income
  medianIncome: number
  // Automation (dual-channel)
  totalJobs: number              // available job slots (capacity)
  filledJobs: number             // actually occupied job slots
  automatedJobs: number          // jobs lost to robotic automation
  aiDisplacedJobs: number        // jobs lost to AI/LLM displacement
  automationRate: number         // robotic: automatedJobs / (totalJobs + automatedJobs + aiDisplacedJobs)
  aiDisplacementRate: number     // AI: aiDisplacedJobs / (totalJobs + automatedJobs + aiDisplacedJobs)
  totalDisplacementRate: number  // combined displacement rate
  // Workers actually fired (subset of automatedJobs/aiDisplacedJobs — excludes empty slot elimination)
  roboticFiredWorkers: number
  aiFiredWorkers: number
  // Mobility
  classTransitions: number // agents who changed class this tick
  // Satisfaction
  meanSatisfaction: number
  // Economy
  gdp: number                   // total earnings this tick (sum of all tickEarnings)
  gdpPerCapita: number          // gdp / working-age population
  // Government
  taxRevenue: number
  redistributionPaid: number
  governmentTreasury: number    // cumulative government balance
  govExpPensions: number        // this tick: pension spending
  govExpInfra: number           // this tick: infrastructure spending
  govExpBenefits: number        // this tick: unemployment benefits
  govExpPolice: number          // this tick: police salary spending
  govExpPrison: number          // this tick: prison maintenance cost
  govExpHospital: number        // this tick: hospital costs (births + treatments)
  govExpUBI: number             // this tick: UBI spending
  // Social unrest
  strikeRate: number            // fraction of workers on strike this tick
  arrestsThisTick: number       // criminals arrested by police this tick
  // --- Societal phenomena (per-tick counts) ---
  births: number
  deaths: number
  divorces: number
  marriages: number
  prematureDeaths: number
  diseases: number
  crimes: number
  layoffs: number               // economic + automation layoffs this tick
  fertilityRate: number         // births per 1000 pop per year
  crimeRate: number             // crimes per 1000 pop per year
  diseaseRate: number           // diseases per 1000 pop per year
  effectiveTaxRate: number      // actual avg tax rate
  avgEducationLevel: number     // 0-1 (low=0.2, med=0.5, high=0.9)
  // Housing
  homeOwnerCount: number        // agents who own their home (no mortgage remaining)
  mortgageCount: number         // agents with active mortgage
  renterCount: number           // agents renting
  // --- Wealth distribution snapshot (sorted array for bar chart) ---
  wealthDistribution: number[]  // all agent wealths, sorted ascending
}

// ============================================================
// World State (complete simulation state at a point in time)
// ============================================================
// ============================================================
// Money event (for floating +N / -N indicators in scene)
// ============================================================
export interface MoneyEvent {
  agentId: string
  position: Vec2
  amount: number   // positive = gain, negative = loss
  tick: number
}

export interface WorldState {
  tick: number
  agents: Agent[]
  locations: Location[]
  metrics: SimMetrics
  params: SimulationParams
  moneyEvents: MoneyEvent[]  // recent money gain/loss events for visual display
}

// ============================================================
// Utility: Vec2 helpers
// ============================================================
export function vec2(x: number, y: number): Vec2 {
  return { x, y }
}

export function vec2Add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function vec2Sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function vec2Scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s }
}

export function vec2Length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y)
}

export function vec2Normalize(v: Vec2): Vec2 {
  const len = vec2Length(v)
  if (len === 0) return { x: 0, y: 0 }
  return { x: v.x / len, y: v.y / len }
}

export function vec2Distance(a: Vec2, b: Vec2): number {
  return vec2Length(vec2Sub(a, b))
}

