<script setup lang="ts">
// --- Scenario Selector ---
// Pedagogical presets for exploring different socio-economic regimes
// Loads a scenario's params, regenerates mock data

import { ref } from 'vue'
import { SCENARIOS } from '../../data/scenarios'
import { useSimulationStore } from '../../stores/simulationStore'
import { MockDataProvider } from '../../data/dataProvider'
import eventBus from '../../events/eventBus'

const sim = useSimulationStore()
const activeId = ref<string | null>(null)

async function selectScenario(id: string) {
  const scenario = SCENARIOS.find(s => s.id === id)
  if (!scenario) return

  activeId.value = id
  sim.setParams(scenario.params)

  const provider = new MockDataProvider(scenario.params)
  const timeline = await provider.getTimeline()
  sim.loadSnapshots(timeline)

  eventBus.emit('scenario:selected', id)
}
</script>

<template>
  <div class="scenario-selector">
    <div class="panel__title">Scenarios</div>
    <div class="scenario-list">
      <button
        v-for="s in SCENARIOS"
        :key="s.id"
        class="scenario-card"
        :class="{ 'scenario-card--active': activeId === s.id }"
        @click="selectScenario(s.id)"
      >
        <div class="scenario-card__name">{{ s.name }}</div>
        <div class="scenario-card__desc">{{ s.description }}</div>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.scenario-list {
  display: flex;
  flex-direction: column;
  gap: $space-xs;
}

.scenario-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  padding: $space-sm;
  background: rgba(20, 20, 40, 0.4);
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  color: $text-secondary;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: $font-sans;

  &:hover {
    background: rgba(40, 40, 65, 0.6);
    border-color: $border-active;
  }

  &--active {
    border-color: $color-accent;
    background: rgba(50, 50, 75, 0.5);
  }

  &__name {
    font-size: $font-size-sm;
    font-weight: 600;
    color: $text-primary;
    margin-bottom: 2px;
  }

  &__desc {
    font-size: $font-size-xs;
    line-height: 1.3;
    color: $text-muted;
  }
}
</style>
