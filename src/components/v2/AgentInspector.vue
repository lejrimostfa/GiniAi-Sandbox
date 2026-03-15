<script setup lang="ts">
// --- V2 Agent Inspector ---
// Shows detailed info about the selected/hovered agent
// Wealth sparkline, life event log, stats
// Connected to event bus for cell:selected / cell:hovered

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSimStore } from '../../stores/v2SimulationStore'
import type { Agent } from '../../simulation/types'
import eventBus from '../../events/eventBus'

const sim = useSimStore()
const selectedId = ref<string | null>(null)
const hoveredId = ref<string | null>(null)

// Listen for selection/hover events from the scene
onMounted(() => {
  eventBus.on('cell:selected', (data: unknown) => {
    const agent = data as Agent
    if (agent?.id) selectedId.value = agent.id
  })
  eventBus.on('cell:hovered', (data: unknown) => {
    const agent = data as Agent
    if (agent?.id) hoveredId.value = agent.id
  })
  eventBus.on('cell:deselected', () => {
    selectedId.value = null
  })
})

onUnmounted(() => {
  eventBus.off('cell:selected')
  eventBus.off('cell:hovered')
  eventBus.off('cell:deselected')
})

// Show selected agent, fallback to hovered
const displayAgent = computed<Agent | null>(() => {
  const id = selectedId.value ?? hoveredId.value
  if (!id) return null
  return sim.worldState?.agents.find((a) => a.id === id) ?? null
})

const isSelected = computed(() => !!selectedId.value)

