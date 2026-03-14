// --- Simulation Engine ---
// Tick-based ABM engine: agents make decisions, move, interact with locations
// Pure logic — no rendering, no Vue dependencies
// Emits events via callback for UI/scene to consume

import type {
  Agent, Location, SimulationParams, SimMetrics, WorldState,
  Education, WorkplaceType, MoneyEvent,
} from './types'
import {
  vec2, vec2Sub, vec2Add, vec2Scale, vec2Normalize, vec2Distance, vec2Length,
  WORKPLACE_CONFIGS, EDUCATION_SKILL_MAP,
} from './types'
import {
  createRNG, computeGiniFast, clamp, median, uid, type RNG,
} from './utils'
import { generateWorld } from './WorldGenerator'

// ============================================================
// Engine configuration constants
// ============================================================
const AGENT_SPEED = 15.0           // base movement speed per tick
const ARRIVAL_DISTANCE = 3.0      // close enough to target (snap faster)
const SEPARATION_RADIUS = 1.2     // avoid overlap distance
const SEPARATION_FORCE = 0.3      // strength of avoidance
const WANDER_FORCE = 0.1          // random drift when idle
const TRAIL_LENGTH = 20           // positions to remember
const MAX_WEALTH_HISTORY = 200    // sparkline length
// RETIREMENT_AGE is now derived from params.averageLifespan (see getRetirementAge())
const BASE_CONSUMPTION_INTERVAL = 5 // ticks between market visits (base for tpy=12)
const HIRING_SEARCH_RADIUS = 80   // how far agents look for jobs
const BANKRUPTCY_THRESHOLD = -200  // debt threshold for bankruptcy event

// --- Proximity-based interaction system ---
// All social events require spatial encounter between agents
const INTERACTION_RADIUS = 4.0    // agents within this radius can interact socially
const CRIME_PROXIMITY_RADIUS = 5.0 // criminal must be this close to steal

// --- Annual calendar (quarter indices within ticksPerYear) ---
// These mandatory events create structured movement where agents converge,
// enabling realistic proximity-based interactions instead of random encounters
// Quarter fractions of the year (works with any ticksPerYear value)
const ANNUAL_Q1 = 0.0   // Q1: Tax Day → everyone visits Government
const ANNUAL_Q2 = 0.25  // Q2: Job Fair → unemployed converge on workplaces
const ANNUAL_Q3 = 0.50  // Q3: Market Festival → everyone visits Market
const ANNUAL_Q4 = 0.75  // Q4: Health/Education → sick seek care, others school

// ============================================================
// Simulation Engine Class
// ============================================================
export class SimulationEngine {
  agents: Agent[] = []
  locations: Location[] = []
  params: SimulationParams
  tick = 0
  metrics: SimMetrics = this.emptyMetrics()
  moneyEvents: MoneyEvent[] = []  // recent money gain/loss events for floating indicators

  // --- Societal counters (reset each tick, accumulated for metrics) ---
  private tickBirths = 0
  private tickDeaths = 0
  private tickDivorces = 0
  private tickMarriages = 0
  private tickPrematureDeaths = 0
  private tickDiseases = 0
  private tickCrimes = 0
  private tickLayoffs = 0
  private tickTaxRevenue = 0
  private tickRedistribution = 0

  // --- Cumulative automation counters (survive workplace removal) ---
  // Total slots eliminated (empty + filled)
  private cumulativeAutomatedJobs = 0
  private cumulativeAiDisplacedJobs = 0
  // Workers actually fired by automation
  private cumulativeRoboticFired = 0
  private cumulativeAiFired = 0
  
  private rng: RNG
  private seed: number
  private onEvent?: (type: string, data: unknown) => void

  constructor(params: SimulationParams, seed: number = 42) {
    this.params = { ...params }
    this.seed = seed
    this.rng = createRNG(seed + 9999)
  }

  // --- Initialize the world ---
  init(): void {
    const { agents, locations } = generateWorld(this.params, this.seed)
    this.agents = agents
    this.locations = locations
    this.tick = 0
    this.cumulativeAutomatedJobs = 0
    this.cumulativeAiDisplacedJobs = 0
    this.cumulativeRoboticFired = 0
    this.cumulativeAiFired = 0

    // Initial job assignment
    this.assignInitialJobs()
    
    // Compute initial metrics
    this.metrics = this.computeMetrics()
  }

  // --- Set event callback ---
  setEventCallback(cb: (type: string, data: unknown) => void): void {
    this.onEvent = cb
  }

  // --- Emit event ---
  private emit(type: string, data: unknown): void {
    this.onEvent?.(type, data)
  }

  // --- Current week within the simulated year (0-indexed) ---
  private currentWeekOfYear(): number {
    return this.tick % this.params.ticksPerYear
  }

  // --- Check if the current tick is on a specific annual quarter (fraction 0-1) ---
  private isAnnualQuarter(fraction: number): boolean {
    const tpy = this.params.ticksPerYear
    const targetTick = Math.round(fraction * tpy)
    return this.currentWeekOfYear() === targetTick
  }

  // --- Consumption interval scaled by ticksPerYear ---
  private get consumptionInterval(): number {
    return Math.round(BASE_CONSUMPTION_INTERVAL * (this.params.ticksPerYear / 12))
  }

  // --- Derived retirement age from average lifespan ---
  private getRetirementAge(): number {
    return Math.round(this.params.averageLifespan * 0.85) // retire at ~85% of lifespan
  }

  // --- Derived max age from average lifespan ---
  private getMaxAge(): number {
    return Math.round(this.params.averageLifespan * 1.1) // die at ~110% of lifespan
  }

  // --- Main simulation tick ---
  step(): WorldState {
    this.tick++
    this.moneyEvents = []
    this.tickBirths = 0
    this.tickDeaths = 0
    this.tickDivorces = 0
    this.tickMarriages = 0
    this.tickPrematureDeaths = 0
    this.tickDiseases = 0
    this.tickCrimes = 0
    this.tickLayoffs = 0
    this.tickTaxRevenue = 0
    this.tickRedistribution = 0

    // Reset per-tick earnings and increment unemployment counters
    for (const agent of this.agents) {
      agent.tickEarnings = 0
      if (agent.state === 'unemployed') agent.ticksUnemployed++
    }

    // 0. Remove dead agents that have persisted long enough (☠️ cleanup)
    this.cleanupDeadAgents()

    // 1. Age agents + population renewal
    this.ageAgents()
    this.renewPopulation()

    // 2. Automation runs every tick (probabilities are per-tick scaled)
    this.runAutomation()

    // Annual processes (once per year)
    if (this.tick % this.params.ticksPerYear === 0) {
      this.processHousing()
    }

    // 2b. Economic layoffs (runs every tick — owners fire workers to cut costs)
    this.processLayoffs()

    // 2c. Job market self-regulation (shrink excess capacity when vacancy > 10%)
    this.processJobMarket()

    // 2d. Family (runs every tick with per-tick probability for smooth birth curve)
    this.processFamily()

    // 3. Causal societal phenomena (crime, disease, death, marriage, divorce)
    this.processCausalPhenomena()

    // 4. Agent decisions
    for (const agent of this.agents) {
      if (agent.state === 'dead') continue
      this.agentDecide(agent)
    }

    // 5. Movement
    this.moveAgents()

    // 6. Interactions (at locations)
    for (const agent of this.agents) {
      if (agent.state === 'dead') continue
      this.agentInteract(agent)
    }

    // 7. Proximity-based social interactions (crime, contagion, marriage, word-of-mouth, rehab)
    // Runs AFTER movement so interactions are based on actual spatial positions
    this.processProximityInteractions()

    // 8. Economy: wages, expenses, satisfaction
    this.processEconomy()

    // 8b. Loan repayment + credit score
    this.processLoans()

    // 9. Government: tax & redistribute
    this.processGovernment()

    // 10. Update wealth history & trails
    this.updateHistory()

    // 11. Compute metrics
    this.metrics = this.computeMetrics()

    return this.getWorldState()
  }

  // ============================================================
  // Labor market vacancy rate — core self-regulating signal
  // Beveridge Curve: natural vacancy rate ≈ 3-5% (JOLTS data)
  // vacancyRate > 10% → oversupply, block new creation + attrition
  // vacancyRate < 5%  → tight market, encourage creation
  // ============================================================
  private getVacancyRate(): number {
    const workplaces = this.locations.filter((l) => l.type === 'workplace')
    const totalSlots = workplaces.reduce((s, w) => s + w.jobSlots, 0)
    const filledSlots = workplaces.reduce((s, w) => s + w.filledSlots, 0)
    return totalSlots > 0 ? (totalSlots - filledSlots) / totalSlots : 0
  }

  // ============================================================
  // Job market self-regulation — shrink excess capacity
  // When vacancy rate > 10%, workplaces with empty slots downsize
  // Simulates: businesses that can't fill positions reduce capacity
  // Workplaces at 0 slots with no owner are removed (market exit)
  // ============================================================
  private processJobMarket(): void {
    const vacancyRate = this.getVacancyRate()
    // Only apply attrition when there's meaningful oversupply
    if (vacancyRate <= 0.10) return

    // Attrition probability scales with how far above 10% we are
    // At 20% vacancy → ~5% chance per workplace per tick
    // At 30% vacancy → ~10% chance
    const excessRate = vacancyRate - 0.10
    const attritionProb = Math.min(0.15, excessRate * 0.5)

    for (const wp of this.locations) {
      if (wp.type !== 'workplace') continue
      const emptySlots = wp.jobSlots - wp.filledSlots
      if (emptySlots <= 0) continue // fully staffed, no attrition

      // Probability proportional to how empty the workplace is
      const emptyRatio = emptySlots / Math.max(1, wp.jobSlots)
      if (this.rng() < attritionProb * emptyRatio) {
        wp.jobSlots = Math.max(wp.filledSlots, wp.jobSlots - 1) // never drop below filled
      }
    }

    // Remove workplaces with 0 slots and no owner (market exit)
    for (let i = this.locations.length - 1; i >= 0; i--) {
      const wp = this.locations[i]
      if (wp.type === 'workplace' && wp.jobSlots === 0 && wp.filledSlots === 0 && !wp.ownerId) {
        this.locations.splice(i, 1)
        this.emit('location:removed', wp)
      }
    }
  }

  // ============================================================
  // Initial job assignment — match agents to workplaces
  // ============================================================
  private assignInitialJobs(): void {
    const workplaces = this.locations.filter((l) => l.type === 'workplace')
    // Sort agents by education (high first — they get first pick)
    const sorted = [...this.agents].sort((a, b) => {
      const order: Record<Education, number> = { high: 0, medium: 1, low: 2 }
      return order[a.education] - order[b.education]
    })

    for (const agent of sorted) {
      // Children can't work — they go to school
      if (agent.state === 'child') continue

      if (agent.age >= this.getRetirementAge()) {
        agent.state = 'retired'
        agent.income = 10 // pension
        agent.lifeEvents.push({ tick: 0, type: 'retired', description: 'Started retired' })
        continue
      }

      // Find matching workplace with open slots
      const matching = workplaces.filter((wp) => {
        if (wp.filledSlots >= wp.jobSlots) return false
        const req = WORKPLACE_CONFIGS[wp.workplaceType!].requiredEducation
        const skillReq = EDUCATION_SKILL_MAP[req]
        const agentSkill = EDUCATION_SKILL_MAP[agent.education]
        return agentSkill >= skillReq * 0.7 // some flexibility
      })

      if (matching.length > 0) {
        // Pick closest
        matching.sort((a, b) =>
          vec2Distance(agent.position, a.position) - vec2Distance(agent.position, b.position)
        )
        const wp = matching[0]
        this.hireAgent(agent, wp)
      }
      // else stays unemployed
    }
  }

  // ============================================================
  // Hire an agent at a workplace
  // ============================================================
  private hireAgent(agent: Agent, wp: Location): void {
    agent.state = 'employed'
    agent.workplaceId = wp.id
    agent.income = wp.wage
    agent.ticksUnemployed = 0
    wp.filledSlots++
    agent.lifeEvents.push({
      tick: this.tick,
      type: 'hired',
      description: `Hired at ${WORKPLACE_CONFIGS[wp.workplaceType!].label} ($${Math.round(wp.wage)}/tick)`,
    })
  }

  // ============================================================
  // Fire an agent (supports robotic automation, AI displacement, and general firing)
  // ============================================================
  private fireAgent(agent: Agent, reason: 'fired' | 'automated' | 'ai_displaced' | 'economic_layoff'): void {
    if (agent.workplaceId) {
      const wp = this.locations.find((l) => l.id === agent.workplaceId)
      if (wp) {
        wp.filledSlots = Math.max(0, wp.filledSlots - 1)
        if (reason === 'automated') {
          wp.automatedSlots++
          wp.jobSlots = Math.max(0, wp.jobSlots - 1)
        } else if (reason === 'ai_displaced') {
          wp.aiDisplacedSlots++
          wp.jobSlots = Math.max(0, wp.jobSlots - 1)
        }
        // 'economic_layoff' and 'fired': slot is freed but NOT destroyed (can be refilled)
      }
    }
    // --- Severance pay: 4-12 weeks of salary based on education ---
    const prevIncome = agent.income
    const severanceWeeks = agent.education === 'high' ? 12
      : agent.education === 'medium' ? 8
      : 4
    const severance = prevIncome * severanceWeeks
    agent.wealth += severance

    agent.state = 'unemployed'
    agent.workplaceId = null
    agent.income = 5 // minimal unemployment benefit
    agent.ticksUnemployed = 0
    this.tickLayoffs++
    const descriptions: Record<string, string> = {
      automated: 'Lost job to robotic automation',
      ai_displaced: 'Lost job to AI/LLM displacement',
      fired: 'Lost job (economic downturn)',
      economic_layoff: 'Laid off (business cost-cutting)',
    }
    agent.lifeEvents.push({
      tick: this.tick,
      type: reason === 'ai_displaced' ? 'automated' : reason === 'economic_layoff' ? 'economic_layoff' : reason,
      description: descriptions[reason],
    })
    if (severance > 0) {
      agent.lifeEvents.push({
        tick: this.tick,
        type: 'severance',
        description: `Severance: $${Math.round(severance)} (${severanceWeeks}wk × $${Math.round(prevIncome)}/tick)`,
      })
    }
    this.emit('agent:fired', { agentId: agent.id, reason })
  }

