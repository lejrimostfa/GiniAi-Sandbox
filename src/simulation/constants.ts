// ============================================================
// Simulation Constants — all tunable values in one place
// Users can modify behavior by changing values here
// ============================================================

// --- Movement ---
export const AGENT_SPEED = 15.0           // base movement speed per tick
export const ARRIVAL_DISTANCE = 3.0       // close enough to target (snap faster)
export const SEPARATION_RADIUS = 1.2      // avoid overlap distance
export const SEPARATION_FORCE = 0.3       // strength of avoidance
export const WANDER_FORCE = 0.1           // random drift when idle
export const TRAIL_LENGTH = 20            // positions to remember
export const MAX_WEALTH_HISTORY = 200     // sparkline length

// --- Economy ---
export const BASE_CONSUMPTION_INTERVAL = 5 // ticks between market visits (base for tpy=12)
export const HIRING_SEARCH_RADIUS = 80    // how far agents look for jobs
export const BANKRUPTCY_THRESHOLD = -200  // debt threshold for bankruptcy event

// --- Proximity-based interactions ---
export const INTERACTION_RADIUS = 4.0     // agents within this radius can interact socially
export const CRIME_PROXIMITY_RADIUS = 5.0 // criminal must be this close to steal

// --- Annual calendar (quarter fractions within ticksPerYear) ---
export const ANNUAL_Q1 = 0.0             // Q1: Tax Day → workers visit Government
export const ANNUAL_Q2 = 0.25            // Q2: Job Fair → unemployed converge on workplaces
export const ANNUAL_Q3 = 0.50            // Q3: Market Festival → everyone visits Market
export const ANNUAL_Q4 = 0.75            // Q4: Health/Education → sick seek care, others school

// --- Causal phenomena thresholds ---
export const CRIME_UNEMPLOYMENT_TICKS = 26   // ~6 months unemployed before crime risk
export const CRIME_WEALTH_THRESHOLD = 30     // poverty line for crime trigger
export const CRIME_SATISFACTION_THRESHOLD = 0.25
export const DISEASE_POVERTY_TICKS = 6       // ticks in poverty before sickness
export const DISEASE_WEALTH_THRESHOLD = 40
export const DIVORCE_LOW_SAT_TICKS = 5       // sustained low satisfaction before divorce
export const DIVORCE_SAT_THRESHOLD = 0.20
export const MARRIAGE_SAT_THRESHOLD = 0.40
export const REHAB_TICKS = 12                // ticks as criminal before possible rehabilitation
export const DEATH_SICK_TICKS = 10           // ticks sick before death risk rises

// --- Government & Treasury ---
export const POLICE_SALARY = 40              // per police agent per tick
export const PENSION_PER_RETIREE = 12        // pension per retired agent per tick
export const INFRA_COST_PER_LOCATION = 0.5   // infrastructure maintenance cost
export const BENEFIT_PER_UNEMPLOYED = 5      // unemployment benefit per agent per tick
export const UBI_TREASURY_SHARE = 0.1        // fraction of treasury surplus spent on UBI

// --- Police system ---
export const POLICE_BASE_RATIO = 50          // 1 police per N agents (base)
export const POLICE_PER_CRIMINAL = 1.5       // police target per criminal
export const POLICE_UNREST_THRESHOLD = 0.4   // dissatisfaction rate triggering unrest hiring
export const POLICE_UNREST_HIRE_RATE = 0.03  // fraction of pop hired during unrest
export const POLICE_MAX_HIRE_PER_TICK = 2    // max police recruits per tick
export const POLICE_MAX_FIRE_PER_TICK = 1    // max police fired per tick
export const POLICE_MIN_AGE = 20             // minimum age for police recruitment
export const POLICE_MAX_AGE = 50             // maximum age for police recruitment
export const ARREST_SUCCESS_RATE = 0.6       // probability of successful arrest
export const ARREST_CONFISCATE_RATE = 0.3    // fraction of criminal wealth confiscated
export const ARREST_CONFISCATE_CAP = 50      // max confiscated amount
export const POLICE_SURVEILLANCE_DRAIN = 0.005 // satisfaction penalty from police proximity

