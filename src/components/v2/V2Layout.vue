<script setup lang="ts">
// --- V2 App Layout ---
// Main layout: TopBar, LeftPanel (params), Center (viewport+charts), RightPanel (metrics+inspector)
// Bottom playback bar with charts toggle

import { ref } from 'vue'
import SimViewport from './SimViewport.vue'
import ParamsPanel from './ParamsPanel.vue'
import MetricsDashboard from './MetricsDashboard.vue'
import AgentInspector from './AgentInspector.vue'
import PlaybackBar from './PlaybackBar.vue'
import V2Charts from './V2Charts.vue'
import SimLegend from './SimLegend.vue'
import HeatmapControl from './HeatmapControl.vue'
import HelpPage from './HelpPage.vue'
import InfoBubble from './InfoBubble.vue'
import { useSimStore } from '../../stores/v2SimulationStore'

const sim = useSimStore()
const showCharts = ref(false)
const showHelp = ref(false)
</script>

<template>
  <div class="v2-layout">
    <!-- Top Bar -->
    <header class="v2-layout__topbar">
      <div class="topbar-left">
        <span class="topbar-title">GiniAi</span>
        <span class="topbar-subtitle">Sandbox</span>
      </div>
      <div class="topbar-right">
        <span class="topbar-badge" v-if="sim.currentMetrics">
          Gini {{ sim.currentMetrics.giniCoefficient.toFixed(3) }}
        </span>
        <span class="topbar-info" v-if="sim.currentMetrics">
          Pop {{ sim.currentMetrics.totalPopulation }}
          · Year {{ sim.currentMetrics.year }}
          · Week {{ (sim.currentMetrics.tick % 52) + 1 }}/52
        </span>
        <button class="topbar-help-btn" @click="showHelp = true" title="Help">📖</button>
      </div>
    </header>

    <!-- Left: Parameters -->
    <aside class="v2-layout__left">
      <ParamsPanel />
    </aside>

    <!-- Center: Viewport + Charts -->
    <main class="v2-layout__center">
      <div class="v2-layout__viewport" :class="{ 'v2-layout__viewport--split': showCharts }">
        <SimViewport />
        <div class="v2-layout__legend-overlay">
          <SimLegend />
        </div>
        <div class="v2-layout__heatmap-overlay">
          <HeatmapControl />
        </div>
      </div>
      <div v-if="showCharts" class="v2-layout__charts">
        <V2Charts @close="showCharts = false" />
      </div>
    </main>

    <!-- Info bubble (teleports to body) -->
    <InfoBubble />

    <!-- Right: Metrics + Inspector -->
    <aside class="v2-layout__right">
      <MetricsDashboard />
      <AgentInspector />
    </aside>

    <!-- Bottom: Playback -->
    <footer class="v2-layout__bottom">
      <PlaybackBar @toggle-charts="showCharts = !showCharts" />
    </footer>

    <!-- Help Page Modal -->
    <HelpPage v-if="showHelp" @close="showHelp = false" />
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.v2-layout {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: $topbar-height 1fr $bottombar-height;
  grid-template-columns: $panel-width 1fr $panel-width;
  grid-template-areas:
    "topbar  topbar  topbar"
    "left    center  right"
    "bottom  bottom  bottom";
  gap: 0;
  overflow: hidden;

  &__topbar {
    grid-area: topbar;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 $space-md;
    background: $bg-panel;
    border-bottom: 1px solid $border-color;
  }

  &__left {
    grid-area: left;
    overflow-y: auto;
    border-right: 1px solid $border-color;
    background: $bg-panel;
  }

  &__center {
    grid-area: center;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__viewport {
    flex: 1;
    overflow: hidden;
    position: relative;
    min-height: 0;

    &--split {
      flex: 1 1 55%;
    }
  }

  &__charts {
    flex: 0 0 40%;
    min-height: 180px;
    max-height: 50%;
    overflow: hidden;
  }

  &__legend-overlay {
    position: absolute;
    bottom: 8px;
    left: 8px;
    z-index: 10;
    pointer-events: none;
    max-width: 180px;
  }

  &__heatmap-overlay {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 10;
    pointer-events: none;
    max-width: 260px;
  }

  &__right {
    grid-area: right;
    overflow-y: auto;
    border-left: 1px solid $border-color;
    background: $bg-panel;
    display: flex;
    flex-direction: column;
  }

  &__bottom {
    grid-area: bottom;
  }
}

.topbar-left {
  display: flex;
  align-items: baseline;
  gap: $space-xs;
}

.topbar-title {
  font-size: 16px;
  font-weight: 700;
  color: $color-accent;
  font-family: $font-sans;
}

.topbar-subtitle {
  font-size: 14px;
  color: $text-muted;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: $space-md;
}

.topbar-badge {
  font-family: monospace;
  font-size: $font-size-sm;
  background: rgba(212, 165, 116, 0.15);
  color: $color-accent;
  padding: 2px 8px;
  border-radius: $radius-sm;
  font-weight: 600;
}

.topbar-info {
  font-family: monospace;
  font-size: $font-size-xs;
  color: $text-muted;
}

.topbar-help-btn {
  background: rgba(50, 50, 75, 0.6);
  border: 1px solid rgba(100, 100, 140, 0.3);
  border-radius: $radius-sm;
  padding: 3px 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
  &:hover {
    background: rgba(70, 70, 100, 0.8);
  }
}
</style>