  // ============================================================
  // Dead agent cleanup — ☠️ persists for DEAD_DISPLAY_TICKS then removed
  // ============================================================
  private static readonly DEAD_DISPLAY_TICKS = 3

  private cleanupDeadAgents(): void {
    const toRemove: string[] = []
    for (const agent of this.agents) {
      if (agent.state === 'dead' && agent.deathTick !== null) {
        if (this.tick - agent.deathTick >= SimulationEngine.DEAD_DISPLAY_TICKS) {
          toRemove.push(agent.id)
        }
      }
    }
    if (toRemove.length > 0) {
      this.agents = this.agents.filter((a) => !toRemove.includes(a.id))
      this.tickDeaths += toRemove.length
    }
  }

  // ============================================================
  // Kill an agent — sets state to 'dead' for visual display before removal
  // ============================================================
  private killAgent(agent: Agent, reason: string): void {
    // Free workplace slot
    if (agent.workplaceId) {
      const wp = this.locations.find((l) => l.id === agent.workplaceId)
      if (wp) wp.filledSlots = Math.max(0, wp.filledSlots - 1)
    }
    // Handle partner — they become single, inherit children
    // --- Wealth inheritance: distribute to partner + children agents ---
    const inheritableWealth = Math.max(0, agent.wealth)
    if (inheritableWealth > 0) {
      const heirs: Agent[] = []
      if (agent.partnerId) {
        const partner = this.agents.find((a) => a.id === agent.partnerId)
        if (partner && partner.state !== 'dead') heirs.push(partner)
      }
      // Find child agents whose homeId matches this agent's homeId (same family)
      const familyChildren = this.agents.filter((a) =>
        a.state === 'child' && a.homeId === agent.homeId && a.id !== agent.id
      )
      heirs.push(...familyChildren)

      if (heirs.length > 0) {
        const share = inheritableWealth / heirs.length
        for (const heir of heirs) {
          heir.wealth += share
          heir.lifeEvents.push({
            tick: this.tick,
            type: 'inheritance',
            description: `Inherited $${Math.round(share)} from ${agent.id}`,
          })
        }
      }
    }
    if (agent.partnerId) {
      const partner = this.agents.find((a) => a.id === agent.partnerId)
      if (partner) {
        partner.partnerId = null
        partner.children += agent.children // inherit children
        partner.satisfaction = clamp(partner.satisfaction - 0.2, 0, 1)
      }
    }
    agent.state = 'dead'
    agent.currentAction = 'dying'
    agent.deathTick = this.tick
    agent.workplaceId = null
    agent.income = 0
    agent.partnerId = null
    agent.children = 0
    agent.lifeEvents.push({ tick: this.tick, type: 'died', description: reason })
    this.tickPrematureDeaths++
  }

  // ============================================================
  // Agent aging
  // ============================================================
  private ageAgents(): void {
    if (this.tick % this.params.ticksPerYear !== 0) return
    for (const agent of this.agents) {
      agent.age++

      // --- Child mortality from poverty: poor families lose children ---
      // Real-world: child mortality strongly correlated with household income
      // Under 5 years: higher risk; 5-17: lower but still present
      if (agent.state === 'child') {
        // Find parent(s) by matching homeId among adults
        const parents = this.agents.filter(a =>
          a.state !== 'dead' && a.state !== 'child' && a.homeId === agent.homeId
        )
        const parentWealth = parents.length > 0
          ? parents.reduce((s, p) => s + p.wealth, 0) / parents.length
          : 0

        // Mortality risk: inversely proportional to parent wealth
        // Orphan (no parents alive) → high risk
        // Parents with <$0 wealth → ~3% annual mortality (under 5) / ~1% (5-17)
        // Parents with >$200 → near zero risk
        if (parentWealth < 100) {
          const povertyIntensity = Math.max(0, 1 - parentWealth / 100) // 1.0 at $0, 0.0 at $100
          const baseRisk = agent.age < 5 ? 0.03 : 0.008 // under-5 mortality much higher
          const orphanBonus = parents.length === 0 ? 0.05 : 0
          const deathChance = baseRisk * povertyIntensity + orphanBonus

          if (this.rng() < deathChance) {
            this.killAgent(agent, `Died in childhood (age ${agent.age}) — family poverty`)
            agent.lifeEvents.push({
              tick: this.tick,
              type: 'premature_death',
              description: `Child died at age ${agent.age} due to poverty (household wealth: $${Math.round(parentWealth)})`,
            })
            this.tickPrematureDeaths++
            continue
          }
        }
      }

      // --- Child → Adult transition at age 18 ---
      if (agent.state === 'child' && agent.age >= 18) {
        // Determine education based on school attendance + education mix probability
        const eduRoll = this.rng()
        const eduLow = this.params.educationMix.low
        const eduMed = this.params.educationMix.medium
        agent.education = eduRoll < eduLow ? 'low'
          : eduRoll < eduLow + eduMed ? 'medium'
          : 'high'
        agent.state = 'unemployed'
        agent.wealth = 20 + this.rng() * 50 // small starting capital
        agent.creditScore = 0.5 + this.rng() * 0.2
        agent.currentAction = 'idle'
        agent.lifeEvents.push({
          tick: this.tick,
          type: 'hired', // reuse 'hired' type — means entered workforce
          description: `Graduated school (edu: ${agent.education}) — entered workforce`,
        })
        continue
      }

      // --- School education upgrade for children (every year, chance to improve) ---
      if (agent.state === 'child' && agent.age >= 6 && agent.age < 18) {
        // Gradual education improvement based on years of schooling
        if (agent.age >= 12 && agent.education === 'low' && this.rng() < 0.6) {
          agent.education = 'medium'
        }
      }

      // --- Retirement ---
      if (agent.age >= this.getRetirementAge() && agent.state !== 'retired' && agent.state !== 'dead' && agent.state !== 'criminal' && agent.state !== 'child') {
        if (agent.workplaceId) {
          const wp = this.locations.find((l) => l.id === agent.workplaceId)
          if (wp) wp.filledSlots = Math.max(0, wp.filledSlots - 1)
        }
        // If business owner, bankrupt their business on retirement
        if (agent.state === 'business_owner' && agent.ownedBusinessId) {
          this.bankruptBusiness(agent)
        }
        agent.state = 'retired'
        agent.workplaceId = null
        agent.income = Math.max(10, agent.income * 0.3) // pension
        agent.lifeEvents.push({ tick: this.tick, type: 'retired', description: 'Retired' })
      }
    }
  }

  // ============================================================
  // Population renewal — replace old retirees with new young agents
  // Keeps population stable and economy alive
  // ============================================================
  private renewPopulation(): void {
    // Runs every tick — old-age death is probabilistic, immigration is capped per tick
    const tpy = this.params.ticksPerYear
    const maxAge = this.getMaxAge()
    const homes = this.locations.filter((l) => l.type === 'home')
    if (homes.length === 0) return

    // --- Probabilistic old-age death: agents past maxAge have increasing chance each tick ---
    // An agent at exactly maxAge has ~0 chance; at maxAge+5 it's near certain over a year
    const toRemove: string[] = []
    for (const agent of this.agents) {
      if (agent.state === 'dead') continue
      if (agent.age >= maxAge) {
        // Probability increases with how far past maxAge: spread deaths over ~2 years
        const yearsOver = agent.age - maxAge
        const deathProb = Math.min(0.8, (0.3 + yearsOver * 0.15) / tpy)
        if (this.rng() < deathProb) {
          toRemove.push(agent.id)
          // Free their workplace slot if any
          if (agent.workplaceId) {
            const wp = this.locations.find((l) => l.id === agent.workplaceId)
            if (wp) wp.filledSlots = Math.max(0, wp.filledSlots - 1)
          }
        }
      }
    }

    if (toRemove.length > 0) {
      this.agents = this.agents.filter((a) => !toRemove.includes(a.id))
      this.tickDeaths += toRemove.length
    }

    // --- Immigration: add 0-2 agents per tick if below target population ---
    const deficit = this.params.populationSize - this.agents.length
    const maxPerTick = 2 // cap to avoid batch spikes
    const toAdd = Math.min(deficit, maxPerTick)

    for (let i = 0; i < toAdd; i++) {
      const home = homes[Math.floor(this.rng() * homes.length)]
      const gender = this.rng() < 0.5 ? 'male' as const : 'female' as const

      const eduRoll = this.rng()
      const education: Education = eduRoll < this.params.educationMix.low ? 'low'
        : eduRoll < this.params.educationMix.low + this.params.educationMix.medium ? 'medium'
        : 'high'

      const newAgent: Agent = {
        id: uid('agent'),
        position: {
          x: home.position.x + (this.rng() - 0.5) * home.radius * 2,
          y: home.position.y + (this.rng() - 0.5) * home.radius * 2,
        },
        velocity: { x: 0, y: 0 },
        target: null,
        targetLocationId: null,
        age: 18 + Math.floor(this.rng() * 7), // 18-24 years old
        gender,
        education,
        state: 'unemployed',   // enter as job-seekers
        wealth: 0,
        income: 0,
        tickEarnings: 0,
        homeId: home.id,
        homeOwned: false,
        homeDebt: 0,
        homeDebtPayment: 0,
        homeValue: home.housingValue ?? 300,
        partnerId: null,
        children: 0,
        workplaceId: null,
        satisfaction: 0.7 + this.rng() * 0.2,
        needsConsumption: false,
        ticksUnemployed: 0,
        ticksSinceConsumption: 0,
        currentAction: 'idle',
        isSick: false,
        ticksSick: 0,
        ticksLowSatisfaction: 0,
        ticksAsCriminal: 0,
        deathTick: null,
        carryingResource: false,
        lastPaidTick: -10,
        loan: 0,
        loanPayment: 0,
        creditScore: 0.5,
        ownedBusinessId: null,
        businessDebt: 0,
        businessDebtPayment: 0,
        businessRevenue: 0,
        businessTicksUnprofitable: 0,
        ticksStudying: 0,
        stayTicksRemaining: 0,
        trail: [],
        lifeEvents: [{
          tick: this.tick,
          type: 'born',
          description: `Immigrated (${gender}, edu: ${education})`,
        }],
        wealthHistory: [0],
      }
      this.agents.push(newAgent)
      this.tickBirths++
    }
  }

