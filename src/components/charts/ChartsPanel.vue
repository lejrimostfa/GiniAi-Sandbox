<script setup lang="ts">
// --- Charts Panel ---
// Tabbed panel with 6 scientific time-series charts
// Designed as a collapsible bottom drawer in the layout
// Each tab is a different analytical lens on the simulation

import { ref } from 'vue'
import PopulationChart from './PopulationChart.vue'
import GiniChart from './GiniChart.vue'
import MobilityChart from './MobilityChart.vue'
import ClusterChart from './ClusterChart.vue'
import DeprivationChart from './DeprivationChart.vue'
import PhaseChart from './PhaseChart.vue'

interface Tab {
  id: string
  label: string
  shortLabel: string
  component: typeof PopulationChart
}

const tabs: Tab[] = [
  { id: 'population', label: 'Agent Distribution', shortLabel: 'Population', component: PopulationChart },
  { id: 'gini', label: 'Inequality & Redistribution', shortLabel: 'Gini', component: GiniChart },
  { id: 'mobility', label: 'Social Mobility', shortLabel: 'Mobility', component: MobilityChart },
  { id: 'clusters', label: 'Cluster Dynamics', shortLabel: 'Clusters', component: ClusterChart },
  { id: 'deprivation', label: 'Deprivation & Stress', shortLabel: 'Stress', component: DeprivationChart },
  { id: 'phase', label: 'Phase Diagram', shortLabel: 'Phase', component: PhaseChart },
]

const activeTab = ref('population')

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div class="charts-panel">
    <div class="charts-panel__header">
      <div class="charts-panel__tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="charts-panel__tab"
          :class="{ 'charts-panel__tab--active': activeTab === tab.id }"
          @click="activeTab = tab.id"
          :title="tab.label"
        >
          {{ tab.shortLabel }}
        </button>
      </div>
      <button class="charts-panel__close" @click="emit('close')" title="Close charts">
        &#10005;
      </button>
    </div>
    <div class="charts-panel__body">
      <component
        v-for="tab in tabs"
        :key="tab.id"
        :is="tab.component"
        v-show="activeTab === tab.id"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.charts-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: $bg-panel;
  border-top: 1px solid $border-color;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 $space-sm;
    border-bottom: 1px solid $border-color;
    height: 32px;
    flex-shrink: 0;
  }

  &__tabs {
    display: flex;
    gap: 2px;
    overflow-x: auto;
  }

  &__tab {
    padding: 4px $space-sm;
    border: none;
    background: transparent;
    color: $text-muted;
    font-size: $font-size-xs;
    font-family: $font-sans;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s ease;
    white-space: nowrap;

    &:hover {
      color: $text-secondary;
      background: rgba(50, 50, 75, 0.3);
    }

    &--active {
      color: $color-accent;
      border-bottom-color: $color-accent;
    }
  }

  &__close {
    background: none;
    border: none;
    color: $text-muted;
    font-size: 14px;
    cursor: pointer;
    padding: 4px 6px;
    line-height: 1;

    &:hover {
      color: $text-primary;
    }
  }

  &__body {
    flex: 1;
    padding: $space-sm $space-md;
    overflow: hidden;
  }
}
</style>
