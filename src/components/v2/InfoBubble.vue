<script setup lang="ts">
// --- Info Bubble ---
// Appears when clicking a location or agent in the 3D scene.
// Shows contextual description, live stats, and economic impact.
// Positioned near the click point, dismisses on click elsewhere.

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSimStore } from '../../stores/v2SimulationStore'
import eventBus from '../../events/eventBus'
import type { Location, LocationType, WorkplaceType } from '../../simulation/types'

const sim = useSimStore()

const visible = ref(false)
const posX = ref(0)
const posY = ref(0)
const locationId = ref<string | null>(null)

// ============================================================
// Location descriptions: what it does & economic impact
// ============================================================
const LOCATION_INFO: Record<LocationType, { icon: string; title: string; description: string; impact: string }> = {
  home: {
    icon: '🏠',
    title: 'Residential Area',
    description: 'Agents rest here between activities. Unemployed agents spend more time at home.',
    impact: 'Agents consume part of their wealth for living expenses. High unemployment increases the concentration of agents in these areas.',
  },
  workplace: {
    icon: '🏢',
    title: 'Workplace',
    description: 'Businesses employ agents based on their education level. Each position has a wage and an automation risk.',
    impact: 'Generates income for employees, fuels consumption and tax revenue. Automation gradually reduces available positions.',
  },
  market: {
    icon: '🛒',
    title: 'Market',
    description: 'Agents come here to buy consumer goods. Visit frequency depends on their satisfaction and income.',
    impact: 'Redistributes wealth in the economy. Agent satisfaction increases after a purchase. High prices reduce accessibility for the poorest.',
  },
  school: {
    icon: '🎓',
    title: 'School / Training',
    description: 'Agents can improve their education level here, going from low to medium, or from medium to high.',
    impact: 'Improves employability and grants access to higher-paying jobs. Reduces automation-related unemployment risk. Requires investment from the agent.',
  },
  government: {
    icon: '🏛️',
    title: 'Government',
    description: 'Tax redistribution center. Collects taxes and provides aid to the most disadvantaged agents.',
    impact: 'Reduces inequality (Gini) through redistribution. A high redistribution rate narrows the gap between rich and poor but may slow investment.',
  },
  resource: {
    icon: '🌳',
    title: 'Resource Zone',
    description: 'Source of raw materials. Manual workers extract resources that feed the economy.',
    impact: 'Provides the foundation of economic activity. Low-skilled but essential jobs. Highly vulnerable to automation in advanced economies.',
  },
  factory: {
    icon: '🏭',
    title: 'Factory / Processing',
    description: 'Transforms raw materials into consumer goods. Primarily employs manual and skilled workers.',
    impact: 'Key link in the value chain. Strong job creation but high automation risk. Contributes significantly to GDP and tax revenue.',
  },
  bank: {
    icon: '🏦',
    title: 'Bank',
    description: 'Agents can obtain loans based on their financial score (employment, income, wealth). Loans enable investment or survival.',
    impact: 'Facilitates access to capital. Struggling agents can borrow but risk defaulting, which worsens their situation (satisfaction, crime).',
  },
  police_station: {
    icon: '🚔',
    title: 'Police Station',
    description: 'Government-funded law enforcement. Police officers patrol the city to arrest criminals and maintain order.',
    impact: 'Reduces crime rate by arresting criminals. Funded by government treasury — more police are hired during social unrest. Confiscated wealth returns to the treasury.',
  },
}

const WORKPLACE_INFO: Record<WorkplaceType, { label: string; detail: string }> = {
  manual: {
    label: 'Manual Labor',
    detail: 'Base wage, very high automation risk (80%). Requires low education.',
  },
  skilled: {
    label: 'Office / Skilled',
    detail: 'Medium wage, moderate automation risk (40%). Requires medium education.',
  },
  creative: {
    label: 'Studio / Creative',
    detail: 'High wage, low automation risk (15%). Requires high education.',
  },
  service: {
    label: 'Retail / Service',
    detail: 'Modest wage, medium automation risk (50%). Low education sufficient.',
  },
}

// ============================================================
// Computed: current location data from store
// ============================================================
const location = computed<Location | null>(() => {
  if (!locationId.value || !sim.worldState) return null
  return sim.worldState.locations.find(l => l.id === locationId.value) ?? null
})

const info = computed(() => {
  if (!location.value) return null
  return LOCATION_INFO[location.value.type]
})

const workplaceDetail = computed(() => {
  if (!location.value?.workplaceType) return null
  return WORKPLACE_INFO[location.value.workplaceType]
})