// --- Prison & crime realism ---
// Ref: Bureau of Justice Statistics — avg state prison sentence ~2.5 years, served ~44%
export const PRISON_SENTENCE_MIN = 13       // ~3 months minimum sentence (ticks)
export const PRISON_SENTENCE_MAX = 52       // ~1 year maximum sentence (ticks)
export const PRISON_COST_PER_PRISONER = 8   // $/tick maintenance cost per prisoner (food, guards, overhead)
export const CRIME_ATTEMPT_COOLDOWN = 4     // ticks between crime attempts (sporadic, not every tick)
export const CRIME_SUCCESS_BASE_PROB = 0.35 // base probability a robbery attempt succeeds (before police modifier)
export const POLICE_DETERRENT_RADIUS = 12   // if police within this radius, crime success drops
export const POLICE_DETERRENT_FACTOR = 0.4  // each nearby police multiplies success prob by this factor

// --- Hospital ---
// Ref: WHO estimates ~$500-2000 per birth in developed countries, ~$200-1000 per disease treatment
export const HOSPITAL_BIRTH_COST = 25          // government pays per birth at hospital
export const HOSPITAL_TREATMENT_COST = 15      // government pays per sick agent treated per tick
export const HOSPITAL_MAINTENANCE_COST = 5     // base per-tick maintenance cost (staff, equipment)
export const HOSPITAL_RECOVERY_PROB = 0.25     // probability of recovering from disease per hospital visit
export const HOSPITAL_BIRTH_MORTALITY_NO_HOSPITAL = 0.08 // extra infant mortality if no hospital exists

// --- Amusement Park ---
export const AMUSEMENT_PARK_ENTRY_COST = 8     // cost per agent visit
export const AMUSEMENT_PARK_SAT_BOOST = 0.12   // satisfaction boost per visit
export const AMUSEMENT_PARK_VISIT_PROB = 0.10  // probability an agent decides to visit (per decision tick)

// --- Apartment buildings ---
// Apartments cost more to build but cheaper rent per family, more total rent for owners
export const APARTMENT_RENT_RATIO = 0.035      // annual rent ≈ 3.5% of value (cheaper per family)
export const HOUSE_RENT_RATIO = 0.05           // annual rent ≈ 5% of value (normal)

// --- Strikes ---
export const STRIKE_DISSATISFACTION_THRESHOLD = 0.35 // dissatisfaction rate to trigger strikes
export const STRIKE_SAT_THRESHOLD = 0.30     // individual satisfaction below which worker may strike
export const STRIKE_BASE_PROBABILITY = 0.15  // base chance of striking per dissatisfied worker

// --- Family & fertility ---
export const POOR_COUPLE_WEALTH_THRESHOLD = 60   // couple wealth below which poverty fertility kicks in
export const POOR_SAT_THRESHOLD = 0.20           // lower satisfaction threshold for poor couples
export const NORMAL_SAT_THRESHOLD = 0.55         // satisfaction threshold for normal couples
export const POOR_MAX_CHILDREN = 6               // max children for poor families
export const NORMAL_MAX_CHILDREN = 4             // max children for normal families
export const POVERTY_FERTILITY_BOOST_MAX = 0.4   // max conception failure reduction for poor
export const CHILD_OVERCROWDING_MORTALITY = 0.01 // extra death risk per sibling above 2
export const PARENT_GRIEF_SAT_LOSS = 0.35        // satisfaction loss when losing a child
export const PARENT_GRIEF_DESPAIR_TICKS = 8      // accelerated despair ticks on child death
export const FAMILY_STRAIN_WEALTH_THRESHOLD = 80 // parent wealth below which child strain applies
export const FAMILY_STRAIN_PER_CHILD = 0.008     // satisfaction drain per extra child (above 2)