  // ============================================================
  // Automation — dual-channel: robotic + AI displacement
  // Based on Anthropic Economic Index (March 2026):
  //   - Robotic automation: affects physical/manual labor (factories, warehouses)
  //   - AI displacement: affects cognitive/white-collar work (offices, programming, finance)
  // Key insight: AI primarily displaces higher-educated, higher-paid workers
  // Young workers (22-25) face 14% hiring slowdown in AI-exposed occupations
  // ============================================================
  private runAutomation(): void {
    const workplaces = this.locations.filter(
      (l) => l.type === 'workplace' && l.jobSlots > 0
    )
    const tpy = this.params.ticksPerYear

    for (const wp of workplaces) {
      const config = WORKPLACE_CONFIGS[wp.workplaceType!]
      const owner = wp.ownerId ? this.agents.find((a) => a.id === wp.ownerId) : null
      const emptySlots = wp.jobSlots - wp.filledSlots

      // --- Channel 1: Robotic/physical automation ---
      // A robot replaces multiple workers (2-4 at once) — much cheaper than human labor
      const roboticProb = (this.params.aiGrowthRate * config.automationRisk) / tpy
      if (this.rng() < roboticProb) {
        // How many slots does one robot replace? 2-4 depending on workplace type
        const bulkSize = config.automationRisk > 0.5 ? 3 + Math.floor(this.rng() * 2) : 2 + Math.floor(this.rng() * 2)
        const investPerSlot = (wp.wage ?? 30) * 10 // robot costs ~10 weeks of wage (vs 52 weeks/year human)

        if (owner && owner.state === 'business_owner') {
          owner.wealth -= investPerSlot * bulkSize
          owner.lifeEvents.push({
            tick: this.tick, type: 'automation_savings',
            description: `Invested $${Math.round(investPerSlot * bulkSize)} in robot replacing ${bulkSize} workers`,
          })
        }

        for (let i = 0; i < bulkSize && wp.jobSlots > 0; i++) {
          // Fire a filled worker or eliminate an empty slot
          if (wp.filledSlots > 0 && (emptySlots === 0 || this.rng() < 0.6)) {
            const worker = this.agents.find(
              (a) => a.workplaceId === wp.id && a.state === 'employed'
            )
            if (worker) {
              this.fireAgent(worker, 'automated')
              this.cumulativeRoboticFired++
            }
          } else if (wp.jobSlots > wp.filledSlots) {
            wp.jobSlots = Math.max(0, wp.jobSlots - 1)
            wp.automatedSlots++
          }
          this.cumulativeAutomatedJobs++
        }
      }

      // --- Channel 2: AI/LLM displacement ---
      // One AI tool replaces 2-5 cognitive workers (even more efficient than robots)
      const aiProb = (this.params.aiDiffusionRate * config.aiExposure) / tpy
      if (this.rng() < aiProb) {
        // AI is even more scalable: 2-5 workers replaced per adoption event
        const bulkSize = config.aiExposure > 0.5 ? 3 + Math.floor(this.rng() * 3) : 2 + Math.floor(this.rng() * 2)
        const investPerSlot = (wp.wage ?? 30) * 6 // AI costs ~6 weeks of wage

        if (owner && owner.state === 'business_owner') {
          owner.wealth -= investPerSlot * bulkSize
          owner.lifeEvents.push({
            tick: this.tick, type: 'automation_savings',
            description: `Invested $${Math.round(investPerSlot * bulkSize)} in AI replacing ${bulkSize} workers`,
          })
        }

        // Sort workers by vulnerability: higher education + higher age = more exposed
        const workers = this.agents.filter(
          (a) => a.workplaceId === wp.id && a.state === 'employed'
        ).sort((a, b) => {
          const eduScore = (e: string) => e === 'high' ? 3 : e === 'medium' ? 2 : 1
          const vulnA = eduScore(a.education) * 0.6 + (a.age / 80) * 0.4
          const vulnB = eduScore(b.education) * 0.6 + (b.age / 80) * 0.4
          return vulnB - vulnA
        })

        let workerIdx = 0
        for (let i = 0; i < bulkSize && wp.jobSlots > 0; i++) {
          const emptyNow = wp.jobSlots - wp.filledSlots
          if (workerIdx < workers.length && (emptyNow === 0 || this.rng() < 0.7)) {
            this.fireAgent(workers[workerIdx], 'ai_displaced')
            this.cumulativeAiFired++
            workerIdx++
          } else if (wp.jobSlots > wp.filledSlots) {
            wp.jobSlots = Math.max(0, wp.jobSlots - 1)
            wp.aiDisplacedSlots++
          }
          this.cumulativeAiDisplacedJobs++
        }
      }
    }

    // --- AI creates new high-skill jobs (fewer slots, higher wages) ---
    // New job creation is suppressed as displacement grows (automation destroys more than it creates)
    // At 0% displacement → full creation rate. At 50% → 25% rate. At 80%+ → nearly 0.
    const displacementDampener = Math.max(0.05, 1 - this.metrics.totalDisplacementRate * 2)
    const creationProb = ((this.params.aiGrowthRate + this.params.aiDiffusionRate) * 0.2 * displacementDampener) / tpy
    if (this.rng() < creationProb && this.getVacancyRate() < 0.08) {
      const existingWp = this.locations.filter((l) => l.type === 'workplace')
      if (existingWp.length > 0) {
        const base = existingWp[Math.floor(this.rng() * existingWp.length)]
        const newType: WorkplaceType = this.rng() > 0.5 ? 'skilled' : 'creative'
        const newWp: Location = {
          id: uid('wp'),
          type: 'workplace',
          position: vec2(
            base.position.x + (this.rng() - 0.5) * 10,
            base.position.y + (this.rng() - 0.5) * 10,
          ),
          radius: 2,
          workplaceType: newType,
          jobSlots: 2 + Math.floor(this.rng() * 3),
          filledSlots: 0,
          automatedSlots: 0,
          aiDisplacedSlots: 0,
          wage: WORKPLACE_CONFIGS[newType].baseWage * (1 + this.rng() * 0.3),
        }
        this.locations.push(newWp)
        this.emit('location:created', newWp)
      }
    }
  }

  // ============================================================
  // Economic layoffs — business owners fire workers to cut costs
  // Triggered when a business is unprofitable or owner's wealth is declining
  // Runs every tick (small probability per struggling business)
  // ============================================================
  private processLayoffs(): void {
    for (const wp of this.locations) {
      if (wp.type !== 'workplace' || !wp.ownerId || wp.filledSlots === 0) continue

      const owner = this.agents.find((a) => a.id === wp.ownerId)
      if (!owner || owner.state !== 'business_owner') continue

      // --- Economic layoff conditions ---
      // Owner is struggling: business has been unprofitable OR owner wealth is negative
      const isStrugglingBiz = owner.businessTicksUnprofitable > 4
      const isOwnerInDebt = owner.wealth < 0
      const highWageBill = wp.filledSlots * (wp.wage ?? 30) > owner.wealth * 0.5 && owner.wealth > 0

      if (!isStrugglingBiz && !isOwnerInDebt && !highWageBill) continue

      // Probability of laying off 1 worker this tick (higher if more desperate)
      let layoffProb = 0.02
      if (isOwnerInDebt) layoffProb += 0.06
      if (isStrugglingBiz) layoffProb += 0.04
      if (highWageBill) layoffProb += 0.02

      if (this.rng() < layoffProb) {
        // Fire the most expensive worker first (cost-cutting logic)
        const workers = this.agents.filter(
          (a) => a.workplaceId === wp.id && a.state === 'employed'
        )
        if (workers.length > 0) {
          workers.sort((a, b) => b.income - a.income) // most expensive first
          this.fireAgent(workers[0], 'economic_layoff')
        }
      }
    }
  }

  // ============================================================
  // Agent decision — choose where to go
  // Since 1 tick = 1 week, agents SNAP to locations (no multi-tick commute).
  // Stay durations are in weeks. Agents stay at locations for weeks/months.
  // ============================================================
  // Stay durations per location type (in ticks, 1 tick = 1 week)
  private static readonly STAY_DURATIONS: Record<string, [number, number]> = {
    school:     [4, 12],  // 1-3 months at school before break
    workplace:  [4, 12],  // 1-3 months work stint before break
    market:     [1, 1],   // 1 week shopping trip
    government: [1, 1],   // 1 week at government
    bank:       [1, 1],   // 1 week at bank
    resource:   [2, 4],   // 2-4 weeks gathering expedition
    factory:    [1, 2],   // 1-2 weeks at factory
    home:       [1, 3],   // 1-3 weeks rest at home
  }

  private getStayDuration(locType: string): number {
    const range = SimulationEngine.STAY_DURATIONS[locType] ?? [1, 2]
    return range[0] + Math.floor(this.rng() * (range[1] - range[0] + 1))
  }

  private agentDecide(agent: Agent): void {
    // --- 1. Currently staying at a location (timer active) ---
    if (agent.stayTicksRemaining > 0) {
      agent.stayTicksRemaining--
      agent.target = null // don't move while staying
      if (agent.stayTicksRemaining <= 0) {
        // Timer expired — chain to next destination (snaps instantly)
        this.chainNextDestination(agent)
      }
      return
    }

    // --- 2. Walking toward a target (criminals wandering, rare) ---
    if (agent.target && vec2Distance(agent.position, agent.target) > ARRIVAL_DISTANCE) {
      agent.currentAction = 'commuting'
      return
    }

    // --- 3. No active stay — pick a new activity (snaps to destination) ---
    agent.target = null
    agent.targetLocationId = null
    this.pickNewActivity(agent)
  }

  // ================================================================
  // Chain next destination when stay timer expires.
  // This creates proper sequences:
  //   work → home → work, school → home → school,
  //   resource → factory → home → resource, etc.
  // ================================================================
  private chainNextDestination(agent: Agent): void {
    const atLoc = this.locations.find((l) => l.id === agent.targetLocationId)
    const atHome = atLoc && atLoc.id === agent.homeId
    const atType = atLoc?.type ?? ''

    agent.targetLocationId = null

    // --- At HOME: rest is over, pick a new outing ---
    if (atHome) {
      this.pickNewActivity(agent)
      return
    }

    // --- At RESOURCE (manual worker): go to factory if carrying, else go home ---
    if (atType === 'resource') {
      if (agent.carryingResource) {
        this.sendToNearest(agent, 'factory')
        agent.currentAction = 'hauling'
      } else {
        this.sendToNearest(agent, 'home')
        agent.currentAction = 'commuting'
      }
      return
    }

    // --- At FACTORY (manual worker): delivered resource, go home ---
    if (atType === 'factory') {
      this.sendToNearest(agent, 'home')
      agent.currentAction = 'commuting'
      return
    }

    // --- At any other non-home location: go home ---
    this.sendToNearest(agent, 'home')
    agent.currentAction = 'commuting'
  }

  // ================================================================
  // Pick a new activity — only called when agent is at home (rested)
  // or has no destination. Creates proper outings.
  // ================================================================
  private pickNewActivity(agent: Agent): void {
    // ---- ANNUAL OBLIGATORY EVENTS — override normal behavior on key ticks ----

    // Tax Day (Q1): only WORKERS go to government to pay taxes
    if (this.isAnnualQuarter(ANNUAL_Q1) && (agent.state === 'employed' || agent.state === 'business_owner')) {
      this.sendToNearest(agent, 'government')
      agent.currentAction = 'commuting'
      return
    }

    // Job Fair (Q2): unemployed converge on workplaces
    if (this.isAnnualQuarter(ANNUAL_Q2) && agent.state === 'unemployed') {
      this.sendToHiringWorkplace(agent)
      agent.currentAction = 'job_seeking'
      return
    }

    // Market Festival (Q3): adults visit Market
    if (this.isAnnualQuarter(ANNUAL_Q3) && agent.state !== 'child') {
      this.sendToNearest(agent, 'market')
      agent.currentAction = 'shopping'
      return
    }

    // Health/Education (Q4)
    if (this.isAnnualQuarter(ANNUAL_Q4) && agent.state !== 'child') {
      if (agent.isSick) {
        this.sendToNearest(agent, 'government')
        agent.currentAction = 'resting'
        return
      }
      if (agent.education !== 'high' && agent.wealth > 80 && agent.state === 'unemployed') {
        this.sendToNearest(agent, 'school')
        agent.currentAction = 'studying'
        return
      }
    }

    // ---- STRUCTURED DAILY ROUTINES — per agent state ----

    // --- Child: school (age 6+) or stay home ---
    if (agent.state === 'child') {
      if (agent.age >= 6 && this.rng() < 0.7) {
        this.sendToNearest(agent, 'school')
        agent.currentAction = 'studying'
      } else {
        this.sendToNearest(agent, 'home')
        agent.currentAction = 'resting'
      }
      return
    }

    // --- Criminal: patrol populated areas ---
    if (agent.state === 'criminal') {
      agent.currentAction = 'stealing'
      if (this.rng() < 0.4) {
        this.sendToNearest(agent, 'market')
      } else if (this.rng() < 0.3) {
        const workplaces = this.locations.filter((l) => l.type === 'workplace')
        if (workplaces.length > 0) {
          const wp = workplaces[Math.floor(this.rng() * workplaces.length)]
          agent.target = vec2(
            wp.position.x + (this.rng() - 0.5) * 6,
            wp.position.y + (this.rng() - 0.5) * 6,
          )
        }
      } else {
        this.sendToNearest(agent, 'home')
        agent.currentAction = 'resting'
      }
      return
    }

    // --- Retired: pension, shopping, or stay home ---
    if (agent.state === 'retired') {
      if (this.tick - agent.lastPaidTick >= 20 && this.rng() < 0.15) {
        this.sendToNearest(agent, 'government')
        agent.currentAction = 'commuting'
      } else if (agent.needsConsumption || agent.ticksSinceConsumption > this.consumptionInterval) {
        this.sendToNearest(agent, 'market')
        agent.currentAction = 'shopping'
      } else {
        this.sendToNearest(agent, 'home')
        agent.currentAction = 'resting'
      }
      return
    }

    // --- Unemployed: job search, study, benefits, shop, or stay home ---
    if (agent.state === 'unemployed') {
      if (this.rng() < 0.40) {
        this.sendToHiringWorkplace(agent)
        agent.currentAction = 'job_seeking'
      } else if (agent.education !== 'high' && agent.wealth > 80 && this.rng() < 0.25) {
        this.sendToNearest(agent, 'school')
        agent.currentAction = 'studying'
      } else if (this.tick - agent.lastPaidTick >= 25 && this.rng() < 0.20) {
        this.sendToNearest(agent, 'government')
        agent.currentAction = 'commuting'
      } else if (agent.needsConsumption) {
        this.sendToNearest(agent, 'market')
        agent.currentAction = 'shopping'
      } else {
        this.sendToNearest(agent, 'home')
        agent.currentAction = 'idle'
      }
      return
    }

    // --- Employed ---
    if (agent.state === 'employed') {
      const wp = this.locations.find((l) => l.id === agent.workplaceId)
      if (!wp) {
        agent.state = 'unemployed'
        agent.workplaceId = null
        agent.income = 0
        agent.ticksUnemployed = 0
        agent.currentAction = 'idle'
        return
      }

      // Financial trouble → bank
      if (agent.wealth < 20 && agent.loan <= 0 && agent.creditScore > 0.3 && this.rng() < 0.15) {
        this.sendToNearest(agent, 'bank')
        agent.currentAction = 'commuting'
        return
      }

      // Shopping errand before work
      if (agent.needsConsumption && this.rng() < 0.25) {
        this.sendToNearest(agent, 'market')
        agent.currentAction = 'shopping'
        return
      }

      // Manual workers go to resource
      if (wp.workplaceType === 'manual') {
        this.sendToNearest(agent, 'resource')
        agent.currentAction = 'commuting'
        return
      }

      // Non-manual workers go to workplace (snap)
      agent.position = vec2(
        wp.position.x + (this.rng() - 0.5) * 2,
        wp.position.y + (this.rng() - 0.5) * 2,
      )
      agent.target = null
      agent.targetLocationId = wp.id
      agent.stayTicksRemaining = this.getStayDuration('workplace')
      agent.currentAction = 'working'
      return
    }

    // --- Business owner ---
    if (agent.state === 'business_owner') {
      const biz = this.locations.find((l) => l.id === agent.ownedBusinessId)
      if (!biz) {
        agent.state = 'unemployed'
        agent.workplaceId = null
        agent.ownedBusinessId = null
        agent.income = 0
        agent.ticksUnemployed = 0
        agent.currentAction = 'idle'
        return
      }
      if (agent.needsConsumption) {
        this.sendToNearest(agent, 'market')
        agent.currentAction = 'shopping'
      } else {
        // Snap to business location
        agent.position = vec2(
          biz.position.x + (this.rng() - 0.5) * 2,
          biz.position.y + (this.rng() - 0.5) * 2,
        )
        agent.target = null
        agent.targetLocationId = biz.id
        agent.stayTicksRemaining = this.getStayDuration('workplace')
        agent.currentAction = 'working'
      }
    }
  }

