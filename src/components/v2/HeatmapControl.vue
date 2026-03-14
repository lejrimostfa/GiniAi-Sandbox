<script setup lang="ts">
// --- Heatmap Filter Control ---
// Dropdown overlay on viewport to select heatmap mode
// Emits 'heatmap:mode' event to color agents by property (blue→red)

import { ref } from 'vue'
import eventBus from '../../events/eventBus'

const activeMode = ref('none')

const modes = [
  { id: 'none', label: 'None', emoji: '🔵' },
  { id: 'wealth', label: 'Wealth', emoji: '💰' },
  { id: 'poverty', label: 'Poverty', emoji: '🪙' },
  { id: 'illness', label: 'Illness', emoji: '🤒' },
  { id: 'unemployment', label: 'Unemployment', emoji: '📉' },
  { id: 'satisfaction', label: 'Satisfaction', emoji: '😊' },
  { id: 'age', label: 'Age', emoji: '🎂' },
  { id: 'education', label: 'Education', emoji: '🎓' },
  { id: 'crime', label: 'Crime', emoji: '🥷' },
  { id: 'death', label: 'Mortality', emoji: '☠️' },
  { id: 'birth', label: 'Births', emoji: '👶' },
  { id: 'familySize', label: 'Family', emoji: '👨‍👩‍👧‍👦' },
  { id: 'housing', label: 'Housing', emoji: '🏠' },
  { id: 'businesses', label: 'Businesses', emoji: '🏢' },
  { id: 'automation', label: 'Automation', emoji: '🤖' },
]

function setMode(mode: string) {
  activeMode.value = mode
  eventBus.emit('heatmap:mode', mode)
}
</script>

<template>
  <div class="heatmap-control">
    <div class="heatmap-control__label">🌡️ HEATMAP</div>
    <div class="heatmap-control__buttons">
      <button
        v-for="m in modes"
        :key="m.id"
        :class="['heatmap-btn', { 'heatmap-btn--active': activeMode === m.id }]"
        :title="m.label"
        @click="setMode(m.id)"
      >
        <span class="heatmap-btn__emoji">{{ m.emoji }}</span>
        <span class="heatmap-btn__label">{{ m.label }}</span>
      </button>
    </div>
    <div v-if="activeMode !== 'none'" class="heatmap-control__scale">
      <span class="scale-low">Low</span>
      <div class="scale-bar" />
      <span class="scale-high">High</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.heatmap-control {
  padding: $space-sm;
  background: rgba(30, 30, 40, 0.85);
  border-radius: $radius-md;
  pointer-events: auto;
  min-width: 140px;

  &__label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: $text-primary;
    margin-bottom: $space-xs;
  }

  &__buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  &__scale {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    font-size: 9px;
    color: $text-muted;
  }
}

.scale-low { color: #3B82F6; font-weight: 600; }
.scale-high { color: #EF4444; font-weight: 600; }

.scale-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(to right, #3B82F6, #EAB308, #EF4444);
}

.heatmap-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border: 1px solid rgba(100, 100, 140, 0.2);
  border-radius: $radius-sm;
  background: rgba(40, 40, 60, 0.5);
  color: $text-muted;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(60, 60, 90, 0.7);
    color: $text-primary;
  }

  &--active {
    background: rgba(212, 165, 116, 0.2);
    border-color: $color-accent;
    color: $color-accent;
  }

  &__emoji {
    font-size: 11px;
  }

  &__label {
    font-size: 9px;
  }
}
</style>
