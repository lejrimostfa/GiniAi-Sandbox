// ============================================================
// Civic Store — Pinia store for referendum state
// Bridges the CivicEngine with Vue UI components
// ============================================================

import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import { useSimStore } from './v2SimulationStore'
import type { Referendum, ReferendumTopic, ReferendumResult, CivicWeightVector } from '../simulation/civic/types'
import {
  createReferendum,
  initializeOpinions,
  formBlocs,
  runInfluenceRound,
  runVote,
  computeBreakdowns,
} from '../simulation/civic/CivicEngine'
import { createRNG } from '../simulation/utils'
import { generateWeightsFromQuestion, checkOllamaStatus } from '../simulation/civic/LocalLLMBridge'
import {
  refreshWorldContext,
  type WorldContext,
} from '../simulation/civic/WorldContextProvider'

export const useCivicStore = defineStore('civic', () => {
  // --- State ---
  const currentReferendum = ref<Referendum | null>(null)
  const referendumHistory = ref<ReferendumResult[]>([])
  const llmLoading = ref(false)
  const llmError = ref<string | null>(null)
  const lastCustomWeights = shallowRef<CivicWeightVector | null>(null)
  const lastWeightsFromLLM = ref(false)
  const ollamaAvailable = ref<boolean | null>(null) // null = not checked yet
  const worldContext = shallowRef<WorldContext | null>(null)
  const worldContextLoading = ref(false)
  const worldContextError = ref<string | null>(null)

  // Separate RNG for civic layer (seeded from sim tick for reproducibility)
  let civicRng = createRNG(12345)

  // --- Getters ---
  const isActive = computed(() => currentReferendum.value !== null)
  const phase = computed(() => currentReferendum.value?.phase ?? null)
  const blocs = computed(() => currentReferendum.value?.blocs ?? [])
  const result = computed(() => currentReferendum.value?.result ?? null)
  const isLLMLoading = computed(() => llmLoading.value)

  // --- Actions ---

  /** Launch a new referendum on a given topic */
  function launchReferendum(topic: ReferendumTopic) {
    const sim = useSimStore()
    if (!sim.engine) return

    // Seed civic RNG from current tick for reproducibility
    civicRng = createRNG(sim.currentTick + 7919)

    const agents = sim.engine.agents

    // Clear any previous opinion states
    for (const agent of agents) {
      agent.opinionState = null
    }

    // Create referendum
    const referendum = createReferendum(topic)
    currentReferendum.value = referendum

    // Initialize opinions from civic profiles
    initializeOpinions(agents, referendum, civicRng)

    // Form initial blocs
    formBlocs(agents, referendum)

    // Trigger reactivity
    currentReferendum.value = { ...referendum }
  }

  /** Run one influence round */
  function runDebateRound() {
    const sim = useSimStore()
    if (!sim.engine || !currentReferendum.value) return
    if (currentReferendum.value.phase !== 'influence') return
    if (currentReferendum.value.influenceRound >= currentReferendum.value.maxRounds) return

    const agents = sim.engine.agents
    const locations = sim.engine.locations
    const referendum = currentReferendum.value

    runInfluenceRound(agents, locations, referendum, civicRng)

    // Refresh blocs after influence
    formBlocs(agents, referendum)

    // Trigger reactivity
    currentReferendum.value = { ...referendum }
  }

  /** Execute the vote phase */
  function executeVote() {
    const sim = useSimStore()
    if (!sim.engine || !currentReferendum.value) return

    const agents = sim.engine.agents
    const referendum = currentReferendum.value

    // Run vote
    runVote(agents, referendum, civicRng)

    // Compute breakdowns
    const result = computeBreakdowns(agents, referendum)

    // Add to history
    referendumHistory.value.push(result)

    // Add voted life events with correct tick
    for (const agent of agents) {
      if (agent.opinionState?.voted && agent.opinionState.vote !== 'ABSTAIN') {
        agent.lifeEvents.push({
          tick: sim.currentTick,
          type: 'voted',
          description: `Voted ${agent.opinionState.vote} on "${referendum.question}"`,
        })
      }
    }

    // Trigger reactivity
    currentReferendum.value = { ...referendum }
  }

  /** Run full referendum: init → all rounds → vote → results */
  function runFullReferendum(topic: ReferendumTopic) {
    launchReferendum(topic)
    if (!currentReferendum.value) return

    // Run all influence rounds
    for (let i = 0; i < currentReferendum.value.maxRounds; i++) {
      runDebateRound()
    }

    // Execute vote
    executeVote()
  }

  /** Launch a custom referendum with a free-text question.
   *  Calls Ollama to generate the weight vector (1 LLM call).
   *  Falls back to neutral weights if Ollama is unavailable. */
  async function launchCustomReferendum(question: string) {
    const sim = useSimStore()
    if (!sim.engine || !question.trim()) return

    llmLoading.value = true
    llmError.value = null

    try {
      const { weights, fromLLM } = await generateWeightsFromQuestion(question)
      lastCustomWeights.value = weights
      lastWeightsFromLLM.value = fromLLM

      // Seed civic RNG from current tick
      civicRng = createRNG(sim.currentTick + 7919)
      const agents = sim.engine.agents

      // Clear previous opinion states
      for (const agent of agents) {
        agent.opinionState = null
      }

      // Create custom referendum with generated weights
      const referendum = createReferendum('custom', question.trim(), weights)
      currentReferendum.value = referendum

      // Initialize opinions from civic profiles
      initializeOpinions(agents, referendum, civicRng)

      // Form initial blocs
      formBlocs(agents, referendum)

      // Trigger reactivity
      currentReferendum.value = { ...referendum }

      if (!fromLLM) {
        llmError.value = 'Ollama unavailable — used neutral fallback weights'
      }
    } catch (err: unknown) {
      llmError.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      llmLoading.value = false
    }
  }

  /** Check Ollama availability (call once on mount) */
  async function checkOllama() {
    ollamaAvailable.value = await checkOllamaStatus()
  }

  /** Refresh real-world context from LLM + news API.
   *  Called once on app start; cached for the session. */
  async function loadWorldContext() {
    worldContextLoading.value = true
    worldContextError.value = null
    try {
      const ctx = await refreshWorldContext()
      worldContext.value = ctx
      if (!ctx.baseContext && ctx.headlines.length === 0) {
        worldContextError.value = 'No world context available'
      }
    } catch (err: unknown) {
      worldContextError.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      worldContextLoading.value = false
    }
  }

  /** Clear current referendum and reset agent opinion states */
  function clearReferendum() {
    const sim = useSimStore()
    if (sim.engine) {
      for (const agent of sim.engine.agents) {
        agent.opinionState = null
      }
    }
    currentReferendum.value = null
  }

  return {
    // State
    currentReferendum,
    referendumHistory,
    llmLoading,
    llmError,
    lastCustomWeights,
    lastWeightsFromLLM,
    ollamaAvailable,
    worldContext,
    worldContextLoading,
    worldContextError,
    // Getters
    isActive,
    phase,
    blocs,
    result,
    isLLMLoading,
    // Actions
    launchReferendum,
    launchCustomReferendum,
    runDebateRound,
    executeVote,
    runFullReferendum,
    clearReferendum,
    checkOllama,
    loadWorldContext,
  }
})