  // --- Send agent to nearest location of type ---
  // For 'home' type, sends to the agent's assigned home (homeId)
  // Since 1 tick = 1 week, agents SNAP to the location (no multi-tick commute)
  private sendToNearest(agent: Agent, type: string): void {
    let loc: Location | undefined
    if (type === 'home') {
      // Go to assigned home
      loc = this.locations.find((l) => l.id === agent.homeId)
    }
    if (!loc) {
      const locs = this.locations.filter((l) => l.type === type)
      if (locs.length === 0) return
      locs.sort((a, b) =>
        vec2Distance(agent.position, a.position) - vec2Distance(agent.position, b.position)
      )
      loc = locs[0]
    }
    // Snap position to destination (with small offset to avoid stacking)
    const destX = loc.position.x + (this.rng() - 0.5) * loc.radius
    const destY = loc.position.y + (this.rng() - 0.5) * loc.radius
    agent.position = vec2(destX, destY)
    agent.target = null
    agent.targetLocationId = loc.id
    // Immediately start the stay timer since we arrived instantly
    agent.stayTicksRemaining = this.getStayDuration(
      loc.id === agent.workplaceId ? 'workplace' : loc.type
    )
  }

  // --- Send agent to a hiring workplace matching their skill ---
  private sendToHiringWorkplace(agent: Agent): void {
    const workplaces = this.locations.filter((l) => {
      if (l.type !== 'workplace') return false
      if (l.filledSlots >= l.jobSlots) return false
      if (vec2Distance(agent.position, l.position) > HIRING_SEARCH_RADIUS) return false
      const req = WORKPLACE_CONFIGS[l.workplaceType!].requiredEducation
      const skillReq = EDUCATION_SKILL_MAP[req]
      const agentSkill = EDUCATION_SKILL_MAP[agent.education]
      return agentSkill >= skillReq * 0.7
    })

    if (workplaces.length === 0) {
      // No matching jobs, wander
      this.sendToNearest(agent, 'home')
      return
    }

    // Pick highest wage within reach
    workplaces.sort((a, b) => b.wage - a.wage)
    const wp = workplaces[0]
    // Snap position to workplace (1 tick = 1 week, no multi-tick commute)
    agent.position = vec2(
      wp.position.x + (this.rng() - 0.5) * 2,
      wp.position.y + (this.rng() - 0.5) * 2,
    )
    agent.target = null
    agent.targetLocationId = wp.id
    agent.stayTicksRemaining = this.getStayDuration('workplace')
  }

  // ============================================================
  // Movement — steering behaviors
  // ============================================================
  private moveAgents(): void {
    for (const agent of this.agents) {
      // Agents staying at a location or dead don't move
      if (agent.stayTicksRemaining > 0 || agent.state === 'dead') {
        agent.velocity = vec2(0, 0)
        continue
      }

      let steer = vec2(0, 0)

      // Seek target
      if (agent.target) {
        const toTarget = vec2Sub(agent.target, agent.position)
        const dist = vec2Length(toTarget)
        if (dist > 0.1) {
          // Arrive: slow down near target
          const speed = dist < 3 ? AGENT_SPEED * (dist / 3) : AGENT_SPEED
          const arrive = vec2Scale(vec2Normalize(toTarget), speed)
          steer = vec2Add(steer, arrive)
        }
      } else {
        // Wander
        steer = vec2Add(steer, vec2(
          (this.rng() - 0.5) * WANDER_FORCE,
          (this.rng() - 0.5) * WANDER_FORCE,
        ))
      }

      // Separation from nearby agents (simplified — check subset)
      // For performance, only check nearest ~20 agents
      const nearbyCount = Math.min(20, this.agents.length)
      for (let i = 0; i < nearbyCount; i++) {
        const other = this.agents[Math.floor(this.rng() * this.agents.length)]
        if (other.id === agent.id) continue
        const dist = vec2Distance(agent.position, other.position)
        if (dist < SEPARATION_RADIUS && dist > 0.01) {
          const away = vec2Normalize(vec2Sub(agent.position, other.position))
          steer = vec2Add(steer, vec2Scale(away, SEPARATION_FORCE / dist))
        }
      }

      // Apply steering
      agent.velocity = vec2Scale(steer, 1)
      
      // Clamp speed
      const speed = vec2Length(agent.velocity)
      if (speed > AGENT_SPEED) {
        agent.velocity = vec2Scale(vec2Normalize(agent.velocity), AGENT_SPEED)
      }

      // Update position
      agent.position = vec2Add(agent.position, agent.velocity)
    }
  }

  // ============================================================
  // Interaction — what happens when agent arrives at location
  // ============================================================
  private agentInteract(agent: Agent): void {
    if (!agent.targetLocationId) return
    const loc = this.locations.find((l) => l.id === agent.targetLocationId)
    if (!loc) return
    if (vec2Distance(agent.position, loc.position) > loc.radius + 2) return

    // --- Workplace: get hired if unemployed ---
    // Hiring difficulty scales with ACTUAL displacement (not just parameter values)
    if (loc.type === 'workplace' && agent.state === 'unemployed') {
      // Job search cooldown: recently fired agents need time to find new work
      // Minimum 4 ticks (~1 month) of unemployment before eligible for rehiring
      if (agent.ticksUnemployed < 4) return

      if (loc.filledSlots < loc.jobSlots) {
        const config = WORKPLACE_CONFIGS[loc.workplaceType!]
        const req = config.requiredEducation
        const skillReq = EDUCATION_SKILL_MAP[req]
        const agentSkill = EDUCATION_SKILL_MAP[agent.education]
        if (agentSkill >= skillReq * 0.7) {
          // Use ACTUAL displacement rate from metrics (not static params)
          const actualDisplacement = this.metrics.totalDisplacementRate // 0-1

          // Base hiring penalty from actual displacement state:
          // At 10% displacement → 15% penalty (mild friction)
          // At 30% displacement → 45% penalty (structural unemployment)
          // At 50% displacement → 75% penalty (mass unemployment)
          let hiringPenalty = actualDisplacement * 1.5

          // AI-exposed jobs: additional penalty for young workers
          const aiExposure = config.aiExposure
          const isYoung = agent.age >= 18 && agent.age <= 25
          if (isYoung) {
            hiringPenalty += aiExposure * actualDisplacement * 0.5
          }

          // Education-specific: low-edu workers face structural exclusion
          if (agent.education === 'low') {
            hiringPenalty += actualDisplacement * 0.4
          } else if (agent.education === 'medium') {
            hiringPenalty += actualDisplacement * 0.15
          }

          // Cap at 0.95 (always a tiny chance to find work)
          hiringPenalty = Math.min(0.95, hiringPenalty)

          if (this.rng() > hiringPenalty) {
            this.hireAgent(agent, loc)
          }
        }
      }
    }

    // --- Workplace: earn wage on contact (employed) ---
    // Wage is earned ONLY when physically present at workplace, with a 2-tick cooldown
    // Employee wages also generate profit margin for the business owner
    if (loc.type === 'workplace' && loc.id === agent.workplaceId) {
      // --- Employee wage ---
      if (agent.state === 'employed' && this.tick - agent.lastPaidTick >= 2) {
        const wage = loc.wage ?? agent.income
        agent.wealth += wage
        agent.tickEarnings += wage
        agent.lastPaidTick = this.tick
        if (this.rng() < 0.3) {
          this.moneyEvents.push({
            agentId: agent.id, position: { ...agent.position },
            amount: Math.round(wage), tick: this.tick,
          })
        }
        // Owner profit margin: 25% of employee wage goes to owner's revenue
        if (loc.ownerId) {
          const owner = this.agents.find((a) => a.id === loc.ownerId)
          if (owner && owner.state === 'business_owner') {
            owner.businessRevenue += wage * 0.25
          }
        }
      }
      // --- Business owner collects accumulated revenue at own business ---
      if (agent.state === 'business_owner' && agent.ownedBusinessId === loc.id) {
        if (this.tick - agent.lastPaidTick >= 2 && agent.businessRevenue > 0) {
          const revenue = agent.businessRevenue
          agent.wealth += revenue
          agent.tickEarnings += revenue
          agent.businessRevenue = 0
          agent.lastPaidTick = this.tick
          if (this.rng() < 0.5) {
            this.moneyEvents.push({
              agentId: agent.id, position: { ...agent.position },
              amount: Math.round(revenue), tick: this.tick,
            })
          }
        }
      }
    }

    // --- Resource: pick up raw material (for transport to factory) ---
    if (loc.type === 'resource' && !agent.carryingResource) {
      const isManualWorker = agent.state === 'employed' && agent.workplaceId != null
      // Any employed agent can pick up resources, but manual workers do it as their main job
      if (isManualWorker) {
        agent.carryingResource = true
        agent.currentAction = 'hauling'
      }
    }

    // --- Factory: deliver resource → earn wage (this IS the manual worker's job) ---
    if (loc.type === 'factory' && agent.carryingResource) {
      agent.carryingResource = false
      loc.resourceStock = (loc.resourceStock ?? 0) + 1
      // Manual workers earn their workplace wage on delivery (hauling IS their work)
      const wp = this.locations.find((l) => l.id === agent.workplaceId)
      const deliveryPay = wp?.wage ?? 30
      agent.wealth += deliveryPay
      agent.tickEarnings += deliveryPay
      agent.lastPaidTick = this.tick
      this.moneyEvents.push({
        agentId: agent.id,
        position: { ...agent.position },
        amount: Math.round(deliveryPay),
        tick: this.tick,
      })
      // Log event (sample to avoid flooding)
      if (this.rng() < 0.1) {
        agent.lifeEvents.push({
          tick: this.tick, type: 'resource_delivered',
          description: `Delivered resource to factory (+$${Math.round(deliveryPay)})`,
        })
      }
    }

    // --- Government: satisfaction boost for visiting (paperwork, social services) ---
    // Pension and unemployment benefits are handled centrally by processGovernment()
    if (loc.type === 'government') {
      agent.satisfaction = clamp(agent.satisfaction + 0.02, 0, 1)
    }

    // --- Market: consume, gain satisfaction (contact-based expense) ---
    if (loc.type === 'market' && agent.wealth > (loc.goodsPrice ?? 10)) {
      const cost = loc.goodsPrice ?? 10
      agent.wealth -= cost
      agent.satisfaction = clamp(agent.satisfaction + 0.06, 0, 1)
      agent.needsConsumption = false
      agent.ticksSinceConsumption = 0
      // Money floater for spending
      if (this.rng() < 0.2) {
        this.moneyEvents.push({
          agentId: agent.id,
          position: { ...agent.position },
          amount: -Math.round(cost),
          tick: this.tick,
        })
      }
    }

    // --- Bank: apply for loan ---
    if (loc.type === 'bank' && agent.loan <= 0 && agent.creditScore > 0.3) {
      const isEmployed = agent.state === 'employed' || agent.state === 'business_owner'
      if (isEmployed && agent.income > 0) {
        const maxLoan = agent.income * (loc.maxLoanMultiplier ?? 10) * agent.creditScore
        const loanAmount = Math.min(maxLoan, 500) // cap at $500
        if (loanAmount > 20) {
          const rate = loc.interestRate ?? 0.07
          const totalRepay = loanAmount * (1 + rate)
          agent.loan = totalRepay
          agent.wealth += loanAmount
          // Repay over 12 ticks (1 year)
          agent.loanPayment = totalRepay / 12
          agent.lifeEvents.push({
            tick: this.tick, type: 'loan_taken',
            description: `Took loan $${Math.round(loanAmount)} (repay $${Math.round(totalRepay)} at ${Math.round(rate * 100)}%)`,
          })
          this.moneyEvents.push({
            agentId: agent.id,
            position: { ...agent.position },
            amount: Math.round(loanAmount),
            tick: this.tick,
          })
        }
      }
    }

    // --- School/University: duration-based education upgrade ---
    // Requires ~1 year of study (ticksPerYear ticks at school)
    // Tuition cost scales with level. Success rate depends on wealth.
    if (loc.type === 'school' && agent.education !== 'high' && agent.state !== 'child') {
      const tuition = agent.education === 'low' ? (loc.educationCost ?? 50) : (loc.educationCost ?? 50) * 2
      // Must be able to afford tuition
      if (agent.wealth > tuition) {
        agent.ticksStudying++
        // Pay tuition progressively (spread over study duration)
        const tuitionPerTick = tuition / this.params.ticksPerYear
        agent.wealth -= tuitionPerTick

        // After ~1 year of cumulative study at school → attempt graduation
        if (agent.ticksStudying >= this.params.ticksPerYear) {
          agent.ticksStudying = 0
          // Success rate tied to economic status: wealthy = 80%, poor = 30%
          const avgWealth = this.params.totalWealth / this.params.populationSize
          const wealthRatio = clamp(agent.wealth / avgWealth, 0, 2)
          const successRate = 0.30 + wealthRatio * 0.25 // 30%–80%
          if (this.rng() < successRate) {
            const oldEdu = agent.education
            agent.education = oldEdu === 'low' ? 'medium' : 'high'
            agent.lifeEvents.push({
              tick: this.tick,
              type: 'upskilled',
              description: `Education: ${oldEdu} → ${agent.education} (success rate: ${Math.round(successRate * 100)}%)`,
            })
            this.emit('agent:upskilled', { agentId: agent.id })
          } else {
            agent.lifeEvents.push({
              tick: this.tick,
              type: 'upskilled',
              description: `Failed university exam (${Math.round(successRate * 100)}% chance) — try again`,
            })
          }
        }
      }
    }
  }

