<script setup lang="ts">
// --- Inspector Panel ---
// Shows details of the hovered or selected cell
// Connected to inspectorStore

import { computed } from 'vue'
import { useInspectorStore } from '../../stores/inspectorStore'

const inspector = useInspectorStore()

const cell = computed(() => inspector.selectedCell ?? inspector.hoveredCell)
const isSelected = computed(() => inspector.selectedCell !== null)

const stateLabels: Record<string, string> = {
  W: 'Worker',
  P: 'Precarious',
  O: 'Owner',
}

const stateColors: Record<string, string> = {
  W: '#5B8FB9',
  P: '#E07A5F',
  O: '#3D405B',
}

function fmt(v: number | undefined, decimals = 3): string {
  if (v === undefined || v === null) return '—'
  return v.toFixed(decimals)
}
</script>

<template>
  <div class="inspector-panel panel">
    <div class="panel__title">
      Inspector
      <span v-if="isSelected" style="color: #D4A574; font-size: 9px; margin-left: 4px;">
        SELECTED
      </span>
    </div>

    <template v-if="cell">
      <div class="inspector__grid">
        <div class="inspector__row">
          <span class="inspector__label">Position</span>
          <span class="inspector__value">({{ cell.x }}, {{ cell.y }})</span>
        </div>

        <div class="inspector__row">
          <span class="inspector__label">State</span>
          <span
            class="inspector__value inspector__state"
            :style="{ color: stateColors[cell.state] }"
          >
            {{ stateLabels[cell.state] }} ({{ cell.state }})
          </span>
        </div>

        <div class="inspector__row">
          <span class="inspector__label">Resource</span>
          <span class="inspector__value">{{ fmt(cell.resource) }}</span>
        </div>

        <div class="inspector__row">
          <span class="inspector__label">Stress</span>
          <span class="inspector__value" :style="{ color: cell.stress > 0.5 ? '#C44536' : '' }">
            {{ fmt(cell.stress) }}
          </span>
        </div>

        <div class="inspector__row">
          <span class="inspector__label">Redistribution</span>
          <span class="inspector__value" :style="{ color: cell.redistribution > 0 ? '#81B29A' : '' }">
            {{ fmt(cell.redistribution) }}
          </span>
        </div>

        <div class="inspector__row" v-if="cell.clusterId !== undefined">
          <span class="inspector__label">Cluster ID</span>
          <span class="inspector__value">{{ cell.clusterId }}</span>
        </div>

        <div class="inspector__row" v-if="cell.ownerLocalDensity !== undefined">
          <span class="inspector__label">Owner Density</span>
          <span class="inspector__value">{{ fmt(cell.ownerLocalDensity) }}</span>
        </div>

        <div class="inspector__row" v-if="cell.precariousLocalDensity !== undefined">
          <span class="inspector__label">Precarious Density</span>
          <span class="inspector__value">{{ fmt(cell.precariousLocalDensity) }}</span>
        </div>

        <div class="inspector__row" v-if="cell.deprived">
          <span class="inspector__label">Status</span>
          <span class="inspector__value" style="color: #C44536;">DEPRIVED</span>
        </div>
      </div>

      <button
        v-if="isSelected"
        class="btn inspector__deselect"
        @click="inspector.deselect()"
      >
        Deselect
      </button>
    </template>

    <div v-else class="inspector__empty">
      Hover or click a cell to inspect
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.inspector-panel {
  min-height: 120px;
}

.inspector__grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.inspector__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  border-bottom: 1px solid rgba(100, 100, 140, 0.1);
}

.inspector__label {
  font-size: $font-size-xs;
  color: $text-secondary;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.inspector__value {
  font-family: $font-mono;
  font-size: $font-size-sm;
  color: $text-primary;
}

.inspector__state {
  font-weight: 600;
}

.inspector__empty {
  font-size: $font-size-sm;
  color: $text-muted;
  text-align: center;
  padding: $space-lg;
}

.inspector__deselect {
  margin-top: $space-sm;
  width: 100%;
}
</style>
