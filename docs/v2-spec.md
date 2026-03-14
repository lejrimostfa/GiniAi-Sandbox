# GiniAi-Sandbox v2 — Primer-Style Agent-Based Economic Simulation

## Vision
A browser-based, visually elegant **agent-based economic simulator** inspired by
[Primer](https://www.youtube.com/c/PrimerLearning). Colored blobs (agents) move
freely in a 2D/3D world, make economic decisions, and produce emergent macro
phenomena (Gini coefficient, unemployment waves, class formation). Every agent
is individually trackable.

---

## 1. World Model

### 1.1 Space
- **Open plane** (not a grid): agents move continuously in 2D (rendered in 3D perspective)
- World size scales with population (more agents → larger world)
- Soft boundary — agents are steered back if they drift too far

### 1.2 Locations (Points of Interest)
Locations are **abstract circles** on the plane, not realistic buildings.

| Type | Icon/Shape | Purpose |
|------|-----------|---------|
| **Home Zone** | 🏠 soft circle cluster | Where agents rest, spend night |
| **Workplace** | ⚙️ colored square | Employs agents, pays wages |
| **Market** | 🛒 hexagon | Where agents spend money (consume) |
| **School** | 📚 triangle | Agents can upskill here |
| **Government** | 🏛 diamond | Tax collection + redistribution center |

- Locations are created procedurally based on economy type
- Workplaces have: `type` (manual/skilled/creative), `jobSlots`, `wage`, `automationRisk`
- Markets have: `goodsPrice`, scaled by demand

---

## 2. Agent Model

### 2.1 Properties
```typescript
interface Agent {
  id: string
  // Position & movement
  position: Vec2          // current position
  velocity: Vec2          // current velocity
  target: Vec2 | null     // where heading
  
  // Identity
  age: number             // 18-80 (simulation years)
  education: Education    // 'low' | 'medium' | 'high'
  
  // Economic state
  state: AgentState       // 'employed' | 'unemployed' | 'business_owner' | 'retired'
  wealth: number          // accumulated savings (can be negative = debt)
  income: number          // per-tick income from job
  expenses: number        // per-tick living costs
  
  // Employment
  workplaceId: string | null  // current employer
  jobSkillReq: SkillLevel     // skill level of current job
  
  // Needs & decisions
  satisfaction: number    // 0-1, drives behavior
  
  // Visual
  color: string           // derived from state
  radius: number          // derived from wealth
  trail: Vec2[]           // recent positions for trail effect
}
```

### 2.2 States & Transitions
```
                    ┌──────────┐
            hire    │ Employed │   fired / automated
          ┌────────►│  (wage)  ├──────────┐
          │         └────┬─────┘          │
          │              │ accumulate     ▼
     ┌────┴─────┐        │ capital  ┌──────────────┐
     │Unemployed│        │         │  Unemployed   │
     │ (seeking)│◄───────┘         │  (seeking)    │
     └────┬─────┘                  └──────┬────────┘
          │ invest                        │ long-term
          ▼                               ▼
    ┌──────────────┐              ┌──────────────┐
    │Business Owner│              │   Retired    │
    │  (profits)   │              │  (pension)   │
    └──────────────┘              └──────────────┘
```

### 2.3 Decision Loop (per tick)
1. **Assess needs**: money, food/shelter (= expenses), satisfaction
2. **Choose destination**:
   - If employed → go to workplace
   - If unemployed → seek nearest hiring workplace matching skill
   - If business owner → go to own workplace
   - If low satisfaction → go to market (consume)
   - Periodically → go home to rest
3. **Move** toward target (steering behavior, avoid overlap)
4. **Interact** when arriving at location:
   - Workplace: earn wage (or get automated/fired)
   - Market: spend money → increase satisfaction
   - School: chance to upgrade education (costs time + money)
5. **Update wealth**: `wealth += income - expenses`

### 2.4 Movement System
- **Steering behaviors** (Reynolds-style):
  - Seek: move toward target
  - Arrive: slow down near target
  - Separation: avoid overlapping other agents
  - Wander: slight random drift when idle
- Speed: base speed, modified by urgency
- No pathfinding needed — direct movement with avoidance

---

## 3. Economy Engine

### 3.1 Flow of Money
```
  Government ──(UBI/services)──► Agents
       ▲                           │
       │ taxes                     │ wages
       │                           ▼
  Agents ◄──(wages)── Workplaces ◄──(revenue)── Markets
       │                                          ▲
       └──────────(spending)──────────────────────┘
```

### 3.2 Workplaces
- **Types**: Manual (factory), Skilled (office), Creative (studio), Service (shop)
- Each has `jobSlots`, `wageLevel`, `automationRisk`
- Automation: each tick, probability `P_automate = automationRate × automationRisk`
  - When a slot is automated → worker fired, slot permanently removed
  - New tech jobs may appear (fewer, higher skill requirement)
- Revenue: proportional to filled slots × productivity

### 3.3 Markets
- Agents spend money at markets → money flows back into economy
- Price level adjusts based on aggregate demand
- Consumption = satisfaction recovery

### 3.4 Government (if redistribution > 0)
- Collects tax: `tax = taxRate × income` from all agents
- Redistributes as:
  - **UBI**: equal payment to all agents
  - **Education funding**: reduces school cost
  - **Unemployment benefits**: payment to unemployed

### 3.5 Emergent Metrics
These are **computed** from agent states, not set directly:
- **Gini coefficient**: from wealth distribution
- **Unemployment rate**: % agents in unemployed state
- **Median wealth / income**
- **Class distribution**: poor / middle / rich (threshold-based)
- **Social mobility**: rate of class transitions
- **Automation level**: % of original jobs automated

---

## 4. User Parameters (Comprehensible)

### 4.1 Initial Setup Panel
| Parameter | Range | What it means |
|-----------|-------|--------------|
| **Population** | 50 – 500 | Number of agents |
| **Starting Gini** | 0.15 – 0.65 | How unequal initial wealth is (0.15 = Nordics, 0.65 = extreme) |
| **Education Mix** | sliders | % low / medium / high education |
| **AI Growth Rate** | 0 – 15% /yr | Speed of job automation |
| **Redistribution** | 0 – 100% | Tax & transfer intensity |
| **Economy Type** | preset | Agrarian / Industrial / Service / Tech |
| **Starting Wealth** | $ amount | Total wealth in the system |

### 4.2 Live Controls (adjustable during simulation)
- AI growth rate (slider)
- Redistribution level (slider)  
- Add/remove agents
- Simulation speed
- Follow specific agent (click)

### 4.3 Economy Type Presets
| Preset | Manual% | Skilled% | Creative% | Service% |
|--------|---------|----------|-----------|----------|
| Agrarian | 70 | 15 | 5 | 10 |
| Industrial | 40 | 35 | 10 | 15 |
| Service | 15 | 25 | 15 | 45 |
| Tech | 10 | 30 | 35 | 25 |

---

## 5. Visual Design (Primer-Inspired)

### 5.1 Agents
- **Shape**: sphere (3D) or circle (top-down)
- **Color**: encodes economic class
  - 🔵 Blue = employed worker
  - 🟠 Orange = unemployed  
  - 🟣 Purple = business owner
  - ⚪ Grey = retired
- **Size**: proportional to `log(wealth + 1)` — richer agents are slightly larger
- **Glow/ring**: satisfaction level (bright = satisfied, dim = struggling)
- **Trail**: fading line showing recent movement path
- **Label**: on hover, show name + wealth + state

### 5.2 Locations
- **Workplaces**: colored rounded rectangles
  - Color by type: factory=grey, office=blue, studio=purple, shop=green
  - Size by job slots
  - Pulsing border if hiring
  - Red X overlay on automated slots
- **Markets**: hexagonal, warm orange
- **Homes**: soft circles, residential clusters
- **Schools**: triangular, green
- **Government**: diamond, gold

### 5.3 Visual Effects
- Money flow: tiny particles from workplace → agent (wages)
- Tax flow: tiny particles from agent → government
- UBI flow: particles from government → all agents
- Automation: "zap" effect when job is automated
- Agent birth: pop-in with scale animation
- Agent retirement: fade to grey, shrink

### 5.4 Camera
- Default: top-down isometric view showing entire world
- Zoom: scroll to zoom in/out
- Follow mode: click agent → camera follows them
- Orbit: right-click drag to rotate

---

## 6. Agent Inspector (Click to Follow)

When user clicks an agent:
- **Camera follows** that agent smoothly
- **Inspector panel** shows:
  - Name, age, education
  - Current state, workplace
  - Wealth history (sparkline)
  - Income vs expenses
  - Satisfaction level
  - Life events log: "Got hired at Office #3", "Lost job to automation", "Started business"
- **Visual highlight**: selected agent has bright outline + ring
- **Press Escape** to deselect and return to overview

---

## 7. Charts (Publication-Ready)

| Tab | Chart | X-axis | Y-axis |
|-----|-------|--------|--------|
| Wealth | Wealth distribution histogram | Wealth brackets | Agent count |
| Gini | Gini coefficient over time | Time (ticks) | Gini (0-1) |
| Employment | Employment breakdown | Time | % by state |
| Mobility | Class transitions per period | Time | Transition rate |
| Automation | Jobs remaining vs automated | Time | Job count |
| Income | Income distribution (Lorenz curve) | Population % | Cumulative income % |

---

## 8. Technical Architecture

### 8.1 What we KEEP from v1
- Vue 3 + Vite + TypeScript stack
- Pinia stores pattern
- mitt event bus
- UI shell (AppLayout, TopBar, bottom bar)
- Chart.js infrastructure
- SCSS design tokens

### 8.2 What we REWRITE
- `src/types/` → new Agent, Location, Economy, World types
- `src/simulation/` → NEW folder: simulation engine (pure TS, no rendering)
- `src/scene/` → new Three.js scene with agents, locations, effects
- `src/stores/` → adapted for new data model
- `src/components/controls/` → new parameter panels
- `src/components/panels/` → new agent inspector
- `src/components/charts/` → adapted chart types

### 8.3 Simulation Engine (pure TS, decoupled from rendering)
```
SimulationEngine
├── World (spatial container)
├── AgentManager (create, update, remove agents)
├── EconomyManager (workplaces, markets, money flow)
├── AutomationManager (job automation logic)
├── GovernmentManager (tax + redistribution)
└── MetricsComputer (Gini, unemployment, etc.)
```

The engine runs at a fixed tick rate. The renderer interpolates between ticks
for smooth 60fps visuals.

### 8.4 Performance Targets
- 500 agents at 60fps
- Instanced meshes for agents (single draw call)
- Instanced meshes for locations
- Particle system for money flow effects
- Simulation tick: < 5ms for 500 agents

---

## 9. Implementation Phases

### Phase A: Core Engine (pure TS, no rendering)
1. Type definitions (Agent, Location, Economy, World, SimParams)
2. World class (spatial indexing, location placement)
3. Agent creation with initial wealth distribution (Gini-based)
4. Economy engine (workplaces, wages, automation)
5. Agent decision loop + movement system
6. Government + redistribution
7. Metrics computer (Gini, unemployment, class distribution)

### Phase B: Three.js Scene
1. Ground plane + camera setup
2. Location rendering (instanced shapes per type)
3. Agent rendering (instanced spheres, color/size encoding)
4. Smooth agent movement interpolation
5. Agent trails
6. Money flow particles
7. Automation visual effects

### Phase C: UI + Inspector
1. Initial parameters panel (Gini, education, economy type, etc.)
2. Live controls (speed, AI rate, redistribution)
3. Agent inspector panel (click to follow)
4. Agent life event log
5. Wealth sparkline in inspector
6. Keyboard shortcuts

### Phase D: Charts + Polish
1. Adapt charts (Gini, employment, wealth distribution, Lorenz, automation)
2. Scenario presets ("Nordic Model", "Laissez-faire", "AI Shock", etc.)
3. Visual polish (animations, transitions)
4. Performance optimization
5. README update

---

## 10. Scenarios for Publication

| Scenario | Gini | Education | AI Rate | Redistribution | Expected |
|----------|------|-----------|---------|---------------|----------|
| Nordic Baseline | 0.25 | 20/60/20 | 2% | 70% | Stable, low inequality |
| US Status Quo | 0.40 | 35/45/20 | 5% | 30% | Rising Gini, hollowed middle |
| AI Shock | 0.35 | 30/50/20 | 15% | 20% | Mass unemployment, rapid polarization |
| UBI Experiment | 0.35 | 30/50/20 | 10% | 80% | Does UBI prevent collapse? |
| Education First | 0.35 | 10/40/50 | 10% | 40% | Can education outpace automation? |
| Oligarchy | 0.60 | 50/35/15 | 5% | 10% | Extreme concentration, low mobility |
