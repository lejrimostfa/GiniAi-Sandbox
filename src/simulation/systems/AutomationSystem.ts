// ============================================================
// AutomationSystem — robotic/AI job displacement, layoffs, job market regulation
// Users can modify automation mechanics by editing this file.
// runAutomation: called once per tick (robotic + AI displacement channels)
// processLayoffs: called once per tick (economic layoffs by business owners)
// processJobMarket: called once per tick (shrink excess capacity)
// ============================================================

import type { SimulationContext } from '../SimulationContext'
import { vec2, WORKPLACE_CONFIGS } from '../types'
import type { WorkplaceType, Location } from '../types'
import { uid } from '../utils'
import { AUTOMATION_WAGE_SAVINGS_RATE } from '../constants'

// ============================================================
// Automation — robotic and AI displacement of workers
// ============================================================
export function runAutomation(ctx: SimulationContext): void {
  const workplaces = ctx.locations.filter(
    (l) => l.type === 'workplace' && l.jobSlots > 0
  )
  const tpy = ctx.params.ticksPerYear

  for (const wp of workplaces) {
    const config = WORKPLACE_CONFIGS[wp.workplaceType!]
    const owner = wp.ownerId ? ctx.agents.find((a) => a.id === wp.ownerId) : null
    const emptySlots = wp.jobSlots - wp.filledSlots

    // --- Channel 1: Robotic/physical automation ---
    // A robot replaces multiple workers (2-4 at once) — much cheaper than human labor
    const roboticProb = (ctx.params.aiGrowthRate * config.automationRisk) / tpy
    if (ctx.rng() < roboticProb) {
      // How many slots does one robot replace? 2-4 depending on workplace type
      const bulkSize = config.automationRisk > 0.5 ? 3 + Math.floor(ctx.rng() * 2) : 2 + Math.floor(ctx.rng() * 2)
      const investPerSlot = (wp.wage ?? 30) * 10 // robot costs ~10 weeks of wage (vs 52 weeks/year human)

      if (owner && owner.state === 'business_owner') {
        owner.wealth -= investPerSlot * bulkSize
        owner.lifeEvents.push({
          tick: ctx.tick, type: 'automation_savings',
          description: `Invested $${Math.round(investPerSlot * bulkSize)} in robot replacing ${bulkSize} workers`,
        })
      }

      for (let i = 0; i < bulkSize && wp.jobSlots > 0; i++) {
        // Fire a filled worker or eliminate an empty slot
        if (wp.filledSlots > 0 && (emptySlots === 0 || ctx.rng() < 0.6)) {
          const worker = ctx.agents.find(
            (a) => a.workplaceId === wp.id && a.state === 'employed'
          )
          if (worker) {
            ctx.fireAgent(worker, 'automated')
            ctx.cumulativeRoboticFired++
          }
        } else if (wp.jobSlots > wp.filledSlots) {
          wp.jobSlots = Math.max(0, wp.jobSlots - 1)
          wp.automatedSlots++
        }
        ctx.cumulativeAutomatedJobs++
      }
    }

    // --- Channel 2: AI/LLM displacement ---
    // One AI tool replaces 2-5 cognitive workers (even more efficient than robots)
    const aiProb = (ctx.params.aiDiffusionRate * config.aiExposure) / tpy
    if (ctx.rng() < aiProb) {
      // AI is even more scalable: 2-5 workers replaced per adoption event
      const bulkSize = config.aiExposure > 0.5 ? 3 + Math.floor(ctx.rng() * 3) : 2 + Math.floor(ctx.rng() * 2)
      const investPerSlot = (wp.wage ?? 30) * 6 // AI costs ~6 weeks of wage

      if (owner && owner.state === 'business_owner') {
        owner.wealth -= investPerSlot * bulkSize
        owner.lifeEvents.push({
          tick: ctx.tick, type: 'automation_savings',
          description: `Invested $${Math.round(investPerSlot * bulkSize)} in AI replacing ${bulkSize} workers`,
        })
      }

      // Sort workers by vulnerability: higher education + higher age = more exposed
      const workers = ctx.agents.filter(
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
        if (workerIdx < workers.length && (emptyNow === 0 || ctx.rng() < 0.7)) {
          ctx.fireAgent(workers[workerIdx], 'ai_displaced')
          ctx.cumulativeAiFired++
          workerIdx++
        } else if (wp.jobSlots > wp.filledSlots) {
          wp.jobSlots = Math.max(0, wp.jobSlots - 1)
          wp.aiDisplacedSlots++
        }
        ctx.cumulativeAiDisplacedJobs++
      }
    }
  }

  // --- Automation wage savings: owners profit from reduced wage bills ---
  // Each automated/AI-displaced slot saves the owner one worker's wage per tick
  // This creates the rich→richer feedback loop that drives real-world inequality
  for (const wp of workplaces) {
    if (!wp.ownerId) continue
    const owner = ctx.agents.find((a) => a.id === wp.ownerId && a.state === 'business_owner')
    if (!owner) continue

    const totalAutomatedSlots = (wp.automatedSlots ?? 0) + (wp.aiDisplacedSlots ?? 0)
    if (totalAutomatedSlots <= 0) continue

    // Savings = fraction of wages that would have been paid to displaced workers
    const wageSavings = totalAutomatedSlots * (wp.wage ?? 30) * AUTOMATION_WAGE_SAVINGS_RATE
    owner.wealth += wageSavings
    owner.businessRevenue += wageSavings
  }

  // --- AI creates new high-skill jobs (fewer slots, higher wages) ---
  // New job creation is suppressed as displacement grows (automation destroys more than it creates)
  // At 0% displacement → full creation rate. At 50% → 25% rate. At 80%+ → nearly 0.
  const displacementDampener = Math.max(0.05, 1 - ctx.totalDisplacementRate * 2)
  const creationProb = ((ctx.params.aiGrowthRate + ctx.params.aiDiffusionRate) * 0.2 * displacementDampener) / tpy
  if (ctx.rng() < creationProb && ctx.getVacancyRate() < 0.08) {
    const existingWp = ctx.locations.filter((l) => l.type === 'workplace')
    if (existingWp.length > 0) {
      const base = existingWp[Math.floor(ctx.rng() * existingWp.length)]
      const newType: WorkplaceType = ctx.rng() > 0.5 ? 'skilled' : 'creative'
      const newWp: Location = {
        id: uid('wp'),
        type: 'workplace',
        position: vec2(
          base.position.x + (ctx.rng() - 0.5) * 10,
          base.position.y + (ctx.rng() - 0.5) * 10,
        ),
        radius: 2,
        workplaceType: newType,
        jobSlots: 2 + Math.floor(ctx.rng() * 3),
        filledSlots: 0,
        automatedSlots: 0,
        aiDisplacedSlots: 0,
        wage: WORKPLACE_CONFIGS[newType].baseWage * (1 + ctx.rng() * 0.3),
      }
      ctx.locations.push(newWp)
      ctx.emit('location:created', newWp)
    }
  }
}