  // ============================================================
  // Economy processing — wages, expenses, satisfaction decay
  // ============================================================
  private processEconomy(): void {
    // Cache vacancy rate once (used by business creation guard inside loop)
    const cachedVacancyRate = this.getVacancyRate()
    for (const agent of this.agents) {
      if (agent.state === 'dead' || agent.state === 'child') continue

      // --- NO passive income/expense ---
      // Wages are earned at workplace contact (agentInteract)
      // Spending happens at market contact (agentInteract)
      // Retired agents get pension at government contact (Tax Day)

      // NO passive costs — all expenses are contact-based (market purchases)

      // Satisfaction: employed agents get a small boost, all decay gently
      // Rates scaled by ticksPerYear so annual effect stays constant
      const tpy = this.params.ticksPerYear
      const satBoost = 0.06 / tpy   // employed: +0.06/year
      const satDecay = 0.096 / tpy   // all: -0.096/year
      if (agent.state === 'employed' || agent.state === 'business_owner') {
        agent.satisfaction = clamp(agent.satisfaction + satBoost, 0, 1)
      }
      agent.satisfaction = clamp(agent.satisfaction - satDecay, 0, 1)
      agent.ticksSinceConsumption++

      // Need consumption?
      if (agent.ticksSinceConsumption >= this.consumptionInterval) {
        agent.needsConsumption = true
      }

      // --- Parent pays for children ---
      // Adults with children at the same home pay a small per-child cost each consumption cycle
      if (agent.needsConsumption && agent.children > 0) {
        const childCostPerTick = 2 * agent.children / tpy // ~$2/child/year spread across ticks
        agent.wealth -= childCostPerTick
      }

      // Floor wealth at a minimum (prevent extreme debt spiral)
      agent.wealth = Math.max(agent.wealth, -500)

      // Bankruptcy event
      if (agent.wealth < BANKRUPTCY_THRESHOLD && agent.state !== 'retired') {
        if (!agent.lifeEvents.some((e) => e.type === 'bankrupt' && e.tick > this.tick - 50)) {
          agent.lifeEvents.push({
            tick: this.tick,
            type: 'bankrupt',
            description: `Bankrupt (debt: $${Math.round(agent.wealth)})`,
          })
        }
      }

      // Business creation — wealthy + educated agents become entrepreneurs
      // Guarded by vacancy rate: no new businesses if >10% of slots are already empty
      // Business creation: suppressed by actual displacement (fewer opportunities in automated economy)
      // Guard: only when vacancy < 10% AND displacement is not too high
      const actualDisplacement = this.metrics.totalDisplacementRate
      if (cachedVacancyRate < 0.10 && actualDisplacement < 0.60) {
        const avgWealth = this.params.totalWealth / this.params.populationSize
        const wealthThreshold = avgWealth * 1.2
        const canEntrepreneurize =
          (agent.state === 'employed' || agent.state === 'unemployed') &&
          agent.ownedBusinessId === null &&
          agent.wealth > wealthThreshold &&
          (agent.education === 'high' || agent.education === 'medium') &&
          agent.satisfaction > 0.35 &&
          agent.creditScore > 0.3 &&
          agent.age >= 25 && agent.age <= 60
        // Annual rate ~4%, suppressed by displacement: at 30% displacement → halved
        const annualBizRate = 0.04 * Math.max(0.1, 1 - actualDisplacement * 2)
        const bizChance = annualBizRate / this.params.ticksPerYear
        if (canEntrepreneurize && this.rng() < bizChance) {
          this.createBusiness(agent)
        }
      }
    }
  }

  // ============================================================
  // Business creation by entrepreneurial agent
  // Agent invests personal capital + takes a large business loan
  // Business type depends on education: high→office/studio, medium→shop/factory
  // ============================================================
  private createBusiness(agent: Agent): void {
    // --- Determine business type based on education ---
    let wpType: WorkplaceType
    if (agent.education === 'high') {
      wpType = this.rng() < 0.6 ? 'skilled' : 'creative'
    } else {
      wpType = this.rng() < 0.5 ? 'service' : 'manual'
    }
    const config = WORKPLACE_CONFIGS[wpType]

    // --- Funding: personal investment (40% of wealth) + business loan ---
    const personalInvestment = agent.wealth * 0.4
    const loanAmount = personalInvestment * (1.5 + this.rng()) // loan = 1.5-2.5x personal investment
    const interestRate = 0.10 + this.rng() * 0.05 // 10-15% interest
    const totalRepay = loanAmount * (1 + interestRate)
    const repaymentTicks = this.params.ticksPerYear * 3 // repay over 3 years

    agent.wealth -= personalInvestment
    agent.wealth += loanAmount // receive loan funds (used to create the business)
    agent.businessDebt = totalRepay
    agent.businessDebtPayment = totalRepay / repaymentTicks

    // --- Create the workplace location ---
    const slots = 3 + Math.floor(this.rng() * 4) // 3-6 job slots
    const newWp: Location = {
      id: uid('biz'),
      type: 'workplace',
      position: vec2(
        agent.position.x + (this.rng() - 0.5) * 8,
        agent.position.y + (this.rng() - 0.5) * 8,
      ),
      radius: 2.5,
      workplaceType: wpType,
      jobSlots: slots,
      filledSlots: 0,
      automatedSlots: 0,
      aiDisplacedSlots: 0,
      wage: config.baseWage * (0.85 + this.rng() * 0.3),
      ownerId: agent.id,
    }

    this.locations.push(newWp)

    // --- Update agent state ---
    agent.state = 'business_owner'
    agent.workplaceId = newWp.id
    agent.ownedBusinessId = newWp.id
    agent.income = config.baseWage * 1.5 // nominal (actual income is contact-based revenue)
    agent.businessRevenue = 0
    agent.businessTicksUnprofitable = 0

    agent.lifeEvents.push({
      tick: this.tick,
      type: 'started_business',
      description: `Started ${config.label} (${wpType}) — invested $${Math.round(personalInvestment)}, loan $${Math.round(loanAmount)}`,
    })
    agent.lifeEvents.push({
      tick: this.tick,
      type: 'business_loan_taken',
      description: `Business loan $${Math.round(loanAmount)} (repay $${Math.round(totalRepay)} over ${Math.round(repaymentTicks)} ticks at ${Math.round(interestRate * 100)}%)`,
    })

    this.emit('location:created', newWp)
    this.emit('agent:business', { agentId: agent.id })
  }

  // ============================================================
  // Business bankruptcy — close location, fire employees, ruin owner
  // ============================================================
  private bankruptBusiness(owner: Agent): void {
    const bizLoc = this.locations.find((l) => l.id === owner.ownedBusinessId)

    // Fire all employees at this location
    if (bizLoc) {
      for (const emp of this.agents) {
        if (emp.workplaceId === bizLoc.id && emp.id !== owner.id) {
          emp.state = 'unemployed'
          emp.workplaceId = null
          emp.income = 0
          emp.ticksUnemployed = 0
          emp.lifeEvents.push({
            tick: this.tick,
            type: 'fired',
            description: `Fired — employer went bankrupt`,
          })
          if (bizLoc) bizLoc.filledSlots = Math.max(0, bizLoc.filledSlots - 1)
        }
      }
      // Remove the location from the world
      const idx = this.locations.indexOf(bizLoc)
      if (idx >= 0) this.locations.splice(idx, 1)
      this.emit('location:removed', bizLoc)
    }

    // Ruin the owner
    owner.state = 'unemployed'
    owner.workplaceId = null
    owner.ownedBusinessId = null
    owner.income = 0
    owner.wealth = Math.min(owner.wealth, 0) // wiped out
    owner.businessDebt *= 0.3 // bank absorbs 70% (owner keeps 30% as personal debt)
    owner.loan += owner.businessDebt // remaining business debt becomes personal debt
    owner.loanPayment = owner.loan > 0 ? owner.loan / (this.params.ticksPerYear * 2) : 0
    owner.businessDebt = 0
    owner.businessDebtPayment = 0
    owner.businessRevenue = 0
    owner.businessTicksUnprofitable = 0
    owner.satisfaction = clamp(owner.satisfaction - 0.4, 0, 1)
    owner.creditScore = clamp(owner.creditScore - 0.4, 0, 1)
    owner.ticksUnemployed = 0

    owner.lifeEvents.push({
      tick: this.tick,
      type: 'business_bankrupt',
      description: `Business went bankrupt — lost everything`,
    })
    this.emit('agent:business_bankrupt', { agentId: owner.id })
  }

  // ============================================================
  // Housing — rent, mortgage, ownership, government expansion
  // Runs once per year (on year tick)
  // ============================================================
  private processHousing(): void {
    // NOTE: called only from annual block in step(), no need for tick guard
    const tpy = this.params.ticksPerYear

    // --- 1. Recount residents per home ---
    for (const loc of this.locations) {
      if (loc.type === 'home') loc.residentsCount = 0
    }
    for (const agent of this.agents) {
      if (agent.state === 'dead') continue
      // Children share parent's home — don't double-count (only count head of household)
      if (agent.state === 'child') continue
      // Couples: only count alphabetically-first partner
      if (agent.partnerId && agent.id > agent.partnerId) continue
      const home = this.locations.find((l) => l.id === agent.homeId)
      if (home) home.residentsCount = (home.residentsCount ?? 0) + 1
    }

    // --- 2. Process each adult agent's housing ---
    for (const agent of this.agents) {
      if (agent.state === 'dead' || agent.state === 'child') continue

      const home = this.locations.find((l) => l.id === agent.homeId)
      if (!home) continue

      // Couples: only alphabetically-first partner pays (avoids double-charging)
      if (agent.partnerId) {
        const partner = this.agents.find((a) => a.id === agent.partnerId)
        if (partner && agent.id > partner.id) continue
      }

      // --- 2a. Homeowner: no rent, no mortgage if paid off ---
      if (agent.homeOwned && agent.homeDebt <= 0) {
        // Owned home → satisfaction boost (stability)
        agent.satisfaction = clamp(agent.satisfaction + 0.03, 0, 1)
        continue
      }

      // --- 2b. Mortgage payment ---
      if (agent.homeDebt > 0 && agent.homeDebtPayment > 0) {
        const annualPayment = agent.homeDebtPayment * tpy
        const payment = Math.min(annualPayment, agent.homeDebt)

        if (agent.partnerId) {
          const partner = this.agents.find((a) => a.id === agent.partnerId)
          agent.wealth -= payment / 2
          if (partner) partner.wealth -= payment / 2
        } else {
          agent.wealth -= payment
        }
        agent.homeDebt -= payment

        // Mortgage fully paid → agent owns the home!
        if (agent.homeDebt <= 0) {
          agent.homeDebt = 0
          agent.homeDebtPayment = 0
          agent.homeOwned = true
          agent.creditScore = clamp(agent.creditScore + 0.1, 0, 1)
          agent.satisfaction = clamp(agent.satisfaction + 0.2, 0, 1)
          agent.lifeEvents.push({
            tick: this.tick, type: 'mortgage_paid',
            description: `Mortgage paid off! Now owns home (value: $${Math.round(agent.homeValue)})`,
          })
        }
        continue
      }

      // --- 2c. Renter: pay annual rent ---
      const rent = home.rent ?? 30
      if (agent.partnerId) {
        const partner = this.agents.find((a) => a.id === agent.partnerId)
        agent.wealth -= rent / 2
        if (partner) partner.wealth -= rent / 2
      } else {
        agent.wealth -= rent
      }

      // --- 2d. Can this renter afford to buy? Take mortgage ---
      // Conditions: employed, good credit, enough wealth for down payment (20%)
      const canBuy = !agent.homeOwned && agent.homeDebt <= 0 &&
        (agent.state === 'employed' || agent.state === 'business_owner') &&
        agent.creditScore > 0.4 &&
        agent.wealth > agent.homeValue * 0.20 && // 20% down payment
        agent.income > 0

      if (canBuy && this.rng() < 0.15) {
        const downPayment = agent.homeValue * 0.20
        agent.wealth -= downPayment
        agent.homeDebt = agent.homeValue - downPayment // 80% mortgage
        // Repay over 15 years
        const mortgageYears = 15
        agent.homeDebtPayment = agent.homeDebt / (mortgageYears * tpy)
        agent.lifeEvents.push({
          tick: this.tick, type: 'home_bought',
          description: `Bought home (value: $${Math.round(agent.homeValue)}, down: $${Math.round(downPayment)}, mortgage: $${Math.round(agent.homeDebt)})`,
        })
      }

      // --- 2e. Eviction: can't afford rent ---
      if (agent.wealth < -150) {
        const allHomes = this.locations.filter((l) => l.type === 'home')
        const cheapest = allHomes.reduce((best, h) =>
          (h.rent ?? 30) < (best.rent ?? 30) ? h : best, allHomes[0])
        if (cheapest && cheapest.id !== agent.homeId) {
          agent.homeId = cheapest.id
          agent.homeOwned = false
          agent.homeDebt = 0
          agent.homeDebtPayment = 0
          agent.homeValue = cheapest.housingValue ?? 300
          agent.satisfaction = clamp(agent.satisfaction - 0.15, 0, 1)
          agent.lifeEvents.push({
            tick: this.tick, type: 'evicted',
            description: `Evicted — moved to cheaper home (rent: $${cheapest.rent ?? 30})`,
          })
        }
      }
    }

    // --- 3. Government housing expansion: build new homes if shortage ---
    this.expandHousingIfNeeded()
  }

