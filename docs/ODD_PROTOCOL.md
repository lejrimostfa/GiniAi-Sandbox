# ODD Protocol — GiniAI-Sandbox

**ODD (Overview, Design concepts, Details)** protocol following Grimm et al. (2006, 2010, 2020).

> Grimm, V., et al. "A standard protocol for describing individual-based and agent-based models."
> *Ecological Modelling*, 198(1-2), 115-126, 2006.

---

## 1. PURPOSE AND PATTERNS

### 1.1 Purpose

GiniAI-Sandbox is an agent-based model (ABM) designed to explore the **causal relationship between AI/robotic automation and wealth inequality** (measured by the Gini coefficient) in a simplified closed economy. The model investigates:

1. How dual-channel automation (robotic displacement of manual labor + AI/LLM displacement of cognitive labor) affects employment, wealth distribution, and social indicators.
2. How fiscal policy (progressive taxation, unemployment benefits, UBI) mediates or amplifies inequality under automation.
3. How emergent societal phenomena (crime, disease, divorce, entrepreneurship) arise from economic stress and feed back into inequality dynamics.

### 1.2 Entities, State Variables, and Scales

#### Entities

| Entity | Description | Count |
|--------|-------------|-------|
| **Agent** | Individual person with economic state, needs, and lifecycle | 50–500 |
| **Location** | Spatial point: workplace, home, market, school, bank, government | 30–150 |
| **Workplace** | Location subtype with job slots, wages, automation counters | 10–60 |

#### Key Agent State Variables

| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| `age` | number | 0–80 | Simulation years |
| `education` | enum | low, medium, high | Educational attainment |
| `state` | enum | child, unemployed, employed, business_owner, retired, criminal, police, dead | Current state |
| `wealth` | number | -500 to +inf | Accumulated savings (floor at -500) |
| `income` | number | 0+ | Nominal per-tick income |
| `satisfaction` | number | [0, 1] | Life satisfaction index |
| `isSick` | boolean | — | Currently ill |
| `creditScore` | number | [0, 1] | Financial creditworthiness |

#### Temporal Scale

- **1 tick = 1 week** (52 ticks/year)
- **Typical run**: 520–2600 ticks (10–50 years)

#### Spatial Scale

- **World**: 200x200 continuous 2D plane
- **Interaction radius**: 4.0 units (social), 5.0 units (crime)

### 1.3 Process Overview and Scheduling

Each tick executes in **fixed sequential order**:

1. **Cleanup** — Remove dead agents past display duration
2. **Aging** — Increment age, retirement (65), death (probabilistic >65), child graduation (18)
3. **Population Renewal** — Immigration to maintain target population
4. **Automation** — Robotic and AI displacement of workers
5. **Causal Phenomena** — Disease, crime, premature death, divorce
6. **Agent Decision** — Choose next destination based on state/needs
7. **Movement** — Steering behaviors toward target
8. **Location Interaction** — Hire, earn wages, consume, study, bank
9. **Proximity Interaction** — Marriage, robbery, contagion, arrest
10. **Economy** — Capital returns, consumption, entrepreneurship
11. **Government** — Taxes, pensions, benefits, UBI, police, strikes
12. **Loans** — Repayment, bankruptcy, credit scores
13. **Family** — Fertility, birth
14. **History** — Record wealth and state archives
15. **Metrics** — Compute Gini, GDP, employment rates

---

## 2. DESIGN CONCEPTS

### 2.1 Basic Principles

- **Piketty's r > g**: Capital returns (3%/year) on wealth above $200 drive concentration.
- **Dual-channel automation**: Robotic (manual jobs) + AI/LLM (cognitive jobs), calibrated on **Anthropic Economic Index (2025)**.
- **Causal societal phenomena**: Crime, disease, divorce caused by sustained poverty — not random probability.
- **Demographic transition**: Education + wealth + satisfaction reduce fertility.

### 2.2 Emergence

- **Gini trajectory** — from wage distribution, capital returns, automation, policy
- **Crime waves** — from unemployment exceeding thresholds
- **Business cycles** — from entrepreneurship/hiring/bankruptcy loops
- **Demographic transitions** — declining birth rates with rising education

### 2.3 Adaptation

Agents adapt via state-dependent behavioral rules:
- Unemployed → seek jobs, study, visit government
- Employed → work, consume, possibly become entrepreneur
- Criminals → patrol and steal; may rehabilitate or be arrested
- Sick → seek healthcare

### 2.4 Objectives

No explicit utility functions. Agents follow **state-dependent rules**. Satisfaction acts as implicit welfare measure gating life events (marriage, divorce, crime).

### 2.5 Sensing

Agents sense: own state (wealth, satisfaction, employment), nearby agents (within 4.0 units), location types and distances. **No global information** (no perfect information assumption).

### 2.6 Interaction

- **Direct**: Proximity-based (marriage, robbery, disease, arrest)
- **Indirect**: Through locations (hiring, consuming, taxation)
- **Economic**: Wage payments, rent, taxes, business revenue

### 2.7 Stochasticity

All randomness via **seeded PRNG** (Mulberry32) ensuring full reproducibility. Stochastic elements: initial wealth distribution, automation events, agent decisions, life events.

