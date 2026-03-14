<script setup lang="ts">
// --- Visual Mode Selector ---
// Chip-based selector for 7 visual modes
// Connected to uiStore

import { computed } from 'vue'
import { useUiStore } from '../../stores/uiStore'
import type { VisualMode } from '../../types/visualization'
import { VISUAL_MODE_LABELS } from '../../types/visualization'

const ui = useUiStore()
const currentMode = computed(() => ui.visualMode)

const modes = Object.entries(VISUAL_MODE_LABELS) as [VisualMode, string][]
</script>

<template>
  <div class="mode-selector">
    <div class="panel__title">Visual Mode</div>
    <div class="mode-selector__chips">
      <button
        v-for="[mode, label] in modes"
        :key="mode"
        class="chip"
        :class="{ 'chip--active': currentMode === mode }"
        @click="ui.setVisualMode(mode)"
      >
        {{ label }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.mode-selector {
  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: $space-xs;
  }
}
</style>
