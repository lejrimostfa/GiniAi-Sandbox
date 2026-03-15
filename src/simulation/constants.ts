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
export const MARRIAGE_SAT_THRESHOLD = 0.60
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

// --- Rolling rate windows ---
export const RATE_WINDOW = 12                    // 12-tick (~3 month) rolling window for smooth rates
