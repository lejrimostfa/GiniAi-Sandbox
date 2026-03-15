// --- World Generator ---
// Procedurally creates locations (workplaces, markets, homes, school, government)
// and agents with initial wealth distribution based on SimulationParams

import type {
  Agent, Location, SimulationParams, Education, Vec2, Gender,
} from './types'
import {
  vec2, WORKPLACE_CONFIGS, ECONOMY_PRESETS, WORKPLACE_TYPES, EDUCATION_LEVELS,
} from './types'
import {
  createRNG, generateWealthDistribution, uid, resetUidCounter, type RNG,
} from './utils'
import { APARTMENT_RENT_RATIO, HOUSE_RENT_RATIO } from './constants'

// ============================================================
// World sizing — world radius scales with population
// ============================================================
function worldRadius(pop: number): number {
  return 30 + Math.sqrt(pop) * 4
}

// ============================================================
// Place locations in concentric rings around center
// ============================================================
function placeLocationsRing(
  center: Vec2,
  count: number,
  ringRadius: number,
  rng: RNG,
): Vec2[] {
  const positions: Vec2[] = []
  const angleStep = (Math.PI * 2) / count
  const startAngle = rng() * Math.PI * 2
  for (let i = 0; i < count; i++) {
    const angle = startAngle + angleStep * i + (rng() - 0.5) * 0.4
    const r = ringRadius + (rng() - 0.5) * ringRadius * 0.3
    positions.push(vec2(center.x + Math.cos(angle) * r, center.y + Math.sin(angle) * r))
  }
  return positions
}

