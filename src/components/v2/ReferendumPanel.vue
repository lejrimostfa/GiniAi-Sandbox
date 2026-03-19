<script setup lang="ts">
// --- Referendum Panel ---
// Launch referendums (preset or custom), run influence rounds, execute vote
// Connected to civicStore + LocalLLMBridge via store

import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useCivicStore } from '../../stores/civicStore'
import { useSimStore } from '../../stores/v2SimulationStore'
import type { ReferendumTopic } from '../../simulation/civic/types'

const civic = useCivicStore()
const sim = useSimStore()

const canLaunch = computed(() => sim.hasData && !civic.isActive)
const canRunRound = computed(() =>
  civic.isActive &&
  civic.phase === 'influence' &&
  (civic.currentReferendum?.influenceRound ?? 0) < (civic.currentReferendum?.maxRounds ?? 3)
)
const canVote = computed(() => civic.isActive && civic.phase === 'influence')

const topics: { key: ReferendumTopic; label: string; icon: string }[] = [
  { key: 'immigration', label: 'Immigration', icon: '🌍' },
  { key: 'redistribution', label: 'Redistribution', icon: '💰' },
  { key: 'automation_control', label: 'Automation Control', icon: '🤖' },
]

// --- Custom question ---
const customQuestion = ref('')
const showWeights = ref(false)
const elapsedSeconds = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null

async function launchCustom() {
  if (!customQuestion.value.trim()) return
  await civic.launchCustomReferendum(customQuestion.value.trim())
  customQuestion.value = ''
}

// Elapsed timer for LLM loading
watch(() => civic.llmLoading, (loading) => {
  if (loading) {
    elapsedSeconds.value = 0
    elapsedTimer = setInterval(() => { elapsedSeconds.value++ }, 1000)
  } else if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
})

onMounted(() => {
  civic.checkOllama()
  civic.loadWorldContext()
})
onUnmounted(() => { if (elapsedTimer) clearInterval(elapsedTimer) })
</script>