const stats = computed(() => {
  const loc = location.value
  if (!loc) return []
  const items: { label: string; value: string }[] = []

  if (loc.type === 'workplace' || loc.type === 'factory' || loc.type === 'resource') {
    items.push({ label: 'Filled Positions', value: `${loc.filledSlots} / ${loc.jobSlots}` })
    if (loc.automatedSlots > 0) {
      items.push({ label: 'Automated Positions', value: `${loc.automatedSlots}` })
    }
    items.push({ label: 'Wage', value: `$${loc.wage}/tick` })
  }
  if (loc.goodsPrice != null) {
    items.push({ label: 'Goods Price', value: `$${loc.goodsPrice}` })
  }
  if (loc.educationCost != null) {
    items.push({ label: 'Training Cost', value: `$${loc.educationCost}` })
  }
  return items
})

// ============================================================
// Event handling
// ============================================================
function onLocationClicked(payload: { locationId: string; screenX: number; screenY: number }) {
  locationId.value = payload.locationId
  // Clamp position so bubble stays inside viewport
  posX.value = Math.min(payload.screenX, window.innerWidth - 340)
  posY.value = Math.max(payload.screenY - 20, 10)
  visible.value = true
}

function dismiss() {
  visible.value = false
  locationId.value = null
}

onMounted(() => {
  eventBus.on('location:clicked', onLocationClicked as never)
  eventBus.on('location:dismissed', dismiss)
})

onUnmounted(() => {
  eventBus.off('location:clicked', onLocationClicked as never)
  eventBus.off('location:dismissed', dismiss)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="bubble">
      <div
        v-if="visible && info && location"
        class="info-bubble"
        :style="{ left: posX + 'px', top: posY + 'px' }"
      >
        <div class="info-bubble__header">
          <span class="info-bubble__icon">{{ info.icon }}</span>
          <span class="info-bubble__title">{{ info.title }}</span>
          <button class="info-bubble__close" @click="dismiss">&times;</button>
        </div>

        <div v-if="workplaceDetail" class="info-bubble__subtype">
          <strong>{{ workplaceDetail.label }}</strong>
          <p>{{ workplaceDetail.detail }}</p>
        </div>

        <p class="info-bubble__desc">{{ info.description }}</p>

        <div v-if="stats.length" class="info-bubble__stats">
          <div v-for="s in stats" :key="s.label" class="info-bubble__stat">
            <span class="info-bubble__stat-label">{{ s.label }}</span>
            <span class="info-bubble__stat-value">{{ s.value }}</span>
          </div>
        </div>

        <div class="info-bubble__impact">
          <div class="info-bubble__impact-label">⚡ Economic Impact</div>
          <p>{{ info.impact }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.info-bubble {
  position: fixed;
  z-index: 9999;
  width: 320px;
  max-height: 420px;
  overflow-y: auto;
  background: rgba(22, 22, 40, 0.96);
  border: 1px solid rgba(100, 100, 140, 0.4);
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  font-size: 12px;
  color: $text-secondary;
  pointer-events: auto;

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  &__icon {
    font-size: 22px;
  }

  &__title {
    font-size: 14px;
    font-weight: 700;
    color: $text-primary;
    flex: 1;
  }

  &__close {
    background: none;
    border: none;
    color: $text-muted;
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    &:hover { color: $text-primary; }
  }

  &__subtype {
    background: rgba(91, 143, 185, 0.12);
    border-left: 3px solid rgba(91, 143, 185, 0.6);
    padding: 6px 10px;
    border-radius: 4px;
    margin-bottom: 10px;

    strong {
      color: $text-primary;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    p {
      margin: 4px 0 0;
      font-size: 11px;
      line-height: 1.4;
    }
  }

  &__desc {
    margin: 0 0 10px;
    line-height: 1.5;
  }

  &__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 6px;
    margin-bottom: 10px;
  }

  &__stat {
    display: flex;
    gap: 6px;
    font-size: 11px;
    min-width: 120px;

    &-label {
      color: $text-muted;
    }
    &-value {
      color: $color-accent;
      font-weight: 600;
      font-family: monospace;
    }
  }

  &__impact {
    background: rgba(212, 165, 116, 0.08);
    border-left: 3px solid rgba(212, 165, 116, 0.5);
    padding: 8px 10px;
    border-radius: 4px;

    &-label {
      font-size: 11px;
      font-weight: 700;
      color: $color-accent;
      margin-bottom: 4px;
    }

    p {
      margin: 0;
      font-size: 11px;
      line-height: 1.5;
    }
  }
}

// Transition
.bubble-enter-active {
  transition: all 0.2s ease-out;
}
.bubble-leave-active {
  transition: all 0.15s ease-in;
}
.bubble-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.95);
}
.bubble-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}
</style>