// --- Wealth dynamics (inequality drivers) ---
export const CAPITAL_RETURN_RATE = 0.03          // 3% annual return on wealth (Piketty's r > g)
export const CAPITAL_RETURN_THRESHOLD = 200      // minimum wealth to earn capital returns
export const PASSIVE_LIVING_COST = 3             // $/tick base cost of living (food, transport, utilities)
export const BENEFIT_DECAY_TICKS = 26            // weeks before unemployment benefits start decaying
export const BENEFIT_DECAY_RATE = 0.5            // benefits reduced to this fraction after decay period
export const AUTOMATION_WAGE_SAVINGS_RATE = 0.6  // fraction of saved wages that become owner profit

// --- Automation system ---
// Ref: Anthropic Economic Index (2025) — actual AI displacement ~35% of theoretical capability
export const ROBOTIC_TARGETING_FILLED_PROB = 0.6   // P(robotic targets filled worker vs empty slot)
export const AI_TARGETING_FILLED_PROB = 0.7        // P(AI targets filled worker vs empty slot)
export const ROBOTIC_INVEST_WEEKS = 10             // robot costs ~10 weeks of wage per slot
export const AI_INVEST_WEEKS = 6                   // AI costs ~6 weeks of wage per slot
export const JOB_CREATION_RATE = 0.2               // base new-job creation coefficient
export const JOB_CREATION_VACANCY_CAP = 0.08       // vacancy rate above which no new jobs created
export const DISPLACEMENT_DAMPENER_FACTOR = 2      // dampening multiplier on displacement rate
export const LAYOFF_BASE_PROB = 0.02               // base probability of economic layoff per tick
export const VACANCY_ATTRITION_THRESHOLD = 0.10    // vacancy rate above which empty slots shrink

// --- Economy thresholds ---
// Ref: Piketty, T. (2014). Capital in the Twenty-First Century. Harvard University Press.
export const WEALTH_FLOOR = -500                   // minimum wealth (prevents infinite debt spiral)
export const ENTREPRENEUR_WEALTH_MULT = 1.2        // wealth > avg × this to be eligible
export const ENTREPRENEUR_PROB = 0.06              // per-tick probability of becoming entrepreneur

// --- Immigration & emigration ---
// Ref: OECD International Migration Outlook — net migration ~0.3-0.8% of pop/year in developed countries
// Ref: ILO Global Estimates on International Migrant Workers (2021) — ~60% of migrants in OECD are employed
export const IMMIGRATION_BASE_RATE = 0.005       // base probability per tick of 1 immigrant arriving (proactive inflow)
export const EMIGRATION_BASE_RATE = 0.002        // base probability per tick of 1 agent emigrating (outflow)
export const EMIGRATION_LOW_SAT_THRESHOLD = 0.25 // satisfaction below which emigration probability doubles
export const EMIGRATION_UNEMPLOYED_BOOST = 0.003 // extra emigration probability if unemployed
// Skilled migration: fraction of immigrants who arrive with a job offer (if vacancies exist)
export const IMMIGRANT_SKILLED_HIRE_RATE: Record<string, number> = {
  low: 0.20,    // 20% of low-edu immigrants arrive with a job
  medium: 0.45, // 45% of medium-edu
  high: 0.70,   // 70% of high-edu (skilled visa programs)
}
// Initial wealth by education (savings brought from origin country)
export const IMMIGRANT_INITIAL_WEALTH: Record<string, number> = {
  low: 30,      // minimal savings
  medium: 120,  // moderate savings
  high: 300,    // substantial savings (skilled professionals)
}
// Immigrant age range: broader than the old 18-24
export const IMMIGRANT_AGE_MIN = 18
export const IMMIGRANT_AGE_MAX = 40              // up to 40 (working-age prime)

// --- Rolling rate windows ---
export const RATE_WINDOW = 12                    // 12-tick (~3 month) rolling window for smooth rates