### 2.8 Observation

Per-tick metrics: Gini, top10/bottom50 wealth shares, GDP, employment, automation rates, government budget, birth/death/crime/disease rates (annualized per 1000 pop).

---

## 3. DETAILS

### 3.1 Initialization

1. **World generation** (`WorldGenerator.ts`): Locations in concentric rings; workplaces by economy type
2. **Wealth**: Power distribution X=U^k, binary search (30 iterations) for target Gini (±0.003)
3. **Education**: By `educationMix` parameter
4. **Population**: 85% adults (18–65), 15% children (0–17)
5. **Jobs**: Matched by education-skill compatibility

### 3.2 Input Data

No external runtime data. Anthropic Economic Index values are static workplace parameters.

### 3.3 Submodels

#### 3.3.1 Automation (`AutomationSystem.ts`)

Two independent channels per workplace per tick:

| Channel | Probability/tick | Workers displaced | Owner investment | Targeting |
|---------|-----------------|-------------------|-----------------|-----------|
| Robotic | aiGrowthRate × automationRisk / ticksPerYear | 2–4 | ~10 weeks wage | 60% filled workers |
| AI/LLM | aiDiffusionRate × aiExposure / ticksPerYear | 2–5 | ~6 weeks wage | 70% filled workers |

Workplace automation parameters (Anthropic Economic Index 2025):

| Type | automationRisk | aiExposure | Education |
|------|---------------|------------|-----------|
| Manual | 0.70 | 0.15 | low |
| Service | 0.40 | 0.35 | low |
| Skilled | 0.20 | 0.65 | medium |
| Creative | 0.10 | 0.55 | high |

Wage savings: 60% of slot wage per automated slot → owner profit.

#### 3.3.2 Economy (`EconomySystem.ts`)

- **Living cost**: $3/tick (all non-dead, non-child agents)
- **Capital returns**: 3%/year on wealth > $200 (Piketty r > g)
- **Wealth floor**: -$500
- **Entrepreneurship**: wealth > 1.2× average + education ≥ medium + satisfaction > 0.45 → 6%/tick chance

#### 3.3.3 Government (`GovernmentSystem.ts`)

- **Tax**: redistributionLevel × 30% on tick earnings
- **Spending priority**: Police → Pensions → Benefits → Infrastructure → UBI
- **Benefit decay**: After 26 weeks, benefits halve
- **Police**: Hired from unemployed low-education agents, scaled to crime
- **Strikes**: Workers with satisfaction < 0.25 when dissatisfaction > 30%

#### 3.3.4 Causal Phenomena (`CausalPhenomenaSystem.ts`)

| Phenomenon | Causal Condition | Threshold |
|------------|-----------------|-----------|
| Crime | Unemployed >8 ticks + wealth <$30 + satisfaction <0.25 | Education-gated |
| Disease | Wealth <$40 + satisfaction <0.35 for >6 ticks | Progressive |
| Premature death | Sick >10 ticks + poverty + age factor | Age-weighted |
| Divorce | Satisfaction <0.20 for >5 ticks | 2%/tick |
| Marriage | Satisfaction >0.60 + employed + sustained | Proximity-based |

#### 3.3.5 Family (`FamilySystem.ts`)

Birth probability = base × ageFactor × educationFactor × wealthFactor × childPenalty × econStressFactor × coupleSatisfaction. Economic stress multiplier: max(0.2, 1 − unemploymentRate).

#### 3.3.6 Loans (`LoanSystem.ts`)

Personal and business loans with per-tick repayment. Business bankruptcy: unprofitable >2 years OR wealth < -$400. Personal default: penalties on credit score and satisfaction.

---

## 4. VERIFICATION AND VALIDATION

### 4.1 Unit Tests (42 tests, vitest)

- **Statistical correctness**: Gini on known distributions, scale invariance, negative wealth, edge cases
- **Distribution generation**: Target Gini convergence (±0.05), determinism, positivity
- **PRNG**: Determinism, range [0,1), uniformity
- **Reproducibility**: Same seed → identical metrics, different seeds → different results, reset equivalence
- **Invariants**: Population > 0, valid states, Gini ∈ [0,1], wealth floor, archive growth

### 4.2 Known Limitations

1. Small population (50–500) — statistical artifacts possible
2. No spatial geography (flat plane, no regions)
3. Simplified labor market (4 workplace types)
4. No international trade (closed economy)
5. No inflation/deflation mechanism
6. Single-threaded, browser-only execution
7. No formal warm-up period detection

---

## 5. REFERENCES

- Grimm, V., et al. (2006). A standard protocol for describing individual-based and agent-based models. *Ecological Modelling*, 198(1-2), 115-126.
- Grimm, V., et al. (2020). ODD protocol update. *JASSS*, 23(2), 7.
- Piketty, T. (2014). *Capital in the Twenty-First Century*. Harvard University Press.
- Anthropic (2025). *The Anthropic Economic Index*. Technical Report.
- Chen, C.N., Tsaur, T.W., & Rhai, T.S. (1982). The Gini coefficient and negative income. *Oxford Economic Papers*, 34(3), 473-478.
