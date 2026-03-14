<script setup lang="ts">
// --- Parameter Sliders ---
// Controls for simulation parameters (r, q, rho) in mock mode
// Connected to simulationStore.params
// Emits params:changed event which triggers data regeneration

import { computed } from 'vue'
import { useSimulationStore } from '../../stores/simulationStore'
import { MockDataProvider } from '../../data/dataProvider'

const sim = useSimulationStore()

const automation = computed({
  get: () => sim.params.automationIntensity,
  set: (v: number) => updateParam('automationIntensity', v),
})

const ownership = computed({
  get: () => sim.params.ownershipConcentration,
  set: (v: number) => updateParam('ownershipConcentration', v),
})

const redistribution = computed({
  get: () => sim.params.redistributionLevel,
  set: (v: number) => updateParam('redistributionLevel', v),
})

async function updateParam(key: string, value: number) {
  const newParams = { ...sim.params, [key]: value }
  sim.setParams(newParams)

  // Regenerate mock data with new params
  const provider = new MockDataProvider(newParams)
  const timeline = await provider.getTimeline()
  sim.loadSnapshots(timeline)
}

function formatVal(v: number): string {
  return v.toFixed(2)
}
</script>

<template>
  <div class="param-sliders">
    <div class="panel__title">Parameters</div>

    <div class="slider">
      <div class="slider__label">
        <span>Automation (r)</span>
        <span class="slider__value">{{ formatVal(automation) }}</span>
      </div>
      <input
        type="range"
        min="0" max="1" step="0.01"
        :value="automation"
        @input="automation = Number(($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="slider">
      <div class="slider__label">
        <span>Ownership (q)</span>
        <span class="slider__value">{{ formatVal(ownership) }}</span>
      </div>
      <input
        type="range"
        min="0" max="1" step="0.01"
        :value="ownership"
        @input="ownership = Number(($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="slider">
      <div class="slider__label">
        <span>Redistribution (ρ)</span>
        <span class="slider__value">{{ formatVal(redistribution) }}</span>
      </div>
      <input
        type="range"
        min="0" max="1" step="0.01"
        :value="redistribution"
        @input="redistribution = Number(($event.target as HTMLInputElement).value)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.param-sliders {
  display: flex;
  flex-direction: column;
  gap: $space-md;
}
</style>
