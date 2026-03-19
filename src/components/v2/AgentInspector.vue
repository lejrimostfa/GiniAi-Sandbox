<script setup lang="ts">
// --- V2 Agent Inspector ---
// Shows detailed info about the selected/hovered agent
// Wealth sparkline, life event log, stats
// Connected to event bus for cell:selected / cell:hovered

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSimStore } from '../../stores/v2SimulationStore'
import { useChatStore } from '../../stores/chatStore'
import type { Agent } from '../../simulation/types'
import eventBus from '../../events/eventBus'

const sim = useSimStore()
const chatStore = useChatStore()
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
  hoveredId.value = null
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
        <button class="inspector__chat-btn" @click="chatStore.openAgentChat(displayAgent.id)" title="Chat with this agent">
          💬
        </button>
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

      <!-- Religion Profile -->
      <div class="inspector__civic" v-if="displayAgent.religion">
        <span class="inspector__civic-label">Religion Profile</span>
        <div class="civic-grid">
          <div class="civic-trait">
            <span class="civic-trait__name">Affiliation</span>
            <span class="civic-trait__val" style="text-transform: capitalize; font-weight: 600;">{{ displayAgent.religion.affiliation }}</span>
          </div>
          <div class="civic-trait">
            <span class="civic-trait__name">Religiosity</span>
            <div class="civic-trait__bar">
              <div class="civic-trait__fill civic-trait__fill--purple" :style="{ width: (displayAgent.religion.religiosity * 100) + '%' }"></div>
            </div>
            <span class="civic-trait__val">{{ (displayAgent.religion.religiosity * 100).toFixed(0) }}%</span>
          </div>
          <div class="civic-trait">
            <span class="civic-trait__name">Practice</span>
            <div class="civic-trait__bar">
              <div class="civic-trait__fill civic-trait__fill--blue" :style="{ width: (displayAgent.religion.practiceLevel * 100) + '%' }"></div>
            </div>
            <span class="civic-trait__val">{{ (displayAgent.religion.practiceLevel * 100).toFixed(0) }}%</span>
          </div>
          <div class="civic-trait">
            <span class="civic-trait__name">Community</span>
            <div class="civic-trait__bar">
              <div class="civic-trait__fill civic-trait__fill--green" :style="{ width: (displayAgent.religion.communityEmbeddedness * 100) + '%' }"></div>
            </div>
            <span class="civic-trait__val">{{ (displayAgent.religion.communityEmbeddedness * 100).toFixed(0) }}%</span>
          </div>
          <div class="civic-trait">
            <span class="civic-trait__name">Transmission</span>
            <div class="civic-trait__bar">
              <div class="civic-trait__fill civic-trait__fill--teal" :style="{ width: (displayAgent.religion.religiousTransmissionStrength * 100) + '%' }"></div>
            </div>
            <span class="civic-trait__val">{{ (displayAgent.religion.religiousTransmissionStrength * 100).toFixed(0) }}%</span>
          </div>
          <div class="civic-trait">
            <span class="civic-trait__name">Discrimination</span>
            <div class="civic-trait__bar">
              <div class="civic-trait__fill civic-trait__fill--red" :style="{ width: (displayAgent.religion.discriminationExposure * 100) + '%' }"></div>
            </div>
            <span class="civic-trait__val">{{ (displayAgent.religion.discriminationExposure * 100).toFixed(0) }}%</span>
          </div>
        </div>
      </div>

      <!-- Civic Profile -->
      <div class="inspector__civic" v-if="displayAgent.civicProfile">
        <span class="inspector__civic-label">Civic Profile</span>
        <div class="civic-grid">
          <div class="civic-trait">
            <span class="civic-trait__name">Econ. Insecurity</span>
            <div class="civic-trait__bar">
              <div class="civic-trait__fill civic-trait__fill--red" :style="{ width: (displayAgent.civicProfile.economicInsecurity * 100) + '%' }"></div>
            </div>
            <span class="civic-trait__val">{{ (displayAgent.civicProfile.economicInsecurity * 100).toFixed(0) }}%</span>
          </div>
          <div class="civic-trait">
            <span class="civic-trait__name">Inst. Trust</span>
            <div class="civic-trait__bar">
              <div class="civic-trait__fill civic-trait__fill--blue" :style="{ width: (displayAgent.civicProfile.institutionalTrust * 100) + '%' }"></div>
            </div>
            <span class="civic-trait__val">{{ (displayAgent.civicProfile.institutionalTrust * 100).toFixed(0) }}%</span>
          </div>
          <div class="civic-trait">
            <span class="civic-trait__name">Auto. Shock</span>
            <div class="civic-trait__bar">
              <div class="civic-trait__fill civic-trait__fill--orange" :style="{ width: (displayAgent.civicProfile.automationShock * 100) + '%' }"></div>
            </div>
            <span class="civic-trait__val">{{ (displayAgent.civicProfile.automationShock * 100).toFixed(0) }}%</span>
          </div>
          <div class="civic-trait">
            <span class="civic-trait__name">Auth. Tendency</span>
            <div class="civic-trait__bar">
              <div class="civic-trait__fill civic-trait__fill--purple" :style="{ width: (displayAgent.civicProfile.authoritarianTendency * 100) + '%' }"></div>
            </div>
            <span class="civic-trait__val">{{ (displayAgent.civicProfile.authoritarianTendency * 100).toFixed(0) }}%</span>
          </div>
          <div class="civic-trait">
            <span class="civic-trait__name">Conformity</span>
            <div class="civic-trait__bar">
              <div class="civic-trait__fill civic-trait__fill--teal" :style="{ width: (displayAgent.civicProfile.conformity * 100) + '%' }"></div>
            </div>
            <span class="civic-trait__val">{{ (displayAgent.civicProfile.conformity * 100).toFixed(0) }}%</span>
          </div>
          <div class="civic-trait">
            <span class="civic-trait__name">Pol. Attention</span>
            <div class="civic-trait__bar">
              <div class="civic-trait__fill civic-trait__fill--green" :style="{ width: (displayAgent.civicProfile.politicalAttention * 100) + '%' }"></div>
            </div>
            <span class="civic-trait__val">{{ (displayAgent.civicProfile.politicalAttention * 100).toFixed(0) }}%</span>
          </div>
        </div>
        <!-- Opinion state (if referendum active) -->
        <div v-if="displayAgent.opinionState" class="civic-opinion">
          <div class="civic-opinion__row">
            <span>Opinion:</span>
            <strong :style="{ color: displayAgent.opinionState.label === 'YES' ? '#66bb6a' : displayAgent.opinionState.label === 'NO' ? '#ef5350' : '#ffa726' }">
              {{ displayAgent.opinionState.label }}
            </strong>
          </div>
          <div class="civic-opinion__row">
            <span>Score:</span>
            <span>{{ displayAgent.opinionState.score.toFixed(2) }}</span>
          </div>
          <div class="civic-opinion__row">
            <span>Conviction:</span>
            <span>{{ (displayAgent.opinionState.conviction * 100).toFixed(0) }}%</span>
          </div>
          <div v-if="displayAgent.opinionState.vote" class="civic-opinion__row">
            <span>Vote:</span>
            <strong>{{ displayAgent.opinionState.vote }}</strong>
          </div>
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

  &__chat-btn {
    background: rgba(91, 143, 185, 0.15);
    border: 1px solid rgba(91, 143, 185, 0.3);
    color: $text-secondary;
    cursor: pointer;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 3px;
    &:hover { background: rgba(91, 143, 185, 0.3); color: $text-primary; }
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

// --- Civic Profile styles ---
.inspector__civic {
  margin-bottom: $space-md;

  &-label {
    font-size: 10px;
    color: $text-muted;
    display: block;
    margin-bottom: 4px;
  }
}

.civic-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.civic-trait {
  display: flex;
  align-items: center;
  gap: 6px;

  &__name {
    font-size: 9px;
    color: $text-muted;
    min-width: 80px;
    text-align: right;
  }

  &__bar {
    flex: 1;
    height: 4px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 2px;
    overflow: hidden;
  }

  &__fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s;

    &--red    { background: #ef5350; }
    &--blue   { background: #42a5f5; }
    &--orange { background: #ffa726; }
    &--purple { background: #ab47bc; }
    &--teal   { background: #26a69a; }
    &--green  { background: #66bb6a; }
  }

  &__val {
    font-size: 9px;
    font-family: monospace;
    color: $text-secondary;
    min-width: 28px;
    text-align: right;
  }
}

.civic-opinion {
  margin-top: 6px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;

  &__row {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: $text-secondary;
    padding: 1px 0;
  }
}
</style>
