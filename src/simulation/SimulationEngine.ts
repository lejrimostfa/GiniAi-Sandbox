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
import type { SimulationContext } from './SimulationContext'
import { processGovernment } from './systems/GovernmentSystem'
import { processLoans as loanProcessLoans } from './systems/LoanSystem'
import { processEconomy as econProcessEconomy } from './systems/EconomySystem'
import { processHousing as housingProcessHousing } from './systems/HousingSystem'
import { processFamily as familyProcessFamily } from './systems/FamilySystem'
import { processCausalPhenomena as causalProcess } from './systems/CausalPhenomenaSystem'
import { processProximityInteractions as proximityProcess } from './systems/ProximitySystem'
import { runAutomation as autoRunAutomation, processLayoffs as autoProcessLayoffs, processJobMarket as autoProcessJobMarket } from './systems/AutomationSystem'

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
  private tickArrests = 0
  private tickStrikers = 0

  // --- Government treasury (persistent across ticks) ---
  private governmentTreasury = 0
  // Per-tick expense breakdown (reset each tick)
  private tickGovExpPensions = 0
  private tickGovExpInfra = 0
  private tickGovExpBenefits = 0
  private tickGovExpPolice = 0
  private tickGovExpUBI = 0

  // --- Rolling window buffers for smooth rate computation ---
  private readonly RATE_WINDOW = 12 // 12-tick (~3 month) rolling window
  private recentBirths: number[] = []
  private recentCrimes: number[] = []
  private recentDiseases: number[] = []

  private rollingAvg(buf: number[]): number {
    if (buf.length === 0) return 0
    return buf.reduce((a, b) => a + b, 0) / buf.length
  }

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
    this.recentBirths = []
    this.recentCrimes = []
    this.recentDiseases = []
    this.governmentTreasury = 0

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

  // --- Build context object for extracted systems ---
  // Systems receive this context instead of accessing engine internals directly
  private buildContext(): SimulationContext {
    return {
      agents: this.agents,
      locations: this.locations,
      params: this.params,
      tick: this.tick,
      rng: this.rng,
      tickBirths: this.tickBirths,
      tickDeaths: this.tickDeaths,
      tickDivorces: this.tickDivorces,
      tickMarriages: this.tickMarriages,
      tickPrematureDeaths: this.tickPrematureDeaths,
      tickDiseases: this.tickDiseases,
      tickCrimes: this.tickCrimes,
      tickLayoffs: this.tickLayoffs,
      tickTaxRevenue: this.tickTaxRevenue,
      tickRedistribution: this.tickRedistribution,
      tickArrests: this.tickArrests,
      tickStrikers: this.tickStrikers,
      governmentTreasury: this.governmentTreasury,
      tickGovExpPensions: this.tickGovExpPensions,
      tickGovExpInfra: this.tickGovExpInfra,
      tickGovExpBenefits: this.tickGovExpBenefits,
      tickGovExpPolice: this.tickGovExpPolice,
      tickGovExpUBI: this.tickGovExpUBI,
      cumulativeAutomatedJobs: this.cumulativeAutomatedJobs,
      cumulativeAiDisplacedJobs: this.cumulativeAiDisplacedJobs,
      cumulativeRoboticFired: this.cumulativeRoboticFired,
      cumulativeAiFired: this.cumulativeAiFired,
      recentBirths: this.recentBirths,
      recentCrimes: this.recentCrimes,
      recentDiseases: this.recentDiseases,
      moneyEvents: this.moneyEvents,
      emit: (type: string, data: unknown) => this.emit(type, data),
      getRetirementAge: () => this.getRetirementAge(),
      getMaxAge: () => this.getMaxAge(),
      consumptionInterval: this.consumptionInterval,
      currentWeekOfYear: () => this.currentWeekOfYear(),
      isAnnualQuarter: (f: number) => this.isAnnualQuarter(f),
      sendToNearest: (agent: Agent, locType: string) => this.sendToNearest(agent, locType as any),
      sendToHiringWorkplace: (agent: Agent) => this.sendToHiringWorkplace(agent),
      killAgent: (agent: Agent, reason: string) => this.killAgent(agent, reason),
      fireAgent: (agent: Agent, reason: 'fired' | 'automated' | 'ai_displaced' | 'economic_layoff') => this.fireAgent(agent, reason),
      bankruptBusiness: (owner: Agent) => this.bankruptBusiness(owner),
      createBusiness: (agent: Agent) => this.createBusiness(agent),
      expandHousingIfNeeded: () => this.expandHousingIfNeeded(),
      reassignHomelessAgents: () => this.reassignHomelessAgents(),
      totalDisplacementRate: this.metrics.totalDisplacementRate,
      getVacancyRate: () => this.getVacancyRate(),
    }
  }

  // --- Sync context counters back to engine after system runs ---
  private syncFromContext(ctx: SimulationContext): void {
    this.tickTaxRevenue = ctx.tickTaxRevenue
    this.tickRedistribution = ctx.tickRedistribution
    this.tickArrests = ctx.tickArrests
    this.tickStrikers = ctx.tickStrikers
    this.governmentTreasury = ctx.governmentTreasury
    this.tickGovExpPensions = ctx.tickGovExpPensions
    this.tickGovExpInfra = ctx.tickGovExpInfra
    this.tickGovExpBenefits = ctx.tickGovExpBenefits
    this.tickGovExpPolice = ctx.tickGovExpPolice
    this.tickGovExpUBI = ctx.tickGovExpUBI
    this.moneyEvents = ctx.moneyEvents
    // Sync cumulative automation counters (incremented by runAutomation)
    this.cumulativeAutomatedJobs = ctx.cumulativeAutomatedJobs
    this.cumulativeAiDisplacedJobs = ctx.cumulativeAiDisplacedJobs
    this.cumulativeRoboticFired = ctx.cumulativeRoboticFired
    this.cumulativeAiFired = ctx.cumulativeAiFired
    // Sync per-tick event counters (incremented by family, causal, proximity systems)
    this.tickBirths = ctx.tickBirths
    this.tickDeaths = ctx.tickDeaths
    this.tickDivorces = ctx.tickDivorces
    this.tickMarriages = ctx.tickMarriages
    this.tickPrematureDeaths = ctx.tickPrematureDeaths
    this.tickDiseases = ctx.tickDiseases
    this.tickCrimes = ctx.tickCrimes
    this.tickLayoffs = ctx.tickLayoffs
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
    this.tickArrests = 0
    this.tickStrikers = 0
    this.tickGovExpPensions = 0
    this.tickGovExpInfra = 0
    this.tickGovExpBenefits = 0
    this.tickGovExpPolice = 0
    this.tickGovExpUBI = 0

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

    // Build a single shared context for all systems this tick.
    // All systems mutate the same context object, so counter increments accumulate correctly.
    const ctx = this.buildContext()

    // 2. Automation runs every tick (probabilities are per-tick scaled)
    autoRunAutomation(ctx)

    // Annual processes (once per year)
    if (this.tick % this.params.ticksPerYear === 0) {
      housingProcessHousing(ctx)
    }

    // 2b. Economic layoffs (runs every tick — owners fire workers to cut costs)
    autoProcessLayoffs(ctx)

    // 2c. Job market self-regulation (shrink excess capacity when vacancy > 10%)
    autoProcessJobMarket(ctx)

    // 2d. Family (runs every tick with per-tick probability for smooth birth curve)
    familyProcessFamily(ctx)

    // 3. Causal societal phenomena (crime, disease, death, marriage, divorce)
    causalProcess(ctx)

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
    proximityProcess(ctx)

    // 8–9. Extracted systems: Economy → Loans → Government
    econProcessEconomy(ctx)
    loanProcessLoans(ctx)
    processGovernment(ctx)

    // Sync all counters back to engine from the shared context
    this.syncFromContext(ctx)

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

  // Job market → extracted to systems/AutomationSystem.ts (processJobMarket)

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
          // Large family overcrowding penalty: each sibling above 2 increases mortality
          const siblings = this.agents.filter(a =>
            a.state === 'child' && a.homeId === agent.homeId && a.id !== agent.id
          ).length
          const overcrowdingPenalty = siblings > 2 ? (siblings - 2) * 0.01 : 0
          const deathChance = baseRisk * povertyIntensity + orphanBonus + overcrowdingPenalty

          if (this.rng() < deathChance) {
            // --- Parent grief: losing a child is devastating ---
            for (const parent of parents) {
              parent.satisfaction = clamp(parent.satisfaction - 0.35, 0, 1) // massive grief
              parent.ticksLowSatisfaction += 8 // accelerate despair (feeds into divorce/suicide)
              parent.lifeEvents.push({
                tick: this.tick,
                type: 'premature_death',
                description: `Lost child ${agent.id} (age ${agent.age}) — devastating grief`,
              })
            }
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

        // --- Large poor family strain: each child drains parent satisfaction ---
        if (parents.length > 0 && parentWealth < 80) {
          const siblingCount = this.agents.filter(a =>
            a.state === 'child' && a.homeId === agent.homeId
          ).length
          if (siblingCount > 2) {
            const strainPerChild = 0.008 * (siblingCount - 2) // +0.8% drain per extra child
            for (const parent of parents) {
              parent.satisfaction = clamp(parent.satisfaction - strainPerChild, 0, 1)
            }
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

    // --- Immigration: add agents if below target population (controlled by immigrationRate param) ---
    // immigrationRate=0 → no immigration, population shrinks naturally
    // immigrationRate=1 → up to 2 immigrants/tick (full replacement)
    if (this.params.immigrationRate <= 0) return
    const deficit = this.params.populationSize - this.agents.length
    if (deficit <= 0) return
    const maxPerTick = Math.max(1, Math.round(2 * this.params.immigrationRate))
    const toAdd = Math.min(deficit, maxPerTick)

    for (let i = 0; i < toAdd; i++) {
      // At low immigration rates, each immigrant has a chance of being skipped
      if (this.rng() > this.params.immigrationRate) continue
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
        wealthArchive: [0],
        stateHistory: [{ tick: this.tick, from: 'unemployed' as const, to: 'unemployed' as const }],
      }
      this.agents.push(newAgent)
      this.tickBirths++
    }
  }

  // ============================================================
  // Automation + Layoffs → extracted to systems/AutomationSystem.ts
  // Called via autoRunAutomation(ctx), autoProcessLayoffs(ctx), autoProcessJobMarket(ctx) in step()
  // ============================================================

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
    if (this.isAnnualQuarter(ANNUAL_Q1) && (agent.state === 'employed' || agent.state === 'business_owner' || agent.state === 'police')) {
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

    // --- Police: patrol areas to find criminals ---
    if (agent.state === 'police') {
      agent.currentAction = 'patrolling'
      // Patrol: wander near markets, workplaces, and homes where crime happens
      const roll = this.rng()
      if (roll < 0.35) {
        this.sendToNearest(agent, 'market')
      } else if (roll < 0.60) {
        const workplaces = this.locations.filter((l) => l.type === 'workplace')
        if (workplaces.length > 0) {
          const wp = workplaces[Math.floor(this.rng() * workplaces.length)]
          agent.target = vec2(
            wp.position.x + (this.rng() - 0.5) * 8,
            wp.position.y + (this.rng() - 0.5) * 8,
          )
        }
      } else if (roll < 0.80) {
        // Patrol residential areas
        const homes = this.locations.filter((l) => l.type === 'home')
        if (homes.length > 0) {
          const h = homes[Math.floor(this.rng() * homes.length)]
          agent.target = vec2(h.position.x, h.position.y)
        }
      } else {
        // Return to station briefly
        this.sendToNearest(agent, 'police_station')
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
  // Economy system → extracted to systems/EconomySystem.ts
  // Called via econProcessEconomy(ctx) in step()
  // ============================================================

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
  // Housing system → extracted to systems/HousingSystem.ts
  // Called via housingProcessHousing(ctx) in step() annual block
  // ============================================================

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
  // Family system → extracted to systems/FamilySystem.ts
  // Called via familyProcessFamily(ctx) in step()
  // ============================================================

  // ============================================================
  // Loan system → extracted to systems/LoanSystem.ts
  // Called via loanProcessLoans(ctx) in step()
  // ============================================================

  // ============================================================
  // Causal phenomena → extracted to systems/CausalPhenomenaSystem.ts
  // Called via causalProcess(ctx) in step()
  // ============================================================

  // ============================================================
  // Proximity system → extracted to systems/ProximitySystem.ts
  // Called via proximityProcess(ctx) in step()
  // ============================================================

  // ============================================================
  // Government system → extracted to systems/GovernmentSystem.ts
  // Called via processGovernment(ctx) in step()
  // ============================================================

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

      // Wealth history (capped sparkline)
      agent.wealthHistory.push(agent.wealth)
      if (agent.wealthHistory.length > MAX_WEALTH_HISTORY) {
        agent.wealthHistory.shift()
      }

      // Full wealth archive (uncapped, for export)
      agent.wealthArchive.push(agent.wealth)

      // State transition tracking (record every change)
      const lastState = agent.stateHistory.length > 0
        ? agent.stateHistory[agent.stateHistory.length - 1].to
        : agent.state
      if (agent.state !== lastState) {
        agent.stateHistory.push({ tick: this.tick, from: lastState, to: agent.state })
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
    // Use raw wealth for Gini (formula now supports negatives via absolute mean)
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

    // Push tick counts into rolling buffers and trim to window size
    this.recentBirths.push(this.tickBirths)
    this.recentCrimes.push(this.tickCrimes)
    this.recentDiseases.push(this.tickDiseases)
    if (this.recentBirths.length > this.RATE_WINDOW) this.recentBirths.shift()
    if (this.recentCrimes.length > this.RATE_WINDOW) this.recentCrimes.shift()
    if (this.recentDiseases.length > this.RATE_WINDOW) this.recentDiseases.shift()

    // Societal rates (annualized: per 1000 pop per year, smoothed over rolling window)
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
      policeCount: agents.filter((a) => a.state === 'police').length,
      giniCoefficient: computeGiniFast(rawWealths),
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
      gdp: (() => {
        // GDP = human production (wages) + automation production (robot/AI output)
        // Automated slots produce value equivalent to the workplace wage — output doesn't vanish
        // when humans are replaced, it just shifts from labor income to capital income.
        const humanOutput = agents.reduce((s, a) => s + a.tickEarnings, 0)
        const automationOutput = workplaces.reduce((s, wp) => {
          const autoSlots = (wp.automatedSlots ?? 0) + (wp.aiDisplacedSlots ?? 0)
          return s + autoSlots * (wp.wage ?? 30)
        }, 0)
        return humanOutput + automationOutput
      })(),
      gdpPerCapita: (() => {
        const humanOutput = agents.reduce((s, a) => s + a.tickEarnings, 0)
        const automationOutput = workplaces.reduce((s, wp) => {
          const autoSlots = (wp.automatedSlots ?? 0) + (wp.aiDisplacedSlots ?? 0)
          return s + autoSlots * (wp.wage ?? 30)
        }, 0)
        const totalOutput = humanOutput + automationOutput
        const pop = agents.filter(a => a.state !== 'child' && a.state !== 'dead').length
        return pop > 0 ? totalOutput / pop : 0
      })(),
      taxRevenue: this.tickTaxRevenue,
      redistributionPaid: this.tickRedistribution,
      governmentTreasury: this.governmentTreasury,
      govExpPensions: this.tickGovExpPensions,
      govExpInfra: this.tickGovExpInfra,
      govExpBenefits: this.tickGovExpBenefits,
      govExpPolice: this.tickGovExpPolice,
      govExpUBI: this.tickGovExpUBI,
      // Social unrest
      strikeRate: (() => {
        const workers = agents.filter(a => a.state === 'employed').length
        return workers > 0 ? this.tickStrikers / workers : 0
      })(),
      arrestsThisTick: this.tickArrests,
      // Societal phenomena
      births: this.tickBirths,
      deaths: this.tickDeaths,
      divorces: this.tickDivorces,
      marriages: this.tickMarriages,
      prematureDeaths: this.tickPrematureDeaths,
      diseases: this.tickDiseases,
      crimes: this.tickCrimes,
      layoffs: this.tickLayoffs,
      fertilityRate: N > 0 ? (this.rollingAvg(this.recentBirths) / N) * 1000 * tpy : 0,
      crimeRate: N > 0 ? (this.rollingAvg(this.recentCrimes) / N) * 1000 * tpy : 0,
      diseaseRate: N > 0 ? (this.rollingAvg(this.recentDiseases) / N) * 1000 * tpy : 0,
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
      policeCount: 0,
      giniCoefficient: 0, medianWealth: 0, meanWealth: 0,
      top10WealthShare: 0, bottom50WealthShare: 0,
      medianIncome: 0,
      totalJobs: 0, filledJobs: 0, automatedJobs: 0, aiDisplacedJobs: 0,
      automationRate: 0, aiDisplacementRate: 0, totalDisplacementRate: 0,
      roboticFiredWorkers: 0, aiFiredWorkers: 0,
      classTransitions: 0, meanSatisfaction: 0,
      gdp: 0, gdpPerCapita: 0,
      taxRevenue: 0, redistributionPaid: 0,
      governmentTreasury: 0, govExpPensions: 0, govExpInfra: 0, govExpBenefits: 0, govExpPolice: 0, govExpUBI: 0,
      strikeRate: 0, arrestsThisTick: 0,
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
