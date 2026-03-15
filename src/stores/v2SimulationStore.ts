// --- V2 Simulation Store ---
// Pinia store wrapping the SimulationEngine
// Manages tick loop, params, and exposes reactive state to UI
// Emits events for scene and charts consumption

import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import { SimulationEngine } from '../simulation/SimulationEngine'
import type { SimulationParams, WorldState, SimMetrics, Agent } from '../simulation/types'
import { DEFAULT_PARAMS } from '../simulation/types'
import eventBus from '../events/eventBus'
import { downloadJSON, downloadMultipleJSON, buildFilename, buildBatchPrefix, sanitizeWorldStateForExport, fullAgentExport } from '../lib/exportUtils'

export const useSimStore = defineStore('v2simulation', () => {
  // --- State ---
  const engine = shallowRef<SimulationEngine | null>(null)
  const worldState = shallowRef<WorldState | null>(null)
  const metricsHistory = ref<SimMetrics[]>([])
  const params = ref<SimulationParams>({ ...DEFAULT_PARAMS })
  const isPlaying = ref(false)
  const speed = ref(1) // ticks per frame-interval
  const tickInterval = ref(200) // ms between ticks

  // Snapshot storage for export
  let initialSnapshot: WorldState | null = null
  let simulationSeed: number | null = null
  // Full metrics archive — never capped, used only for export
  const fullMetricsArchive = ref<SimMetrics[]>([])

  let timer: ReturnType<typeof setInterval> | null = null

  // --- Getters ---
  const currentTick = computed(() => worldState.value?.tick ?? 0)
  const currentMetrics = computed(() => worldState.value?.metrics ?? null)
  const agents = computed(() => worldState.value?.agents ?? [])
  const locations = computed(() => worldState.value?.locations ?? [])
  const hasData = computed(() => engine.value !== null && worldState.value !== null)

  // --- Actions ---

  /** Initialize a new simulation */
  function init(customParams?: Partial<SimulationParams>, seed?: number) {
    stop()
    const p = { ...DEFAULT_PARAMS, ...customParams }
    params.value = p

    const actualSeed = seed ?? Math.floor(Math.random() * 100000)
    simulationSeed = actualSeed
    const eng = new SimulationEngine(p, actualSeed)
    eng.init()
    engine.value = eng

    worldState.value = eng.getWorldState()
    // Deep-clone initial state for export (before any ticks mutate it)
    initialSnapshot = JSON.parse(JSON.stringify(worldState.value))
    metricsHistory.value = [eng.metrics]
    fullMetricsArchive.value = [eng.metrics]

    eventBus.emit('snapshot:loaded', [worldState.value] as never)
  }

  /** Run one simulation tick */
  function step() {
    if (!engine.value) return
    const state = engine.value.step()
    worldState.value = state
    metricsHistory.value.push(state.metrics)
    fullMetricsArchive.value.push(state.metrics)

    // Keep chart history bounded (archive stays full for export)
    // 6000 ticks ≈ 115 years at 52 ticks/year — covers any realistic simulation
    if (metricsHistory.value.length > 6000) {
      metricsHistory.value = metricsHistory.value.slice(-6000)
    }

    eventBus.emit('snapshot:updated', state as never)
  }

  /** Start playback */
  function play() {
    if (isPlaying.value) return
    isPlaying.value = true
    startTimer()
  }

  /** Pause playback */
  function pause() {
    isPlaying.value = false
    stopTimer()
  }

  /** Stop and reset */
  function stop() {
    isPlaying.value = false
    stopTimer()
  }

  /** Set speed (ticks per interval) */
  function setSpeed(s: number) {
    speed.value = s
    if (isPlaying.value) {
      stopTimer()
      startTimer()
    }
  }

  /** Update params live */
  function updateParams(newParams: Partial<SimulationParams>) {
    Object.assign(params.value, newParams)
    engine.value?.updateParams(newParams)
  }

  /** Get a specific agent by id */
  function getAgent(id: string): Agent | undefined {
    return worldState.value?.agents.find((a) => a.id === id)
  }

  // ============================================================
  // Export functions — granular multi-JSON for analysis
  // ============================================================

  /** Common metadata header for all exports */
  function exportMeta() {
    return {
      exportedAt: new Date().toISOString(),
      seed: simulationSeed,
      currentTick: worldState.value?.tick ?? 0,
      currentYear: worldState.value?.metrics?.year ?? 0,
      totalTicksRecorded: fullMetricsArchive.value.length,
      params: { ...params.value },
    }
  }

  // --- 1. Parameters & Config ---
  /** Simulation parameters, economy presets, workplace configs */
  function exportParams(): void {
    const data = {
      exportType: 'parameters',
      ...exportMeta(),
      defaultParams: DEFAULT_PARAMS,
    }
    downloadJSON(data, buildFilename('giniai_params'))
  }

  // --- 2. Full Time-Series Metrics (uncapped archive) ---
  /** Every tick's SimMetrics — the core dataset for analysis */
  function exportTimeSeries(): void {
    if (!fullMetricsArchive.value.length) return
    const data = {
      exportType: 'timeseries',
      ...exportMeta(),
      totalTicks: fullMetricsArchive.value.length,
      metrics: fullMetricsArchive.value,
    }
    downloadJSON(data, buildFilename('giniai_timeseries'))
  }

  // --- 3. All Agents (current state + full history) ---
  /** Every agent's current state, wealth history, and life events */
  function exportAgents(): void {
    if (!worldState.value) return
    const agentsData = worldState.value.agents.map(a =>
      fullAgentExport(a as unknown as Record<string, unknown>)
    )
    const data = {
      exportType: 'agents',
      ...exportMeta(),
      totalAgents: agentsData.length,
      agents: agentsData,
    }
    downloadJSON(data, buildFilename('giniai_agents'))
  }

  // --- 4. All Locations (current state) ---
  /** Every location: workplaces, homes, markets, schools, etc. */
  function exportLocations(): void {
    if (!worldState.value) return
    const data = {
      exportType: 'locations',
      ...exportMeta(),
      totalLocations: worldState.value.locations.length,
      locations: worldState.value.locations,
    }
    downloadJSON(data, buildFilename('giniai_locations'))
  }

  // --- 5. Agent Life Events (extracted for easy analysis) ---
  /** Flattened list of all life events across all agents */
  function exportLifeEvents(): void {
    if (!worldState.value) return
    const events: { agentId: string; age: number; state: string; education: string; tick: number; type: string; description: string }[] = []
    for (const agent of worldState.value.agents) {
      for (const evt of agent.lifeEvents) {
        events.push({
          agentId: agent.id,
          age: agent.age,
          state: agent.state,
          education: agent.education,
          tick: evt.tick,
          type: evt.type,
          description: evt.description,
        })
      }
    }
    events.sort((a, b) => a.tick - b.tick)
    const data = {
      exportType: 'life_events',
      ...exportMeta(),
      totalEvents: events.length,
      events,
    }
    downloadJSON(data, buildFilename('giniai_life_events'))
  }

  // --- 6. Wealth Distribution Snapshots ---
  /** Per-agent wealth at current tick + wealth history arrays */
  function exportWealthData(): void {
    if (!worldState.value) return
    const wealthSnapshot = worldState.value.agents.map(a => ({
      id: a.id,
      state: a.state,
      age: a.age,
      education: a.education,
      gender: a.gender,
      wealth: a.wealth,
      income: a.income,
      tickEarnings: a.tickEarnings,
      satisfaction: a.satisfaction,
      creditScore: a.creditScore,
      loan: a.loan,
      businessDebt: a.businessDebt,
      children: a.children,
      partnerId: a.partnerId,
      wealthHistory: a.wealthHistory,
    }))
    const data = {
      exportType: 'wealth_data',
      ...exportMeta(),
      totalAgents: wealthSnapshot.length,
      agents: wealthSnapshot,
    }
    downloadJSON(data, buildFilename('giniai_wealth'))
  }

  // --- 7. Export ALL as separate files (multi-download) ---
  /** Downloads 6 separate JSON files for comprehensive analysis */
  function exportAllSeparate(): void {
    if (!worldState.value) return
    const prefix = buildBatchPrefix()

    const files = [
      {
        filename: `${prefix}_params.json`,
        data: {
          exportType: 'parameters',
          ...exportMeta(),
          defaultParams: DEFAULT_PARAMS,
        },
      },
      {
        filename: `${prefix}_timeseries.json`,
        data: {
          exportType: 'timeseries',
          ...exportMeta(),
          totalTicks: fullMetricsArchive.value.length,
          metrics: fullMetricsArchive.value,
        },
      },
      {
        filename: `${prefix}_agents.json`,
        data: {
          exportType: 'agents',
          ...exportMeta(),
          totalAgents: worldState.value.agents.length,
          agents: worldState.value.agents.map(a =>
            fullAgentExport(a as unknown as Record<string, unknown>)
          ),
        },
      },
      {
        filename: `${prefix}_locations.json`,
        data: {
          exportType: 'locations',
          ...exportMeta(),
          totalLocations: worldState.value.locations.length,
          locations: worldState.value.locations,
        },
      },
      {
        filename: `${prefix}_life_events.json`,
        data: (() => {
          const events: { agentId: string; tick: number; type: string; description: string }[] = []
          for (const agent of worldState.value!.agents) {
            for (const evt of agent.lifeEvents) {
              events.push({ agentId: agent.id, tick: evt.tick, type: evt.type, description: evt.description })
            }
          }
          events.sort((a, b) => a.tick - b.tick)
          return { exportType: 'life_events', ...exportMeta(), totalEvents: events.length, events }
        })(),
      },
      {
        filename: `${prefix}_wealth.json`,
        data: {
          exportType: 'wealth_data',
          ...exportMeta(),
          totalAgents: worldState.value.agents.length,
          agents: worldState.value.agents.map(a => ({
            id: a.id, state: a.state, age: a.age, education: a.education, gender: a.gender,
            wealth: a.wealth, income: a.income, tickEarnings: a.tickEarnings, satisfaction: a.satisfaction,
            creditScore: a.creditScore, loan: a.loan, businessDebt: a.businessDebt,
            children: a.children, partnerId: a.partnerId, wealthHistory: a.wealthHistory,
          })),
        },
      },
    ]

    downloadMultipleJSON(files)
  }

  // --- Legacy single-file exports (kept for backward compatibility) ---
  function exportInitialSnapshot(): void {
    if (!initialSnapshot) return
    const data = {
      exportType: 'initial_snapshot',
      ...exportMeta(),
      snapshot: sanitizeWorldStateForExport(initialSnapshot as unknown as Record<string, unknown>),
    }
    downloadJSON(data, buildFilename('giniai_snapshot_initial'))
  }

  function exportFinalSnapshot(): void {
    if (!worldState.value) return
    const data = {
      exportType: 'final_snapshot',
      ...exportMeta(),
      snapshot: sanitizeWorldStateForExport(worldState.value as unknown as Record<string, unknown>),
    }
    downloadJSON(data, buildFilename('giniai_snapshot_final'))
  }

  // --- Timer management ---
  // All speeds use 1 tick per interval with adjusted interval duration.
  // Fast speeds (≥1): shorter interval (base / speed), min 5ms
  // Slow speeds (<1): longer interval (base / speed)
  // This ensures the render loop sees every tick for smooth animation.
  function startTimer() {
    stopTimer()
    const interval = Math.max(5, tickInterval.value / speed.value)
    timer = setInterval(() => {
      step()
    }, interval)
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  // --- Event bus listeners ---
  eventBus.on('playback:play', play)
  eventBus.on('playback:pause', pause)
  eventBus.on('playback:stop', () => { stop() })
  eventBus.on('playback:step-forward', step)

  return {
    // State
    engine,
    worldState,
    metricsHistory,
    params,
    isPlaying,
    speed,
    tickInterval,
    // Getters
    currentTick,
    currentMetrics,
    agents,
    locations,
    hasData,
    // Actions
    init,
    step,
    play,
    pause,
    stop,
    setSpeed,
    updateParams,
    getAgent,
    // Export — granular
    exportParams,
    exportTimeSeries,
    exportAgents,
    exportLocations,
    exportLifeEvents,
    exportWealthData,
    exportAllSeparate,
    // Export — legacy
    exportInitialSnapshot,
    exportFinalSnapshot,
  }
})
