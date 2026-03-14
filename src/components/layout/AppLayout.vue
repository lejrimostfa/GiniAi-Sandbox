<script setup lang="ts">
// --- App Layout ---
// Main CSS grid layout: TopBar, LeftPanel, Viewport+Charts, RightPanel, BottomBar
// Charts drawer toggleable below the 3D viewport

import { ref } from 'vue'
import { useUiStore } from '../../stores/uiStore'
import TopBar from './TopBar.vue'
import SandboxViewport from '../viewport/SandboxViewport.vue'
import PlaybackControls from '../controls/PlaybackControls.vue'
import VisualModeSelector from '../controls/VisualModeSelector.vue'
import DisplayToggles from '../controls/DisplayToggles.vue'
import ParameterSliders from '../controls/ParameterSliders.vue'
import MetricsPanel from '../panels/MetricsPanel.vue'
import InspectorPanel from '../panels/InspectorPanel.vue'
import LegendPanel from '../panels/LegendPanel.vue'
import ScenarioSelector from '../pedagogical/ScenarioSelector.vue'
import ChartsPanel from '../charts/ChartsPanel.vue'

const ui = useUiStore()
const showCharts = ref(false)
</script>

<template>
  <div class="app-layout">
    <!-- Top Bar -->
    <TopBar class="app-layout__topbar" />

    <!-- Left Control Panel -->
    <aside v-if="ui.showControlPanel" class="app-layout__left">
      <div class="left-panel">
        <VisualModeSelector />
        <DisplayToggles />
        <ParameterSliders />
        <ScenarioSelector />
      </div>
    </aside>

    <!-- Center: 3D Viewport + Charts Drawer -->
    <main class="app-layout__center">
      <div class="app-layout__viewport" :class="{ 'app-layout__viewport--split': showCharts }">
        <SandboxViewport />
      </div>
      <div v-if="showCharts" class="app-layout__charts">
        <ChartsPanel @close="showCharts = false" />
      </div>
    </main>

    <!-- Right Panels -->
    <aside class="app-layout__right">
      <MetricsPanel v-if="ui.showMetricsPanel" />
      <LegendPanel v-if="ui.showLegendPanel" />
      <InspectorPanel v-if="ui.showInspectorPanel" />
    </aside>

    <!-- Bottom Playback Bar -->
    <footer class="app-layout__bottom">
      <PlaybackControls />
      <button
        class="charts-toggle"
        :class="{ 'charts-toggle--active': showCharts }"
        @click="showCharts = !showCharts"
        title="Toggle Charts Panel"
      >
        <span class="charts-toggle__icon">&#9776;</span>
        Charts
      </button>
    </footer>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.app-layout {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: $topbar-height 1fr $bottombar-height;
  grid-template-columns: $panel-width 1fr $panel-width;
  grid-template-areas:
    "topbar  topbar   topbar"
    "left    center   right"
    "bottom  bottom   bottom";
  gap: 0;
  overflow: hidden;

  &__topbar {
    grid-area: topbar;
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

  &__right {
    grid-area: right;
    overflow-y: auto;
    border-left: 1px solid $border-color;
    background: $bg-panel;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  &__bottom {
    grid-area: bottom;
    display: flex;
    align-items: center;
  }
}

.left-panel {
  display: flex;
  flex-direction: column;
  gap: $space-lg;
  padding: $space-md;
}

.charts-toggle {
  display: flex;
  align-items: center;
  gap: $space-xs;
  padding: $space-xs $space-md;
  margin-left: auto;
  margin-right: $space-md;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-button;
  color: $text-secondary;
  font-size: $font-size-sm;
  font-family: $font-sans;
  cursor: pointer;
  transition: all 0.15s ease;
  height: 28px;

  &:hover {
    background: $bg-button-hover;
    border-color: $border-active;
  }

  &--active {
    background: $bg-button-active;
    border-color: $color-accent;
    color: $color-accent;
  }

  &__icon {
    font-size: 12px;
  }
}
</style>