  // ============================================================
  // Government builds new homes when there's a housing shortage
  // New homes placed at expanded radius (world grows)
  // ============================================================
  private expandHousingIfNeeded(): void {
    const homes = this.locations.filter((l) => l.type === 'home')
    const totalCapacity = homes.reduce((sum, h) => sum + (h.maxResidents ?? 1), 0)
    const totalResidents = homes.reduce((sum, h) => sum + (h.residentsCount ?? 0), 0)

    // Build new housing if occupancy > 85%
    if (totalResidents < totalCapacity * 0.85) return

    // Determine how many new homes to build
    const shortage = Math.max(1, totalResidents - Math.floor(totalCapacity * 0.75))
    const newHomes = Math.min(5, Math.ceil(shortage / 3)) // build 1-5 homes at a time

    // Calculate current world radius from existing home positions
    let maxDist = 0
    for (const h of homes) {
      const d = Math.sqrt(h.position.x ** 2 + h.position.y ** 2)
      if (d > maxDist) maxDist = d
    }
    // Place new homes slightly beyond current radius (expand the map)
    const newRadius = maxDist + 10 + this.rng() * 10

    for (let i = 0; i < newHomes; i++) {
      const angle = this.rng() * Math.PI * 2
      const r = newRadius + (this.rng() - 0.5) * 8
      const pos = vec2(Math.cos(angle) * r, Math.sin(angle) * r)

      // Alternate between apartments and houses
      const isApartment = this.rng() < 0.5
      const value = isApartment
        ? 350 + Math.round(this.rng() * 250)
        : 200 + Math.round(this.rng() * 200)

      const newHome: Location = {
        id: uid(isApartment ? 'apt' : 'house'),
        type: 'home',
        position: pos,
        radius: isApartment ? 4 + this.rng() * 2 : 2.5 + this.rng() * 1.5,
        jobSlots: 0, filledSlots: 0, automatedSlots: 0, aiDisplacedSlots: 0, wage: 0,
        housingType: isApartment ? 'apartment' : 'house',
        housingValue: value,
        rent: Math.round(value * (isApartment ? 0.06 : 0.05)),
        maxResidents: isApartment ? 5 : 2,
        residentsCount: 0,
      }
      this.locations.push(newHome)
    }

    // Reassign homeless or overcrowded agents to new homes
    this.reassignHomelessAgents()
  }

  // ============================================================
  // Reassign agents who have no home or whose home is overcrowded
  // ============================================================
  private reassignHomelessAgents(): void {
    const homes = this.locations.filter((l) => l.type === 'home')

    for (const agent of this.agents) {
      if (agent.state === 'dead' || agent.state === 'child') continue
      if (agent.homeOwned) continue // owners stay put

      const currentHome = this.locations.find((l) => l.id === agent.homeId)
      if (!currentHome) {
        // Homeless — find any available home
        const available = homes.find((h) => (h.residentsCount ?? 0) < (h.maxResidents ?? 1))
        if (available) {
          agent.homeId = available.id
          agent.homeValue = available.housingValue ?? 300
          available.residentsCount = (available.residentsCount ?? 0) + 1
        }
      }
    }
  }

  // ============================================================
  // Family — married couples at home with high satisfaction can have babies
  // Babies grow into new agents after ~18 years
  // ============================================================
  private processFamily(): void {
    // Runs every tick — birth probability is per-tick (annual rate / ticksPerYear)
    const baseBirthProb = 0.15 / this.params.ticksPerYear

    // --- Economic stress factor: high unemployment suppresses fertility ---
    // Real-world: fertility drops ~1% for each 1% rise in unemployment
    // Here: at 50% unemployment → birth rate halved
    const living = this.agents.filter(a => a.state !== 'dead' && a.state !== 'child')
    const unemployedCount = living.filter(a => a.state === 'unemployed').length
    const unemploymentRate = living.length > 0 ? unemployedCount / living.length : 0
    const econStressFactor = Math.max(0.2, 1 - unemploymentRate)
    const birthProbPerTick = baseBirthProb * econStressFactor

    const newChildren: Agent[] = []

    for (const agent of this.agents) {
      if (agent.state === 'dead' || !agent.partnerId) continue
      // Only process once per couple (alphabetically-first partner)
      if (agent.id > agent.partnerId) continue

      const partner = this.agents.find((a) => a.id === agent.partnerId)
      if (!partner || partner.state === 'dead') continue

      // Baby conditions: at least one partner employed/business_owner, both satisfied, age 20-45, limited children
      const bothSatisfied = agent.satisfaction > 0.55 && partner.satisfaction > 0.55
      const atLeastOneEmployed = (agent.state === 'employed' || agent.state === 'business_owner')
        || (partner.state === 'employed' || partner.state === 'business_owner')
      const fertileAge = agent.age >= 20 && agent.age <= 45 && partner.age >= 20 && partner.age <= 45
      const notTooManyKids = agent.children < 4

      // --- Conception failure: probability increases with age, satisfaction, education, wealth ---
      // Real-world demographic transition: richer, more educated, happier people have fewer children
      // Age factor: fertility peaks at 25, drops sharply after 35
      const avgAge = (agent.age + partner.age) / 2
      const agePenalty = avgAge > 35 ? (avgAge - 35) * 0.04 : 0 // +4% failure per year over 35

      // Education factor: high-edu couples have fewer children (demographic transition)
      const eduScore = (e: string) => e === 'high' ? 0.9 : e === 'medium' ? 0.5 : 0.2
      const coupleEdu = (eduScore(agent.education) + eduScore(partner.education)) / 2
      const eduPenalty = coupleEdu * 0.35 // high-edu couple: +31% failure

      // Wealth factor: wealthier couples delay/avoid children
      const coupleWealth = agent.wealth + partner.wealth
      const wealthPenalty = Math.min(0.3, Math.max(0, coupleWealth - 200) * 0.001) // caps at +30%

      // Satisfaction factor: very happy people are more career-focused, less urgency for kids
      const avgSat = (agent.satisfaction + partner.satisfaction) / 2
      const satPenalty = Math.max(0, (avgSat - 0.6) * 0.25) // above 0.6 sat → up to +10% failure

      // Existing children penalty: each existing child reduces desire for more
      const kidsPenalty = agent.children * 0.12 // +12% per existing child

      const conceptionFailure = Math.min(0.85, agePenalty + eduPenalty + wealthPenalty + satPenalty + kidsPenalty)
      const adjustedBirthProb = birthProbPerTick * (1 - conceptionFailure)

      if (bothSatisfied && atLeastOneEmployed && fertileAge && notTooManyKids && this.rng() < adjustedBirthProb) {
        agent.children++
        partner.children = agent.children // sync count

        // --- Create a real child agent ---
        const gender = this.rng() < 0.5 ? 'male' : 'female'
        const home = this.locations.find((l) => l.id === agent.homeId)
        const homePos = home?.position ?? agent.position
        const scatter = (home?.radius ?? 3) * 1.5

        const child: Agent = {
          id: uid('child'),
          position: { x: homePos.x + (this.rng() - 0.5) * scatter, y: homePos.y + (this.rng() - 0.5) * scatter },
          velocity: { x: 0, y: 0 },
          target: null,
          targetLocationId: null,
          age: 0,
          gender: gender as 'male' | 'female',
          education: 'low',
          state: 'child',
          wealth: 0,
          income: 0,
          tickEarnings: 0,
          homeId: agent.homeId,
          homeOwned: false,
          homeDebt: 0,
          homeDebtPayment: 0,
          homeValue: home?.housingValue ?? 300,
          partnerId: null,
          children: 0,
          workplaceId: null,
          satisfaction: 0.7,
          needsConsumption: false,
          ticksUnemployed: 0,
          ticksSinceConsumption: 0,
          currentAction: 'resting',
          stayTicksRemaining: 0,
          isSick: false,
          ticksSick: 0,
          ticksLowSatisfaction: 0,
          ticksAsCriminal: 0,
          deathTick: null,
          carryingResource: false,
          lastPaidTick: -10,
          loan: 0,
          loanPayment: 0,
          creditScore: 0.5,
          ownedBusinessId: null,
          businessDebt: 0,
          businessDebtPayment: 0,
          businessRevenue: 0,
          businessTicksUnprofitable: 0,
          ticksStudying: 0,
          trail: [],
          lifeEvents: [{
            tick: this.tick,
            type: 'born',
            description: `Born to ${agent.gender === 'male' ? '👨' : '👩'}+${partner.gender === 'male' ? '👨' : '👩'} family`,
          }],
          wealthHistory: [0],
        }

        newChildren.push(child)

        // Update home capacity tracking
        if (home) {
          home.residentsCount = (home.residentsCount ?? 0) + 1
        }

        agent.satisfaction = clamp(agent.satisfaction + 0.1, 0, 1)
        partner.satisfaction = clamp(partner.satisfaction + 0.1, 0, 1)
        agent.lifeEvents.push({ tick: this.tick, type: 'had_baby', description: `Had a baby (${agent.children} children)` })
        partner.lifeEvents.push({ tick: this.tick, type: 'had_baby', description: `Had a baby (${agent.children} children)` })
        this.tickBirths++
      }
    }

    // Add all new children to the agent pool
    if (newChildren.length > 0) {
      this.agents.push(...newChildren)
      // Check if housing expansion is needed after births
      this.expandHousingIfNeeded()
    }
  }

  // ============================================================
  // Loan repayment + credit score update (runs every tick)
  // ============================================================
  private processLoans(): void {
    for (const agent of this.agents) {
      if (agent.state === 'dead') continue

      // --- Loan repayment ---
      if (agent.loan > 0 && agent.loanPayment > 0) {
        const payment = Math.min(agent.loanPayment, agent.loan)
        agent.wealth -= payment
        agent.loan -= payment

        // Loan fully repaid
        if (agent.loan <= 0) {
          agent.loan = 0
          agent.loanPayment = 0
          agent.creditScore = clamp(agent.creditScore + 0.05, 0, 1) // good repayment boosts score
        }

        // Default: can't afford payment and wealth too negative
        if (agent.wealth < -300 && agent.loan > 0) {
          agent.satisfaction = clamp(agent.satisfaction - 0.15, 0, 1)
          agent.creditScore = clamp(agent.creditScore - 0.3, 0, 1) // credit score crash
          agent.lifeEvents.push({
            tick: this.tick, type: 'loan_default',
            description: `Defaulted on loan (remaining: $${Math.round(agent.loan)})`,
          })
          // Debt remains but payments stop (written off partially)
          agent.loanPayment = 0
          agent.loan *= 0.5 // bank absorbs half
        }
      }

      // --- Business debt repayment ---
      if (agent.state === 'business_owner' && agent.businessDebt > 0 && agent.businessDebtPayment > 0) {
        const bizPayment = Math.min(agent.businessDebtPayment, agent.businessDebt)
        agent.wealth -= bizPayment
        agent.businessDebt -= bizPayment

        // Business debt fully repaid
        if (agent.businessDebt <= 0) {
          agent.businessDebt = 0
          agent.businessDebtPayment = 0
          agent.creditScore = clamp(agent.creditScore + 0.1, 0, 1)
        }

        // Track profitability: revenue vs debt payment
        if (agent.businessRevenue < bizPayment) {
          agent.businessTicksUnprofitable++
        } else {
          agent.businessTicksUnprofitable = Math.max(0, agent.businessTicksUnprofitable - 1)
        }
        // Reset revenue accumulator each tick
        agent.businessRevenue = 0

        // Bankruptcy: unprofitable for too long OR wealth too negative
        // Higher automation = faster failure (1/10 survival rate at high automation)
        const autoLevel = (this.params.aiGrowthRate + this.params.aiDiffusionRate) / 2
        const bankruptcyYears = 2 - autoLevel * 1.2 // 2 years → 0.8 years at max automation
        const bankruptcyThreshold = Math.max(this.params.ticksPerYear * 0.5, this.params.ticksPerYear * bankruptcyYears)
        if (agent.businessTicksUnprofitable > bankruptcyThreshold || agent.wealth < -400) {
          this.bankruptBusiness(agent)
        }
      }

      // --- Credit score update (once per year) ---
      if (this.tick % this.params.ticksPerYear === 0) {
        let score = 0.3 // base
        // Employment bonus
        if (agent.state === 'employed' || agent.state === 'business_owner') score += 0.25
        // Wealth bonus (scaled)
        score += clamp(agent.wealth / 500, 0, 0.2)
        // Income bonus
        score += clamp(agent.income / 100, 0, 0.15)
        // Penalty for existing debt
        if (agent.loan > 0) score -= 0.1
        // Age stability bonus
        if (agent.age > 30) score += 0.05
        // No default history bonus
        if (!agent.lifeEvents.some((e) => e.type === 'loan_default')) score += 0.05
        // Blend with existing score (momentum)
        agent.creditScore = clamp(agent.creditScore * 0.6 + score * 0.4, 0, 1)
      }
    }
  }