<template>
  <div class="ref-panel">
    <h3 class="ref-panel__title">🗳️ REFERENDUM</h3>

    <!-- Launch buttons -->
    <div v-if="canLaunch" class="ref-panel__launch">
      <p class="ref-panel__hint">Choose a topic to launch a referendum:</p>
      <button
        v-for="t in topics"
        :key="t.key"
        class="ref-panel__topic-btn"
        @click="civic.launchReferendum(t.key)"
      >
        {{ t.icon }} {{ t.label }}
      </button>

      <!-- Custom question input -->
      <div class="ref-panel__custom">
        <p class="ref-panel__hint">Or ask any question:</p>
        <div class="ref-panel__custom-row">
          <input
            v-model="customQuestion"
            type="text"
            class="ref-panel__custom-input"
            placeholder="e.g. Should we ban cars from downtown?"
            :disabled="civic.isLLMLoading"
            @keydown.enter="launchCustom"
          />
          <button
            class="ref-panel__btn ref-panel__btn--custom"
            :disabled="!customQuestion.trim() || civic.isLLMLoading"
            @click="launchCustom"
          >
            {{ civic.isLLMLoading ? '⏳' : '🚀' }}
          </button>
        </div>
        <!-- Ollama + World Context status -->
        <div class="ref-panel__ollama-status">
          <span v-if="civic.ollamaAvailable === null">⏳ Checking Ollama...</span>
          <span v-else-if="civic.ollamaAvailable" class="ref-panel__ollama-ok">🟢 Ollama connected</span>
          <span v-else class="ref-panel__ollama-off">🔴 Ollama offline — will use fallback weights</span>
        </div>
        <div class="ref-panel__world-status">
          <span v-if="civic.worldContextLoading" class="ref-panel__world-loading">🌍 Loading world context...</span>
          <span v-else-if="civic.worldContext?.baseContext" class="ref-panel__world-ok">
            🌐 World context loaded
            <span v-if="civic.worldContext.headlines.length">(+{{ civic.worldContext.headlines.length }} headlines)</span>
          </span>
          <span v-else-if="civic.worldContextError" class="ref-panel__world-err">⚠️ {{ civic.worldContextError }}</span>
        </div>
        <!-- Loading indicator -->
        <div v-if="civic.isLLMLoading" class="ref-panel__loading">
          🧠 Generating weights... <strong>{{ elapsedSeconds }}s</strong>
          <div class="ref-panel__loading-hint">First call may take 1–2 min (model cold start)</div>
        </div>
      </div>
    </div>

    <!-- Active referendum -->
    <div v-else-if="civic.isActive && civic.currentReferendum" class="ref-panel__active">
      <div class="ref-panel__question">{{ civic.currentReferendum.question }}</div>

      <div class="ref-panel__phase">
        Phase: <strong>{{ civic.currentReferendum.phase }}</strong>
        <span v-if="civic.phase === 'influence'">
          · Round {{ civic.currentReferendum.influenceRound }} / {{ civic.currentReferendum.maxRounds }}
        </span>
      </div>

      <!-- LLM weight info for custom referendums -->
      <div v-if="civic.currentReferendum?.topic === 'custom'" class="ref-panel__weight-info">
        <button class="ref-panel__weight-toggle" @click="showWeights = !showWeights">
          {{ civic.lastWeightsFromLLM ? '🧠 LLM weights' : '⚖️ Fallback weights' }}
          {{ showWeights ? '▾' : '▸' }}
        </button>
        <div v-if="showWeights && civic.lastCustomWeights" class="ref-panel__weight-grid">
          <div v-for="(val, key) in civic.lastCustomWeights" :key="key" class="ref-panel__weight-item">
            <span class="ref-panel__weight-label">{{ key }}</span>
            <span class="ref-panel__weight-val" :class="{ positive: val > 0, negative: val < 0 }">
              {{ val > 0 ? '+' : '' }}{{ (val as number).toFixed(2) }}
            </span>
          </div>
        </div>
      </div>

      <!-- LLM error -->
      <div v-if="civic.llmError" class="ref-panel__llm-error">
        ⚠️ {{ civic.llmError }}
      </div>

      <!-- Controls -->
      <div class="ref-panel__controls">
        <button
          v-if="canRunRound"
          class="ref-panel__btn ref-panel__btn--round"
          @click="civic.runDebateRound()"
        >
          ▶ Run Influence Round
        </button>
        <button
          v-if="canVote"
          class="ref-panel__btn ref-panel__btn--vote"
          @click="civic.executeVote()"
        >
          🗳️ Execute Vote
        </button>
        <button
          class="ref-panel__btn ref-panel__btn--clear"
          @click="civic.clearReferendum()"
        >
          ✕ Clear
        </button>
      </div>

      <!-- Quick run -->
      <div v-if="canLaunch" class="ref-panel__quick">
        <p class="ref-panel__hint">Or run everything at once:</p>
        <button
          v-for="t in topics"
          :key="t.key"
          class="ref-panel__topic-btn ref-panel__topic-btn--small"
          @click="civic.runFullReferendum(t.key)"
        >
          ⚡ {{ t.label }}
        </button>
      </div>
    </div>

    <!-- No sim -->
    <div v-else class="ref-panel__empty">
      Start a simulation first
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.ref-panel {
  padding: $space-sm;

  &__title {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: $text-secondary;
    margin-bottom: $space-xs;
  }

  &__hint {
    font-size: 0.7rem;
    color: $text-muted;
    margin-bottom: $space-xs;
  }

  &__launch {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__topic-btn {
    display: block;
    width: 100%;
    padding: 6px 10px;
    border: 1px solid $border-color;
    border-radius: 4px;
    background: $bg-panel;
    color: $text-primary;
    font-size: 0.75rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;

    &:hover {
      background: lighten($bg-panel, 5%);
    }

    &--small {
      padding: 4px 8px;
      font-size: 0.7rem;
    }
  }

  &__active {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__question {
    font-size: 0.8rem;
    font-weight: 600;
    color: $text-primary;
    line-height: 1.3;
  }

  &__phase {
    font-size: 0.7rem;
    color: $text-secondary;
  }

  &__controls {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  &__btn {
    padding: 5px 10px;
    border: 1px solid $border-color;
    border-radius: 4px;
    font-size: 0.7rem;
    cursor: pointer;
    transition: background 0.15s;

    &--round {
      background: #1a3a5c;
      color: #7ec8e3;
      &:hover { background: #244a70; }
    }
    &--vote {
      background: #1a5c3a;
      color: #7ee3a1;
      &:hover { background: #247048; }
    }
    &--clear {
      background: transparent;
      color: $text-muted;
      &:hover { background: rgba(255,255,255,0.05); }
    }
    &--custom {
      background: #4a1a5c;
      color: #c87ee3;
      min-width: 32px;
      &:hover { background: #5c2470; }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }
  }

  // --- Custom question ---
  &__custom {
    margin-top: 6px;
    border-top: 1px solid $border-color;
    padding-top: 6px;
  }

  &__custom-row {
    display: flex;
    gap: 4px;
  }

  &__custom-input {
    flex: 1;
    padding: 5px 8px;
    border: 1px solid $border-color;
    border-radius: 4px;
    background: darken($bg-panel, 3%);
    color: $text-primary;
    font-size: 0.7rem;
    outline: none;
    &::placeholder { color: $text-muted; }
    &:focus { border-color: #7e7ee3; }
    &:disabled { opacity: 0.5; }
  }

  &__ollama-status {
    font-size: 0.6rem;
    margin-top: 3px;
    color: $text-muted;
  }

  &__ollama-ok { color: #7ee3a1; }
  &__ollama-off { color: #e3a17e; }

  // --- Weight info (custom referendums) ---
  &__weight-info {
    margin-top: 2px;
  }

  &__weight-toggle {
    background: none;
    border: none;
    color: $text-secondary;
    font-size: 0.65rem;
    cursor: pointer;
    padding: 2px 0;
    &:hover { color: $text-primary; }
  }

  &__weight-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 8px;
    margin-top: 3px;
    padding: 4px 6px;
    background: darken($bg-panel, 2%);
    border-radius: 3px;
  }

  &__weight-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.6rem;
  }

  &__weight-label {
    color: $text-muted;
  }

  &__weight-val {
    font-family: monospace;
    &.positive { color: #7ee3a1; }
    &.negative { color: #e37e7e; }
  }

  &__loading {
    font-size: 0.7rem;
    color: #c87ee3;
    padding: 6px 8px;
    margin-top: 4px;
    background: rgba(74, 26, 92, 0.3);
    border-radius: 4px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  &__loading-hint {
    font-size: 0.6rem;
    color: $text-muted;
    margin-top: 2px;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  &__world-status {
    font-size: 0.65rem;
    margin-top: 2px;
  }

  &__world-loading {
    color: #7ec8e3;
    animation: pulse 1.5s ease-in-out infinite;
  }

  &__world-ok {
    color: #7ee3a1;
  }

  &__world-err {
    color: #e3c17e;
  }

  &__llm-error {
    font-size: 0.65rem;
    color: #e3c17e;
    padding: 3px 0;
  }

  &__empty {
    font-size: 0.7rem;
    color: $text-muted;
    font-style: italic;
  }
}
</style>
