<script setup lang="ts">
// --- Display Toggles ---
// Toggle switches for layer visibility
// Connected to uiStore.displayToggles

import { useUiStore } from '../../stores/uiStore'
import type { DisplayToggles } from '../../types/visualization'

const ui = useUiStore()

const toggles: { key: keyof DisplayToggles; label: string }[] = [
  { key: 'tiles', label: 'Ground Tiles' },
  { key: 'agents', label: 'Agent Capsules' },
  { key: 'resourceSpheres', label: 'Resource Spheres' },
  { key: 'redistributionRings', label: 'Redistribution Rings' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'stressOverlay', label: 'Stress Overlay' },
]
</script>

<template>
  <div class="display-toggles">
    <div class="panel__title">Layers</div>
    <div
      v-for="t in toggles"
      :key="t.key"
      class="toggle"
      :class="{ 'toggle--active': ui.displayToggles[t.key] }"
      @click="ui.toggleLayer(t.key)"
    >
      <span>{{ t.label }}</span>
      <div class="toggle__switch" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.display-toggles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
