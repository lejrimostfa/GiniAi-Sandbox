<script setup lang="ts">
// --- Top Bar ---
// Application title, current mode indicator, and step display

import { computed } from 'vue'
import { useUiStore } from '../../stores/uiStore'
import { useSimulationStore } from '../../stores/simulationStore'
import { VISUAL_MODE_LABELS } from '../../types/visualization'

const ui = useUiStore()
const sim = useSimulationStore()

const modeLabel = computed(() => VISUAL_MODE_LABELS[ui.visualMode])
const step = computed(() => sim.currentSnapshot?.step ?? 0)
const gridInfo = computed(() => {
  const snap = sim.currentSnapshot
  if (!snap) return ''
  return `${snap.gridWidth}×${snap.gridHeight}`
})
</script>

<template>
  <div class="topbar">
    <div class="topbar__title">
      <span class="topbar__logo">GiniAi</span>
      <span class="topbar__subtitle">Sandbox</span>
    </div>
    <div class="topbar__info">
      <span class="topbar__badge">{{ modeLabel }}</span>
      <span class="topbar__meta" v-if="gridInfo">{{ gridInfo }}</span>
      <span class="topbar__meta">Step {{ step }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: $topbar-height;
  padding: 0 $space-lg;
  background: $bg-panel;
  border-bottom: 1px solid $border-color;
  user-select: none;

  &__title {
    display: flex;
    align-items: baseline;
    gap: $space-xs;
  }

  &__logo {
    font-size: $font-size-lg;
    font-weight: 700;
    color: $color-accent;
    letter-spacing: 0.02em;
  }

  &__subtitle {
    font-size: $font-size-md;
    font-weight: 400;
    color: $text-secondary;
  }

  &__info {
    display: flex;
    align-items: center;
    gap: $space-md;
  }

  &__badge {
    padding: 2px $space-sm;
    border-radius: $radius-lg;
    background: rgba(50, 50, 75, 0.8);
    border: 1px solid $border-color;
    font-size: $font-size-xs;
    color: $color-accent;
    font-weight: 500;
  }

  &__meta {
    font-family: $font-mono;
    font-size: $font-size-xs;
    color: $text-muted;
  }
}
</style>