// Sparkline SVG path from wealth history
const sparklinePath = computed(() => {
  const agent = displayAgent.value
  if (!agent || agent.wealthHistory.length < 2) return ''
  const data = agent.wealthHistory
  const maxVal = Math.max(...data, 1)
  const minVal = Math.min(...data, 0)
  const range = maxVal - minVal || 1
  const w = 180
  const h = 40
  const stepX = w / (data.length - 1)

  return data.map((v, i) => {
    const x = i * stepX
    const y = h - ((v - minVal) / range) * h
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
})

// State color
const stateColor = computed(() => {
  const s = displayAgent.value?.state
  if (s === 'employed') return '#5B8FB9'
  if (s === 'unemployed') return '#E07A5F'
  if (s === 'business_owner') return '#9B72AA'
  if (s === 'retired') return '#707080'
  if (s === 'police') return '#1565C0'
  if (s === 'criminal') return '#CC3333'
  if (s === 'prisoner') return '#8B4513'
  return '#888'
})

// State label
const stateLabel = computed(() => {
  const s = displayAgent.value?.state
  if (s === 'employed') return 'Employed'
  if (s === 'unemployed') return 'Unemployed'
  if (s === 'business_owner') return 'Business Owner'
  if (s === 'retired') return 'Retired'
  if (s === 'child') return 'Child'
  if (s === 'criminal') return 'Criminal'
  if (s === 'prisoner') return 'Prisoner'
  if (s === 'police') return 'Police'
  if (s === 'dead') return 'Dead'
  return '—'
})

const actionLabels: Record<string, string> = {
  idle: 'Idle',
  working: 'Working',
  shopping: 'Shopping',
  job_seeking: 'Job Seeking',
  studying: 'Studying',
  commuting: 'Commuting',
  resting: 'Resting',
  stealing: 'Stealing',
  dying: 'Dying',
  hauling: 'Hauling',
  patrolling: 'Patrolling',
  arrested: 'Arrested',
  striking: 'On Strike',
}

const actionLabel = computed(() => {
  const a = displayAgent.value?.currentAction
  return a ? (actionLabels[a] ?? a) : '—'
})

const targetLabel = computed(() => {
  const agent = displayAgent.value
  if (!agent?.targetLocationId) return '—'
  const loc = sim.worldState?.locations.find((l) => l.id === agent.targetLocationId)
  if (!loc) return agent.targetLocationId
  const typeLabels: Record<string, string> = {
    home: '🏠 Home', workplace: '🏢 Work', market: '🛒 Market',
    school: '🎓 School', government: '🏛️ Gov.', resource: '🌳 Resource',
    factory: '🏭 Factory', bank: '🏦 Bank',
  }
  return typeLabels[loc.type] ?? loc.type
})

// Fractional age: base age + fraction of current year elapsed
const fractionalAge = computed(() => {
  const agent = displayAgent.value
  if (!agent) return '—'
  const tpy = sim.params?.ticksPerYear ?? 52
  const tickInYear = sim.currentTick % tpy
  const frac = agent.age + tickInYear / tpy
  return frac.toFixed(1)
})

// Wealth history min/max for Y-axis display
const wealthMin = computed(() => {
  const d = displayAgent.value?.wealthHistory
  if (!d || d.length < 2) return 0
  return Math.round(Math.min(...d))
})
const wealthMax = computed(() => {
  const d = displayAgent.value?.wealthHistory
  if (!d || d.length < 2) return 0
  return Math.round(Math.max(...d))
})

function deselect() {
  selectedId.value = null
  eventBus.emit('cell:deselected')
}
</script>

<template>
  <div class="inspector">
    <h3 class="inspector__title">
      AGENT INSPECTOR
      <span v-if="isSelected" class="inspector__following">Following</span>
    </h3>

    <div v-if="!displayAgent" class="inspector__empty">
      Click an agent to inspect
    </div>

    <template v-else>
      <div class="inspector__header">
        <span class="inspector__id">{{ displayAgent.id }}</span>
        <button v-if="isSelected" class="inspector__deselect" @click="deselect" title="Deselect">
          &#10005;
        </button>
      </div>

      <!-- Stats grid -->
      <div class="inspector__stats">
        <div class="stat">
          <span class="stat__label">State</span>
          <span class="stat__value" :style="{ color: stateColor }">{{ stateLabel }}</span>
        </div>
        <div class="stat">
          <span class="stat__label">Age</span>
          <span class="stat__value">{{ fractionalAge }} yrs</span>
        </div>
        <div class="stat">
          <span class="stat__label">Education</span>
          <span class="stat__value">{{ displayAgent.education }}</span>
        </div>
        <div class="stat">
          <span class="stat__label">Wealth</span>
          <span class="stat__value">${{ Math.round(displayAgent.wealth) }}</span>
        </div>
        <div class="stat">
          <span class="stat__label">Action</span>
          <span class="stat__value">{{ actionLabel }}</span>
        </div>
        <div class="stat">
          <span class="stat__label">Destination</span>
          <span class="stat__value">{{ targetLabel }}</span>
        </div>
        <div class="stat">
          <span class="stat__label">Income</span>
          <span class="stat__value">${{ Math.round(displayAgent.income) }}/tick</span>
        </div>
        <div class="stat">
          <span class="stat__label">Earnings</span>
          <span class="stat__value">${{ Math.round(displayAgent.tickEarnings) }}/tick</span>
        </div>
        <div class="stat">
          <span class="stat__label">Satisfaction</span>
          <span class="stat__value">{{ (displayAgent.satisfaction * 100).toFixed(0) }}%</span>
        </div>
        <div class="stat">
          <span class="stat__label">Gender</span>
          <span class="stat__value">{{ displayAgent.gender === 'female' ? '♀' : '♂' }}</span>
        </div>
        <div class="stat">
          <span class="stat__label">Partner</span>
          <span class="stat__value">{{ displayAgent.partnerId ? '💍' : '—' }}</span>
        </div>
        <div class="stat">
          <span class="stat__label">Children</span>
          <span class="stat__value">{{ displayAgent.children > 0 ? '👶×' + displayAgent.children : '—' }}</span>
        </div>
        <div class="stat">
          <span class="stat__label">Carrying</span>
          <span class="stat__value">{{ displayAgent.carryingResource ? '📦' : '—' }}</span>
        </div>
        <div class="stat">
          <span class="stat__label">Loan</span>
          <span class="stat__value">{{ displayAgent.loan > 0 ? '$' + Math.round(displayAgent.loan) : '—' }}</span>
        </div>
        <div class="stat">
          <span class="stat__label">Credit</span>
          <span class="stat__value">{{ (displayAgent.creditScore * 100).toFixed(0) }}%</span>
        </div>
        <div class="stat" v-if="displayAgent.ownedBusinessId">
          <span class="stat__label">Business</span>
          <span class="stat__value" style="color: #9B72AA">🏢 Owner</span>
        </div>
        <div class="stat" v-if="displayAgent.businessDebt > 0">
          <span class="stat__label">Biz Debt</span>
          <span class="stat__value" style="color: #E07A5F">${{ Math.round(displayAgent.businessDebt) }}</span>
        </div>
        <div class="stat" v-if="displayAgent.ownedBusinessId">
          <span class="stat__label">Biz Revenue</span>
          <span class="stat__value" style="color: #81C784">${{ Math.round(displayAgent.businessRevenue) }}</span>
        </div>
        <!-- Housing -->
        <div class="stat">
          <span class="stat__label">Housing</span>
          <span class="stat__value" :style="{ color: displayAgent.homeOwned ? '#81C784' : displayAgent.homeDebt > 0 ? '#FFA726' : '#E07A5F' }">
            {{ displayAgent.homeOwned ? '🏠 Owned' : displayAgent.homeDebt > 0 ? '🏠 Mortgage' : '🏠 Renting' }}
          </span>
        </div>
        <div class="stat">
          <span class="stat__label">Home Value</span>
          <span class="stat__value">${{ Math.round(displayAgent.homeValue) }}</span>
        </div>
        <div class="stat" v-if="displayAgent.homeDebt > 0">
          <span class="stat__label">Mortgage</span>
          <span class="stat__value" style="color: #FFA726">${{ Math.round(displayAgent.homeDebt) }}</span>
        </div>
      </div>

      <!-- Wealth sparkline with Y-axis labels -->
      <div class="inspector__sparkline">
        <span class="inspector__sparkline-label">Wealth History</span>
        <div class="sparkline-container">
          <div class="sparkline-yaxis">
            <span>${{ wealthMax }}</span>
            <span>${{ wealthMin }}</span>
          </div>
          <svg viewBox="0 0 180 40" class="sparkline-svg">
            <path :d="sparklinePath" fill="none" :stroke="stateColor" stroke-width="1.5" />
          </svg>
        </div>
      </div>

      <!-- Life events -->
      <div class="inspector__events">
        <span class="inspector__events-label">Life Events</span>
        <div class="event-list">
          <div
            v-for="(evt, idx) in displayAgent.lifeEvents.slice(-8).reverse()"
            :key="idx"
            class="event-item"
          >
            <span class="event-tick">t{{ evt.tick }}</span>
            <span class="event-desc">{{ evt.description }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.inspector {
  padding: $space-md;

  &__title {
    font-size: $font-size-xs;
    font-weight: 600;
    color: $text-muted;
    letter-spacing: 0.08em;
    margin: 0 0 $space-sm 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__following {
    font-size: 10px;
    background: rgba(91, 143, 185, 0.2);
    color: #5B8FB9;
    padding: 2px 6px;
    border-radius: 8px;
    letter-spacing: 0;
    font-weight: 500;
  }

  &__empty {
    color: $text-muted;
    font-size: $font-size-sm;
    text-align: center;
    padding: $space-lg 0;
  }

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: $space-sm;
  }

  &__id {
    font-family: monospace;
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__deselect {
    background: none;
    border: none;
    color: $text-muted;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    &:hover { color: $text-primary; }
  }

  &__stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-bottom: $space-md;
  }

  &__sparkline {
    margin-bottom: $space-md;

    &-label {
      font-size: 10px;
      color: $text-muted;
      display: block;
      margin-bottom: 4px;
    }
  }

  &__events {
    &-label {
      font-size: 10px;
      color: $text-muted;
      display: block;
      margin-bottom: 4px;
    }
  }
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;

  &__label {
    font-size: 10px;
    color: $text-muted;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__value {
    font-size: $font-size-sm;
    font-family: monospace;
    color: $text-primary;
  }
}

.sparkline-container {
  display: flex;
  align-items: stretch;
  gap: 4px;
}

.sparkline-yaxis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 8px;
  font-family: monospace;
  color: $text-muted;
  min-width: 36px;
  text-align: right;
  padding: 1px 0;
}

.sparkline-svg {
  flex: 1;
  height: 40px;
  background: rgba(30, 30, 50, 0.4);
  border-radius: 4px;
}

.event-list {
  max-height: 160px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.event-item {
  display: flex;
  gap: 6px;
  font-size: 10px;
  line-height: 1.4;
}

.event-tick {
  color: $text-muted;
  font-family: monospace;
  min-width: 32px;
  flex-shrink: 0;
}

.event-desc {
  color: $text-secondary;
}
</style>