// ============================================================
// Generate all locations for the world
// ============================================================
export function generateLocations(params: SimulationParams, seed: number): Location[] {
  const rng = createRNG(seed)
  const R = worldRadius(params.populationSize)
  const locations: Location[] = []
  const preset = ECONOMY_PRESETS[params.economyType]

  // --- Workplaces ---
  // Total job slots ≈ population × 0.85 (some unemployment expected)
  const totalSlots = Math.round(params.populationSize * 0.85)
  
  for (const wType of WORKPLACE_TYPES) {
    const fraction = preset.workplaceMix[wType]
    const slotsForType = Math.round(totalSlots * fraction)
    if (slotsForType === 0) continue

    const config = WORKPLACE_CONFIGS[wType]
    // Each workplace has 5–15 slots
    const avgSlots = 8
    const wpCount = Math.max(1, Math.round(slotsForType / avgSlots))
    const slotsPerWp = Math.round(slotsForType / wpCount)

    const positions = placeLocationsRing(vec2(0, 0), wpCount, R * 0.4 + rng() * R * 0.2, rng)
    
    for (let i = 0; i < wpCount; i++) {
      const slots = slotsPerWp + Math.round((rng() - 0.5) * 4)
      locations.push({
        id: uid('wp'),
        type: 'workplace',
        position: positions[i],
        radius: 2 + slots * 0.15,
        workplaceType: wType,
        jobSlots: Math.max(2, slots),
        filledSlots: 0,
        automatedSlots: 0,
        aiDisplacedSlots: 0,
        wage: config.baseWage * (0.8 + rng() * 0.4),
      })
    }
  }

  // --- Markets (2–4) ---
  const marketCount = Math.max(2, Math.round(params.populationSize / 80))
  const marketPositions = placeLocationsRing(vec2(0, 0), marketCount, R * 0.25, rng)
  for (let i = 0; i < marketCount; i++) {
    locations.push({
      id: uid('mkt'),
      type: 'market',
      position: marketPositions[i],
      radius: 3,
      jobSlots: 0, filledSlots: 0, automatedSlots: 0, aiDisplacedSlots: 0, wage: 0,
      goodsPrice: 10 + rng() * 5,
    })
  }

  // --- Home zones — apartments & houses ---
  // Each home location represents a building (apartment = 5 families, house = 1-2 families)
  // We need enough buildings so every agent has a homeId
  const apartmentCount = Math.max(4, Math.round(params.populationSize / 20)) // ~10 for 200 pop
  const houseCount = Math.max(4, Math.round(params.populationSize / 25))     // ~8 for 200 pop
  const homePositions = placeLocationsRing(vec2(0, 0), apartmentCount + houseCount, R * 0.7, rng)
  for (let i = 0; i < apartmentCount; i++) {
    const value = 500 + Math.round(rng() * 400) // apartment building value $500-$900 (costs more to build)
    locations.push({
      id: uid('home'),
      type: 'home',
      position: homePositions[i],
      radius: 4 + rng() * 2,
      jobSlots: 0, filledSlots: 0, automatedSlots: 0, aiDisplacedSlots: 0, wage: 0,
      housingType: 'apartment',
      housingValue: value,
      rent: Math.round(value * APARTMENT_RENT_RATIO), // cheaper per family, but 5 families → more total rent
      maxResidents: 5,                                // apartment building: 5 families
      residentsCount: 0,
    })
  }
  for (let i = 0; i < houseCount; i++) {
    const value = 250 + Math.round(rng() * 200) // house value $250-$450
    locations.push({
      id: uid('home'),
      type: 'home',
      position: homePositions[apartmentCount + i],
      radius: 2.5 + rng() * 1.5,
      jobSlots: 0, filledSlots: 0, automatedSlots: 0, aiDisplacedSlots: 0, wage: 0,
      housingType: 'house',
      housingValue: value,
      rent: Math.round(value * HOUSE_RENT_RATIO), // standard rent for houses
      maxResidents: 2,                             // small house: 1-2 families
      residentsCount: 0,
    })
  }

  // --- School (1) ---
  locations.push({
    id: uid('school'),
    type: 'school',
    position: vec2((rng() - 0.5) * R * 0.3, (rng() - 0.5) * R * 0.3),
    radius: 3,
    jobSlots: 0, filledSlots: 0, automatedSlots: 0, aiDisplacedSlots: 0, wage: 0,
    educationCost: 50,
  })

  // --- Government (1, center) ---
  locations.push({
    id: uid('gov'),
    type: 'government',
    position: vec2(0, 0),
    radius: 3.5,
    jobSlots: 0, filledSlots: 0, automatedSlots: 0, aiDisplacedSlots: 0, wage: 0,
  })

  // --- Prison (1, near government) ---
  locations.push({
    id: uid('prison'),
    type: 'prison',
    position: vec2(6, -5),
    radius: 2.5,
    jobSlots: 0, filledSlots: 0, automatedSlots: 0, aiDisplacedSlots: 0, wage: 0,
  })

  // --- Hospital (1, near government) ---
  locations.push({
    id: uid('hospital'),
    type: 'hospital',
    position: vec2(-6, -5),
    radius: 3.5,
    jobSlots: 0, filledSlots: 0, automatedSlots: 0, aiDisplacedSlots: 0, wage: 0,
  })

  // --- Amusement Park (1, on the outskirts) ---
  locations.push({
    id: uid('park'),
    type: 'amusement_park',
    position: vec2(R * 0.4, R * 0.3),
    radius: 4,
    jobSlots: 0, filledSlots: 0, automatedSlots: 0, aiDisplacedSlots: 0, wage: 0,
  })

  // --- Resource extraction zones (trees) ---
  const resourceCount = Math.max(2, Math.round(params.populationSize / 100))
  const resourcePositions = placeLocationsRing(vec2(0, 0), resourceCount, R * 0.55, rng)
  for (let i = 0; i < resourceCount; i++) {
    locations.push({
      id: uid('res'),
      type: 'resource',
      position: resourcePositions[i],
      radius: 4,
      jobSlots: 0, filledSlots: 0, automatedSlots: 0, aiDisplacedSlots: 0, wage: 0,
    })
  }

  // --- Factory (1-2, resource transformation) ---
  const factoryCount = Math.max(1, Math.round(params.populationSize / 150))
  const factoryPositions = placeLocationsRing(vec2(0, 0), factoryCount, R * 0.35, rng)
  for (let i = 0; i < factoryCount; i++) {
    locations.push({
      id: uid('fac'),
      type: 'factory',
      position: factoryPositions[i],
      radius: 3,
      jobSlots: 0, filledSlots: 0, automatedSlots: 0, aiDisplacedSlots: 0, wage: 0,
      resourceStock: 0,
    })
  }

  // --- Banks (1-2) ---
  const bankCount = Math.max(1, Math.round(params.populationSize / 150))
  const bankPositions = placeLocationsRing(vec2(0, 0), bankCount, R * 0.3, rng)
  for (let i = 0; i < bankCount; i++) {
    locations.push({
      id: uid('bank'),
      type: 'bank',
      position: bankPositions[i],
      radius: 3,
      jobSlots: 0, filledSlots: 0, automatedSlots: 0, aiDisplacedSlots: 0, wage: 0,
      interestRate: 0.05 + rng() * 0.05,     // 5-10% annual interest
      maxLoanMultiplier: 8 + rng() * 4,      // max loan = income × 8-12
    })
  }

  return locations
}