  // ============================================================
  // Causal societal phenomena — events are CAUSED by agent state,
  // not random probabilities. Each phenomenon has a clear causal chain.
  // ============================================================

  // Thresholds for causal transitions
  private static readonly CRIME_UNEMPLOYMENT_TICKS = 26  // ~6 months unemployed before crime risk
  private static readonly CRIME_WEALTH_THRESHOLD = 30    // poverty line for crime trigger
  private static readonly CRIME_SATISFACTION_THRESHOLD = 0.25
  private static readonly DISEASE_POVERTY_TICKS = 6      // ticks in poverty before sickness
  private static readonly DISEASE_WEALTH_THRESHOLD = 40
  private static readonly DIVORCE_LOW_SAT_TICKS = 5      // sustained low satisfaction before divorce
  private static readonly DIVORCE_SAT_THRESHOLD = 0.20
  private static readonly MARRIAGE_SAT_THRESHOLD = 0.60
  private static readonly REHAB_TICKS = 12               // ticks as criminal before possible rehabilitation
  private static readonly DEATH_SICK_TICKS = 10          // ticks sick before death risk rises

  private processCausalPhenomena(): void {
    const N = this.agents.length
    if (N === 0) return

    for (const agent of this.agents) {
      if (agent.state === 'dead' || agent.state === 'child') continue

      // --- Track satisfaction trend ---
      if (agent.satisfaction < SimulationEngine.DIVORCE_SAT_THRESHOLD) {
        agent.ticksLowSatisfaction++
      } else {
        agent.ticksLowSatisfaction = Math.max(0, agent.ticksLowSatisfaction - 1)
      }

      // --- DISEASE (internal): caused by sustained poverty + low satisfaction ---
      // Causal chain: poor for many ticks → body breaks down → sick
      // NOTE: Disease can also SPREAD by proximity (see processProximityInteractions)
      if (!agent.isSick && this.params.diseasesEnabled) {
        const inPoverty = agent.wealth < SimulationEngine.DISEASE_WEALTH_THRESHOLD
        const lowSat = agent.satisfaction < 0.35
        if (inPoverty && lowSat && agent.ticksLowSatisfaction >= SimulationEngine.DISEASE_POVERTY_TICKS) {
          const povertyDuration = agent.ticksLowSatisfaction - SimulationEngine.DISEASE_POVERTY_TICKS
          if (this.rng() < 0.05 + povertyDuration * 0.02) {
            agent.isSick = true
            agent.ticksSick = 0
            agent.satisfaction = clamp(agent.satisfaction - 0.15, 0, 1)
            agent.lifeEvents.push({ tick: this.tick, type: 'disease', description: 'Fell ill (sustained poverty & stress)' })
            this.tickDiseases++
          }
        }
      } else if (agent.isSick) {
        // Already sick — track duration, satisfaction decays
        agent.ticksSick++
        agent.satisfaction = clamp(agent.satisfaction - 0.03, 0, 1)
        // NOTE: Recovery now requires visiting market/government (see agentInteract)
        // Only wealthy agents who visit healthcare locations can recover
      }

      // --- PROLONGED UNEMPLOYMENT: multiple possible outcomes ---
      // Not everyone turns to crime — diversified paths based on agent profile
      if (agent.state === 'unemployed' && agent.ticksUnemployed >= SimulationEngine.CRIME_UNEMPLOYMENT_TICKS) {
        const desperate = agent.wealth < SimulationEngine.CRIME_WEALTH_THRESHOLD
          && agent.satisfaction < SimulationEngine.CRIME_SATISFACTION_THRESHOLD

        if (desperate) {
          const desperation = (agent.ticksUnemployed - SimulationEngine.CRIME_UNEMPLOYMENT_TICKS) * 0.02
          const roll = this.rng()

          if (roll < 0.03 + desperation * 0.4) {
            // ~30% of desperate: CRIME — low-edu, young, no partner
            if (agent.education === 'low' || (agent.age < 35 && !agent.partnerId)) {
              agent.state = 'criminal'
              agent.income = 0
              agent.ticksAsCriminal = 0
              agent.currentAction = 'stealing'
              agent.lifeEvents.push({
                tick: this.tick, type: 'became_criminal',
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
                tick: this.tick, type: 'depression',
                description: `Fell into depression after ${agent.ticksUnemployed} ticks of unemployment`,
              })
            }
          } else if (roll < 0.06 + desperation * 0.2) {
            // ~15% of desperate: SUICIDE — extreme despair, no partner, no wealth
            if (agent.satisfaction < 0.10 && agent.wealth < -50 && !agent.partnerId) {
              this.killAgent(agent, `Suicide after prolonged unemployment (${agent.ticksUnemployed} ticks)`)
              this.tickPrematureDeaths++
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
        if (this.rng() < 0.005 * (1 + agent.ticksAsCriminal * 0.1)) {
          this.killAgent(agent, 'Died from criminal lifestyle (violence)')
          continue
        }
      }

      // --- PREMATURE DEATH: caused by prolonged sickness + poverty + age ---
      if (this.params.diseasesEnabled && agent.isSick && agent.ticksSick >= SimulationEngine.DEATH_SICK_TICKS) {
        const ageFactor = agent.age > 50 ? 0.03 : 0.005
        const wealthFactor = agent.wealth < 0 ? 0.04 : 0.01
        if (this.rng() < ageFactor + wealthFactor) {
          this.killAgent(agent, `Premature death (sick ${agent.ticksSick} ticks, poverty)`)
          continue
        }
      }

      // --- DIVORCE (internal): caused by sustained low satisfaction ---
      // Only married agents can divorce
      if (agent.state !== 'criminal' && agent.partnerId) {
        if (agent.ticksLowSatisfaction >= SimulationEngine.DIVORCE_LOW_SAT_TICKS && agent.age > 22) {
          if (this.rng() < 0.02) {
            this.tickDivorces++
            // Break partner link
            const partner = this.agents.find((a) => a.id === agent.partnerId)
            if (partner) {
              partner.partnerId = null
              partner.satisfaction = clamp(partner.satisfaction - 0.15, 0, 1)
              partner.lifeEvents.push({
                tick: this.tick, type: 'divorced',
                description: 'Divorced (partner\'s low satisfaction)',
              })
              // Partner gets a new home (loses ownership — stays with primary agent)
              const homes = this.locations.filter((l) => l.type === 'home')
              if (homes.length > 0) {
                const newHome = homes.find((h) => (h.residentsCount ?? 0) < (h.maxResidents ?? 1))
                  ?? homes[Math.floor(this.rng() * homes.length)]
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
              tick: this.tick, type: 'divorced',
              description: `Divorced after ${SimulationEngine.DIVORCE_LOW_SAT_TICKS}+ ticks of low satisfaction`,
            })

            // --- Divorce suicide risk: 1/10 chance for each ex-partner ---
            // Real-world: divorced individuals have significantly higher suicide rates
            if (this.rng() < 0.10) {
              agent.lifeEvents.push({
                tick: this.tick, type: 'divorce_suicide',
                description: 'Committed suicide following divorce',
              })
              this.killAgent(agent, 'Suicide following divorce')
              this.tickPrematureDeaths++
              continue
            }
            if (partner && partner.state !== 'dead' && this.rng() < 0.10) {
              partner.lifeEvents.push({
                tick: this.tick, type: 'divorce_suicide',
                description: 'Committed suicide following divorce',
              })
              this.killAgent(partner, 'Suicide following divorce')
              this.tickPrematureDeaths++
            }
          }
        }
      }

      // --- MARRIAGE: now requires proximity encounter (see processProximityInteractions) ---
      // No longer triggered by internal state alone
    }
  }

  // ============================================================
  // Proximity-based interactions — social events require spatial encounter
  // Agents within INTERACTION_RADIUS can interact. This replaces all
  // "random target" mechanics with physically grounded encounters.
  // ============================================================
  private processProximityInteractions(): void {
    const living = this.agents.filter((a) => a.state !== 'dead')
    const N = living.length
    if (N < 2) return

    // Build interaction pairs: check all pairs within INTERACTION_RADIUS
    // O(N²) is fine for 200–500 agents (~50k checks, very fast)
    for (let i = 0; i < N; i++) {
      const a = living[i]
      for (let j = i + 1; j < N; j++) {
        const b = living[j]
        const dist = vec2Distance(a.position, b.position)
        if (dist > INTERACTION_RADIUS) continue

        // --- CRIME: criminal near non-criminal → robbery ---
        if (a.state === 'criminal' && b.state !== 'criminal' && dist < CRIME_PROXIMITY_RADIUS) {
          this.attemptRobbery(a, b)
        } else if (b.state === 'criminal' && a.state !== 'criminal' && dist < CRIME_PROXIMITY_RADIUS) {
          this.attemptRobbery(b, a)
        }

        // --- DISEASE CONTAGION: sick agent near healthy → transmission risk ---
        if (this.params.diseasesEnabled) {
          if (a.isSick && !b.isSick && b.state !== 'dead') {
            if (this.rng() < 0.04) { // 4% per-encounter transmission
              b.isSick = true
              b.ticksSick = 0
              b.satisfaction = clamp(b.satisfaction - 0.1, 0, 1)
              b.lifeEvents.push({ tick: this.tick, type: 'disease', description: 'Caught illness from nearby agent' })
              this.tickDiseases++
            }
          } else if (b.isSick && !a.isSick && a.state !== 'dead') {
            if (this.rng() < 0.04) {
              a.isSick = true
              a.ticksSick = 0
              a.satisfaction = clamp(a.satisfaction - 0.1, 0, 1)
              a.lifeEvents.push({ tick: this.tick, type: 'disease', description: 'Caught illness from nearby agent' })
              this.tickDiseases++
            }
          }
        }

        // --- CRIMINAL INFLUENCE: unemployed near criminal → faster radicalization ---
        if (a.state === 'unemployed' && b.state === 'criminal') {
          // Being near a criminal lowers satisfaction and accelerates desperation
          a.satisfaction = clamp(a.satisfaction - 0.02, 0, 1)
          a.ticksLowSatisfaction += 1 // counts double
        } else if (b.state === 'unemployed' && a.state === 'criminal') {
          b.satisfaction = clamp(b.satisfaction - 0.02, 0, 1)
          b.ticksLowSatisfaction += 1
        }

        // --- WORD OF MOUTH: employed agent near unemployed → job tip ---
        // Snap the unemployed agent directly to the workplace (same as sendToNearest pattern)
        if (a.state === 'employed' && b.state === 'unemployed' && this.rng() < 0.15) {
          const wp = this.locations.find((l) => l.id === a.workplaceId)
          if (wp && wp.filledSlots < wp.jobSlots) {
            b.position = { x: wp.position.x + (this.rng() - 0.5) * 2, y: wp.position.y + (this.rng() - 0.5) * 2 }
            b.target = null
            b.targetLocationId = wp.id
            b.stayTicksRemaining = 1 // brief visit for interview
            b.currentAction = 'job_seeking'
            b.lifeEvents.push({ tick: this.tick, type: 'hired', description: 'Got a job tip from a fellow citizen' })
          }
        } else if (b.state === 'employed' && a.state === 'unemployed' && this.rng() < 0.15) {
          const wp = this.locations.find((l) => l.id === b.workplaceId)
          if (wp && wp.filledSlots < wp.jobSlots) {
            a.position = { x: wp.position.x + (this.rng() - 0.5) * 2, y: wp.position.y + (this.rng() - 0.5) * 2 }
            a.target = null
            a.targetLocationId = wp.id
            a.stayTicksRemaining = 1
            a.currentAction = 'job_seeking'
            a.lifeEvents.push({ tick: this.tick, type: 'hired', description: 'Got a job tip from a fellow citizen' })
          }
        }

        // --- MARRIAGE: male + female, both single, both eligible, meet → potential marriage ---
        // Demographic filters: educated women less likely to couple, poor men less likely to find partner
        if (this.canMarry(a) && this.canMarry(b) && a.gender !== b.gender) {
          const female = a.gender === 'female' ? a : b
          const male = a.gender === 'male' ? a : b

          // Female education penalty: high-edu women are more independent → less likely to couple
          // low=0%, medium=15%, high=35% reduction
          const femEduScore = female.education === 'high' ? 0.35 : female.education === 'medium' ? 0.15 : 0
          const femEduFactor = 1 - femEduScore

          // Male wealth penalty: poor men struggle to attract partners
          // Below $50 wealth → up to 50% reduction; above $200 → no penalty
          const maleWealthFactor = Math.min(1, Math.max(0.5, male.wealth / 200))

          const marriageChance = 0.08 * femEduFactor * maleWealthFactor
          if (this.rng() < marriageChance) {
            this.tickMarriages++
            a.partnerId = b.id
            b.partnerId = a.id
            // Second partner moves to first's home (shares housing status)
            b.homeId = a.homeId
            b.homeOwned = a.homeOwned
            b.homeDebt = 0          // partner doesn't take on existing mortgage
            b.homeDebtPayment = 0
            b.homeValue = a.homeValue
            a.satisfaction = clamp(a.satisfaction + 0.15, 0, 1)
            b.satisfaction = clamp(b.satisfaction + 0.15, 0, 1)
            a.lifeEvents.push({ tick: this.tick, type: 'married', description: `Married ${b.gender === 'male' ? '👨' : '👩'} partner` })
            b.lifeEvents.push({ tick: this.tick, type: 'married', description: `Married ${a.gender === 'male' ? '👨' : '👩'} partner` })
          }
        }
      }
    }

    // --- REHABILITATION: criminal near government/school → chance of rehab ---
    for (const agent of living) {
      if (agent.state !== 'criminal') continue
      if (agent.ticksAsCriminal < SimulationEngine.REHAB_TICKS) continue

      for (const loc of this.locations) {
        if (loc.type !== 'government' && loc.type !== 'school') continue
        if (vec2Distance(agent.position, loc.position) > loc.radius + 3) continue

        // Near a rehabilitation location — chance to reform
        if (agent.wealth > 30 && this.rng() < 0.12) {
          agent.state = 'unemployed'
          agent.ticksUnemployed = 0
          agent.ticksAsCriminal = 0
          agent.currentAction = 'idle'
          agent.lifeEvents.push({
            tick: this.tick, type: 'rehabilitated',
            description: `Rehabilitated near ${loc.type} — re-entering society`,
          })
        }
        break // only check closest qualifying location
      }
    }

    // --- HEALTHCARE: sick agent at government → can recover if wealthy ---
    for (const agent of living) {
      if (!agent.isSick || agent.ticksSick < 4) continue

      for (const loc of this.locations) {
        if (loc.type !== 'government') continue
        if (vec2Distance(agent.position, loc.position) > loc.radius + 2) continue

        // At a government healthcare facility — can recover if can afford it
        if (agent.wealth > 80 && this.rng() < 0.18) {
          agent.isSick = false
          agent.ticksSick = 0
          agent.wealth -= 40 // healthcare cost
          agent.lifeEvents.push({ tick: this.tick, type: 'disease', description: 'Recovered from illness (healthcare)' })
        }
        break
      }
    }
  }

  // --- Helper: attempt robbery (criminal → victim, must be in proximity) ---
  private attemptRobbery(criminal: Agent, victim: Agent): void {
    if (this.rng() > 0.5) return // not every encounter is a robbery

    this.tickCrimes++
    const stolen = Math.min(victim.wealth * 0.08, 80)
    if (stolen > 0) {
      victim.wealth -= stolen
      criminal.wealth += stolen * 0.5 // some lost in process
      criminal.lifeEvents.push({
        tick: this.tick, type: 'crime_perpetrator',
        description: `Stole $${Math.round(stolen)} from a nearby agent`,
      })
      victim.lifeEvents.push({
        tick: this.tick, type: 'crime_victim',
        description: `Robbed by criminal (-$${Math.round(stolen)})`,
      })
      victim.satisfaction = clamp(victim.satisfaction - 0.1, 0, 1)
    }
  }

  // --- Helper: can this agent get married? ---
  private canMarry(agent: Agent): boolean {
    return (agent.state === 'employed' || agent.state === 'business_owner')
      && agent.partnerId === null
      && agent.satisfaction >= SimulationEngine.MARRIAGE_SAT_THRESHOLD
      && agent.age >= 20
      && agent.ticksLowSatisfaction === 0
  }

  // ============================================================
  // Government — tax, fund pensions, infrastructure, UBI
  // Budget: taxPool → pensions → infrastructure → remaining as UBI
  // ============================================================
  private processGovernment(): void {
    if (this.params.redistributionLevel <= 0) return

    const living = this.agents.filter((a) => a.state !== 'dead')
    const taxRate = this.params.redistributionLevel * 0.3 // max 30% tax
    let taxPool = 0

    // --- Collect taxes from agents who actually earned this tick ---
    for (const agent of living) {
      if (agent.tickEarnings > 0) {
        const tax = agent.tickEarnings * taxRate
        agent.wealth -= tax
        taxPool += tax
      }
    }
    this.tickTaxRevenue += taxPool

    // --- 1. Fund pensions (retired agents get pension from tax pool) ---
    const retirees = living.filter((a) => a.state === 'retired')
    const pensionPerRetiree = 12 // base pension per tick
    const totalPensionCost = retirees.length * pensionPerRetiree
    const pensionFunded = Math.min(totalPensionCost, taxPool * 0.5) // max 50% of tax for pensions
    const actualPension = retirees.length > 0 ? pensionFunded / retirees.length : 0
    for (const retiree of retirees) {
      retiree.wealth += actualPension
    }
    this.tickRedistribution += pensionFunded
    taxPool -= pensionFunded

    // --- 2. Infrastructure maintenance (scales with location count) ---
    const infraCost = this.locations.length * 0.5 // $0.50 per location per tick
    taxPool -= Math.min(infraCost, taxPool * 0.2)  // max 20% of remaining for infra

    // --- 3. Unemployment benefits (from tax pool) ---
    const unemployed = living.filter((a) => a.state === 'unemployed')
    const benefitPerUnemployed = 5
    const totalBenefitCost = unemployed.length * benefitPerUnemployed
    const benefitFunded = Math.min(totalBenefitCost, taxPool * 0.3) // max 30% of remaining
    const actualBenefit = unemployed.length > 0 ? benefitFunded / unemployed.length : 0
    for (const u of unemployed) {
      u.wealth += actualBenefit
    }
    this.tickRedistribution += benefitFunded
    taxPool -= benefitFunded

    // --- 4. Remaining surplus → UBI (only if enableUBI is on) ---
    if (taxPool > 0 && this.params.enableUBI) {
      const ubi = taxPool / living.length
      for (const agent of living) {
        agent.wealth += ubi
      }
      this.tickRedistribution += taxPool
    }
  }

  // ============================================================
  // Update history & trails
  // ============================================================
  private updateHistory(): void {
    for (const agent of this.agents) {
      // Trail — skip when agent is stationary (snap-to-location, saves memory)
      if (agent.stayTicksRemaining <= 0 && agent.state !== 'dead') {
        agent.trail.push({ ...agent.position })
        if (agent.trail.length > TRAIL_LENGTH) {
          agent.trail.shift()
        }
      }

      // Wealth history
      agent.wealthHistory.push(agent.wealth)
      if (agent.wealthHistory.length > MAX_WEALTH_HISTORY) {
        agent.wealthHistory.shift()
      }
    }
  }

  // ============================================================
  // Compute metrics
  // ============================================================
  computeMetrics(): SimMetrics {
    // Exclude dead agents from economic metrics
    const living = this.agents.filter((a) => a.state !== 'dead')
    const agents = living
    const N = agents.length
    // Clamp wealth to 0 for Gini (negative values break the formula)
    const wealths = agents.map((a) => Math.max(0, a.wealth))
    const rawWealths = agents.map((a) => a.wealth)
    const incomes = agents.map((a) => a.income)
    const satisfactions = agents.map((a) => a.satisfaction)

    const employed = agents.filter((a) => a.state === 'employed').length
    const unemployed = agents.filter((a) => a.state === 'unemployed').length
    const owners = agents.filter((a) => a.state === 'business_owner').length
    const retired = agents.filter((a) => a.state === 'retired').length
    const children = agents.filter((a) => a.state === 'child').length
    const criminals = agents.filter((a) => a.state === 'criminal').length

    const workplaces = this.locations.filter((l) => l.type === 'workplace')
    const totalJobs = workplaces.reduce((s, w) => s + w.jobSlots, 0)
    const filledJobs = workplaces.reduce((s, w) => s + w.filledSlots, 0)
    // Use cumulative counters (survive workplace removal)
    const automatedJobs = this.cumulativeAutomatedJobs
    const aiDisplacedJobs = this.cumulativeAiDisplacedJobs
    const totalSlots = totalJobs + automatedJobs + aiDisplacedJobs

    // Wealth distribution (use raw wealth for distribution stats)
    const sortedWealth = [...rawWealths].sort((a, b) => a - b)
    const totalWealth = sortedWealth.reduce((a, b) => a + b, 0)
    const top10Threshold = Math.floor(N * 0.9)
    const top10Wealth = sortedWealth.slice(top10Threshold).reduce((a, b) => a + b, 0)
    const bottom50Threshold = Math.floor(N * 0.5)
    const bottom50Wealth = sortedWealth.slice(0, bottom50Threshold).reduce((a, b) => a + b, 0)

    // Average education level (low=0.2, med=0.5, high=0.9)
    const eduMap = { low: 0.2, medium: 0.5, high: 0.9 } as Record<string, number>
    const avgEdu = agents.reduce((s, a) => s + (eduMap[a.education] ?? 0.5), 0) / N

    // Effective tax rate
    const taxRate = this.params.redistributionLevel * 0.3

    // Societal rates (annualized: per 1000 pop per year)
    const tpy = this.params.ticksPerYear

    return {
      tick: this.tick,
      year: Math.floor(this.tick / this.params.ticksPerYear),
      totalPopulation: N,
      employedCount: employed,
      unemployedCount: unemployed,
      businessOwnerCount: owners,
      retiredCount: retired,
      childCount: children,
      criminalCount: criminals,
      giniCoefficient: computeGiniFast(wealths),
      medianWealth: median(rawWealths),
      meanWealth: totalWealth / N,
      top10WealthShare: totalWealth > 0 ? top10Wealth / totalWealth : 0,
      bottom50WealthShare: totalWealth > 0 ? bottom50Wealth / totalWealth : 0,
      medianIncome: median(incomes),
      totalJobs,
      filledJobs,
      automatedJobs,
      aiDisplacedJobs,
      automationRate: totalSlots > 0 ? automatedJobs / totalSlots : 0,
      aiDisplacementRate: totalSlots > 0 ? aiDisplacedJobs / totalSlots : 0,
      totalDisplacementRate: totalSlots > 0 ? (automatedJobs + aiDisplacedJobs) / totalSlots : 0,
      roboticFiredWorkers: this.cumulativeRoboticFired,
      aiFiredWorkers: this.cumulativeAiFired,
      classTransitions: 0, // TODO: track state changes per tick if needed
      meanSatisfaction: satisfactions.reduce((a, b) => a + b, 0) / N,
      taxRevenue: this.tickTaxRevenue,
      redistributionPaid: this.tickRedistribution,
      // Societal phenomena
      births: this.tickBirths,
      deaths: this.tickDeaths,
      divorces: this.tickDivorces,
      marriages: this.tickMarriages,
      prematureDeaths: this.tickPrematureDeaths,
      diseases: this.tickDiseases,
      crimes: this.tickCrimes,
      layoffs: this.tickLayoffs,
      fertilityRate: N > 0 ? (this.tickBirths / N) * 1000 * tpy : 0,
      crimeRate: N > 0 ? (this.tickCrimes / N) * 1000 * tpy : 0,
      diseaseRate: N > 0 ? (this.tickDiseases / N) * 1000 * tpy : 0,
      effectiveTaxRate: taxRate,
      avgEducationLevel: avgEdu,
      // Housing
      homeOwnerCount: agents.filter(a => a.homeOwned && a.homeDebt <= 0).length,
      mortgageCount: agents.filter(a => a.homeDebt > 0).length,
      renterCount: agents.filter(a => !a.homeOwned && a.homeDebt <= 0).length,
      wealthDistribution: sortedWealth,
    }
  }

  // ============================================================
  // Get full world state snapshot
  // ============================================================
  getWorldState(): WorldState {
    return {
      tick: this.tick,
      agents: this.agents,
      locations: this.locations,
      metrics: this.metrics,
      params: this.params,
      moneyEvents: this.moneyEvents,
    }
  }

  // --- Empty metrics ---
  private emptyMetrics(): SimMetrics {
    return {
      tick: 0, year: 0,
      totalPopulation: 0,
      employedCount: 0, unemployedCount: 0, businessOwnerCount: 0, retiredCount: 0, childCount: 0, criminalCount: 0,
      giniCoefficient: 0, medianWealth: 0, meanWealth: 0,
      top10WealthShare: 0, bottom50WealthShare: 0,
      medianIncome: 0,
      totalJobs: 0, filledJobs: 0, automatedJobs: 0, aiDisplacedJobs: 0,
      automationRate: 0, aiDisplacementRate: 0, totalDisplacementRate: 0,
      roboticFiredWorkers: 0, aiFiredWorkers: 0,
      classTransitions: 0, meanSatisfaction: 0,
      taxRevenue: 0, redistributionPaid: 0,
      births: 0, deaths: 0, divorces: 0, marriages: 0,
      prematureDeaths: 0, diseases: 0, crimes: 0, layoffs: 0,
      fertilityRate: 0, crimeRate: 0, diseaseRate: 0,
      effectiveTaxRate: 0, avgEducationLevel: 0.5,
      homeOwnerCount: 0, mortgageCount: 0, renterCount: 0,
      wealthDistribution: [],
    }
  }

  // --- Update params live ---
  updateParams(newParams: Partial<SimulationParams>): void {
    Object.assign(this.params, newParams)
    // When diseases are toggled off, cure all currently sick agents immediately
    if (newParams.diseasesEnabled === false) {
      for (const agent of this.agents) {
        if (agent.isSick) {
          agent.isSick = false
          agent.ticksSick = 0
        }
      }
    }
  }

  // --- Reset with new params ---
  reset(params?: SimulationParams, seed?: number): void {
    if (params) this.params = { ...params }
    if (seed !== undefined) {
      this.seed = seed
      this.rng = createRNG(seed + 9999)
    }
    this.init()
  }
}