// ============================================================
// Economic layoffs — business owners fire workers to cut costs
// Triggered when a business is unprofitable or owner's wealth is declining
// Runs every tick (small probability per struggling business)
// ============================================================
export function processLayoffs(ctx: SimulationContext): void {
  for (const wp of ctx.locations) {
    if (wp.type !== 'workplace' || !wp.ownerId || wp.filledSlots === 0) continue

    const owner = ctx.agents.find((a) => a.id === wp.ownerId)
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

    if (ctx.rng() < layoffProb) {
      // Fire the most expensive worker first (cost-cutting logic)
      const workers = ctx.agents.filter(
        (a) => a.workplaceId === wp.id && a.state === 'employed'
      )
      if (workers.length > 0) {
        workers.sort((a, b) => b.income - a.income) // most expensive first
        ctx.fireAgent(workers[0], 'economic_layoff')
      }
    }
  }
}

// ============================================================
// Job market self-regulation — shrink excess capacity when vacancy > 10%
// ============================================================
export function processJobMarket(ctx: SimulationContext): void {
  const vacancyRate = ctx.getVacancyRate()
  // Only apply attrition when there's meaningful oversupply
  if (vacancyRate <= 0.10) return

  // Attrition probability scales with how far above 10% we are
  // At 20% vacancy → ~5% chance per workplace per tick
  // At 30% vacancy → ~10% chance
  const excessRate = vacancyRate - 0.10
  const attritionProb = Math.min(0.15, excessRate * 0.5)

  for (const wp of ctx.locations) {
    if (wp.type !== 'workplace') continue
    const emptySlots = wp.jobSlots - wp.filledSlots
    if (emptySlots <= 0) continue // fully staffed, no attrition

    // Probability proportional to how empty the workplace is
    const emptyRatio = emptySlots / Math.max(1, wp.jobSlots)
    if (ctx.rng() < attritionProb * emptyRatio) {
      wp.jobSlots = Math.max(wp.filledSlots, wp.jobSlots - 1) // never drop below filled
    }
  }

  // Remove workplaces with 0 slots and no owner (market exit)
  for (let i = ctx.locations.length - 1; i >= 0; i--) {
    const wp = ctx.locations[i]
    if (wp.type === 'workplace' && wp.jobSlots === 0 && wp.filledSlots === 0 && !wp.ownerId) {
      ctx.locations.splice(i, 1)
      ctx.emit('location:removed', wp)
    }
  }
}