// ============================================================
// Generate agents with initial wealth distribution
// ============================================================
export function generateAgents(
  params: SimulationParams,
  locations: Location[],
  seed: number,
): Agent[] {
  const rng = createRNG(seed + 1000)
  const N = params.populationSize

  // --- Wealth distribution ---
  const wealthValues = generateWealthDistribution(N, params.totalWealth, params.startingGini, rng)

  // --- Assign education ---
  const educationPool: Education[] = []
  for (const edu of EDUCATION_LEVELS) {
    const count = Math.round(N * params.educationMix[edu])
    for (let i = 0; i < count; i++) educationPool.push(edu)
  }
  // Pad or trim to exact N
  while (educationPool.length < N) educationPool.push('medium')
  while (educationPool.length > N) educationPool.pop()
  // Shuffle
  for (let i = educationPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[educationPool[i], educationPool[j]] = [educationPool[j], educationPool[i]]
  }

  // --- Find home locations and track capacity ---
  const homes = locations.filter((l) => l.type === 'home')
  // Reset resident counts
  for (const h of homes) h.residentsCount = 0

  // Helper: find a home with available capacity
  function findAvailableHome(): Location {
    // Prefer homes with space
    for (const h of homes) {
      if ((h.residentsCount ?? 0) < (h.maxResidents ?? 1)) return h
    }
    // All full — use least-full home (overflow)
    return homes.reduce((best, h) =>
      (h.residentsCount ?? 0) < (best.residentsCount ?? 0) ? h : best, homes[0])
  }

  // --- Create agents ---
  const agents: Agent[] = []
  for (let i = 0; i < N; i++) {
    const education = educationPool[i]
    const home = findAvailableHome()
    home.residentsCount = (home.residentsCount ?? 0) + 1

    // Start position near a home with some scatter
    const scatter = home.radius * 1.5
    const pos = vec2(
      home.position.x + (rng() - 0.5) * scatter,
      home.position.y + (rng() - 0.5) * scatter,
    )

    const gender: Gender = rng() < 0.5 ? 'male' : 'female'

    // ~15% of initial population are children (age 0-17)
    const isChild = rng() < 0.15

    const homeValue = home.housingValue ?? 300

    agents.push({
      id: uid('agent'),
      position: pos,
      velocity: vec2(0, 0),
      target: null,
      targetLocationId: null,
      age: isChild ? Math.floor(rng() * 17) : 18 + Math.floor(rng() * 45),
      gender,
      education: isChild ? 'low' : education,
      state: isChild ? 'child' : 'unemployed', // children go to school, adults get jobs
      wealth: isChild ? 0 : wealthValues[i],
      income: 0,
      tickEarnings: 0,
      homeId: home.id,
      homeOwned: false,        // everyone starts renting
      homeDebt: 0,             // no mortgage yet
      homeDebtPayment: 0,
      homeValue: homeValue,
      partnerId: null,
      children: 0,
      workplaceId: null,
      satisfaction: 0.5 + rng() * 0.3,
      needsConsumption: false,
      ticksUnemployed: 0,
      ticksSinceConsumption: 0,
      currentAction: 'idle',
      isSick: false,
      ticksSick: 0,
      ticksLowSatisfaction: 0,
      ticksAsCriminal: 0,
      crimeAttemptCooldown: 0,
      ticksInPrison: 0,
      prisonSentence: 0,
      deathTick: null,
      carryingResource: false,
      lastPaidTick: -10,
      loan: 0,
      loanPayment: 0,
      creditScore: 0.5 + rng() * 0.3,  // initial credit score 0.5-0.8
      ownedBusinessId: null,
      businessDebt: 0,
      businessDebtPayment: 0,
      businessRevenue: 0,
      businessTicksUnprofitable: 0,
      ticksStudying: 0,
      stayTicksRemaining: 0,
      trail: [],
      lifeEvents: [{
        tick: 0,
        type: 'born',
        description: `Entered the economy (${gender}, edu: ${education}, wealth: $${Math.round(wealthValues[i])})`,
      }],
      wealthHistory: [wealthValues[i]],
      wealthArchive: [wealthValues[i]],
      stateHistory: [{ tick: 0, from: (isChild ? 'child' : 'unemployed') as Agent['state'], to: (isChild ? 'child' : 'unemployed') as Agent['state'] }],
    })
  }

  return agents
}

// ============================================================
// Generate complete initial world
// ============================================================
export function generateWorld(params: SimulationParams, seed: number = 42): {
  agents: Agent[]
  locations: Location[]
} {
  resetUidCounter()
  const locations = generateLocations(params, seed)
  const agents = generateAgents(params, locations, seed)
  return { agents, locations }
}
