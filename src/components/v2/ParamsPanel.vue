<script setup lang="ts">
// --- V2 Parameters Panel ---
// Comprehensible initial params: Gini, education, AI rate, redistribution, economy type
// Live-adjustable sliders for AI rate and redistribution
// Education mix auto-normalizes to 100%

import { ref, watch, computed } from 'vue'
import { useSimStore } from '../../stores/v2SimulationStore'
import type { EconomyType } from '../../simulation/types'
import { ECONOMY_PRESETS } from '../../simulation/types'

const sim = useSimStore()

// Initial params are locked once simulation has started (tick > 0)
// Only live controls (aiRate, aiDiffusion, redistribution) remain adjustable
const simStarted = computed(() => sim.currentTick > 0)

// Local copies of params for two-way binding
const population = ref(sim.params.populationSize)
const startingGini = ref(sim.params.startingGini)
const lifespan = ref(sim.params.averageLifespan)
const eduLow = ref(sim.params.educationMix.low * 100)
const eduMed = ref(sim.params.educationMix.medium * 100)
const eduHigh = ref(sim.params.educationMix.high * 100)
const aiRate = ref(sim.params.aiGrowthRate * 100)
const aiDiffusion = ref(sim.params.aiDiffusionRate * 100)
const redistribution = ref(sim.params.redistributionLevel * 100)
const enableUBI = ref(sim.params.enableUBI)
const immigrationEnabled = ref(sim.params.immigrationEnabled)
const immigrationRate = ref(sim.params.immigrationRate * 100)
const diseasesEnabled = ref(sim.params.diseasesEnabled)
const religionEnabled = ref(sim.params.religionConfig.enabled)
const religionDiscrimination = ref(sim.params.religionConfig.discriminationIntensity * 100)
const economyType = ref<EconomyType>(sim.params.economyType)

const eduTotal = computed(() => Math.round(eduLow.value + eduMed.value + eduHigh.value))

const economyOptions = Object.entries(ECONOMY_PRESETS).map(([key, val]) => ({
  value: key as EconomyType,
  label: val.label,
  description: val.description,
  mix: val.workplaceMix,
}))

const selectedMix = computed(() => ECONOMY_PRESETS[economyType.value].workplaceMix)

// --- Auto-normalize education mix: when one slider changes, adjust the others ---
function normalizeEdu(changed: 'low' | 'medium' | 'high') {
  const MIN = 5
  const vals = { low: eduLow.value, medium: eduMed.value, high: eduHigh.value }
  const others = (['low', 'medium', 'high'] as const).filter(k => k !== changed)
  const remaining = 100 - vals[changed]
  const otherSum = others.reduce((s, k) => s + vals[k], 0)

  if (otherSum === 0) {
    // Edge case: distribute equally
    others.forEach(k => { vals[k] = remaining / 2 })
  } else {
    // Proportional redistribution
    others.forEach(k => {
      vals[k] = Math.max(MIN, Math.round((vals[k] / otherSum) * remaining))
    })
    // Fix rounding
    const newTotal = vals.low + vals.medium + vals.high
    if (newTotal !== 100) {
      vals[others[0]] += 100 - newTotal
      vals[others[0]] = Math.max(MIN, vals[others[0]])
    }
  }

  eduLow.value = vals.low
  eduMed.value = vals.medium
  eduHigh.value = vals.high
}

watch(eduLow, () => normalizeEdu('low'))
watch(eduMed, () => normalizeEdu('medium'))
watch(eduHigh, () => normalizeEdu('high'))

// --- Live params (adjustable during sim) ---
watch(aiRate, (v) => sim.updateParams({ aiGrowthRate: v / 100 }))
watch(aiDiffusion, (v) => sim.updateParams({ aiDiffusionRate: v / 100 }))
watch(redistribution, (v) => sim.updateParams({ redistributionLevel: v / 100 }))
watch(enableUBI, (v) => sim.updateParams({ enableUBI: v }))
watch(immigrationEnabled, (v) => sim.updateParams({ immigrationEnabled: v }))
watch(immigrationRate, (v) => sim.updateParams({ immigrationRate: v / 100 }))
watch(diseasesEnabled, (v) => sim.updateParams({ diseasesEnabled: v }))
watch(religionEnabled, (v) => sim.updateParams({ religionConfig: { ...sim.params.religionConfig, enabled: v } }))
watch(religionDiscrimination, (v) => sim.updateParams({ religionConfig: { ...sim.params.religionConfig, discriminationIntensity: v / 100 } }))

// --- Reset simulation with current params ---
function resetSim() {
  const total = eduLow.value + eduMed.value + eduHigh.value
  const mix = {
    low: eduLow.value / total,
    medium: eduMed.value / total,
    high: eduHigh.value / total,
  }

  sim.init({
    populationSize: population.value,
    averageLifespan: lifespan.value,
    startingGini: startingGini.value,
    educationMix: mix,
    aiGrowthRate: aiRate.value / 100,
    aiDiffusionRate: aiDiffusion.value / 100,
    redistributionLevel: redistribution.value / 100,
    enableUBI: enableUBI.value,
    immigrationEnabled: immigrationEnabled.value,
    immigrationRate: immigrationRate.value / 100,
    diseasesEnabled: diseasesEnabled.value,
    economyType: economyType.value,
  })
}
</script>

<template>
  <div class="params-panel">
    <h3 class="panel-title">
      INITIAL PARAMETERS
      <span v-if="simStarted" class="param-hint" style="font-weight: 400; letter-spacing: 0">— locked (reset to change)</span>
    </h3>

    <div class="param-group">
      <label>
        Population
        <span class="param-value">{{ population }}</span>
      </label>
      <input type="range" v-model.number="population" :min="50" :max="500" :step="10" :disabled="simStarted" />
    </div>

    <div class="param-group">
      <label>
        Avg Lifespan (years)
        <span class="param-value">{{ lifespan }}</span>
      </label>
      <input type="range" v-model.number="lifespan" :min="50" :max="100" :step="1" :disabled="simStarted" />
      <div class="param-hint">Retirement at ~{{ Math.round(lifespan * 0.85) }}y · Max ~{{ Math.round(lifespan * 1.1) }}y</div>
    </div>

    <div class="param-group">
      <label>
        Starting Gini
        <span class="param-value">{{ startingGini.toFixed(2) }}</span>
      </label>
      <input type="range" v-model.number="startingGini" :min="0.15" :max="0.65" :step="0.01" :disabled="simStarted" />
      <div class="param-hint">0.15 = Nordic &nbsp; 0.65 = extreme inequality</div>
    </div>

    <div class="param-group">
      <label>Economy Type</label>
      <div class="economy-chips">
        <button
          v-for="opt in economyOptions"
          :key="opt.value"
          class="chip"
          :class="{ 'chip--active': economyType === opt.value, 'chip--disabled': simStarted }"
          @click="!simStarted && (economyType = opt.value)"
          :title="opt.description"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="param-hint">Defines workplace distribution at world creation</div>
      <div class="economy-detail">
        <span>🏭 Factory {{ Math.round(selectedMix.manual * 100) }}%</span>
        <span>🏢 Office {{ Math.round(selectedMix.skilled * 100) }}%</span>
        <span>🎨 Studio {{ Math.round(selectedMix.creative * 100) }}%</span>
        <span>🛒 Shop {{ Math.round(selectedMix.service * 100) }}%</span>
      </div>
    </div>

    <h3 class="panel-title">
      EDUCATION MIX
      <span class="param-value" :style="{ color: eduTotal === 100 ? '#81B29A' : '#E07A5F' }">= {{ eduTotal }}%</span>
    </h3>
    <div class="param-hint" style="margin-top: -6px">Sliders auto-balance to 100%</div>
    <div class="param-group">
      <label>Low <span class="param-value">{{ Math.round(eduLow) }}%</span></label>
      <input type="range" v-model.number="eduLow" :min="5" :max="90" :step="5" :disabled="simStarted" />
    </div>
    <div class="param-group">
      <label>Medium <span class="param-value">{{ Math.round(eduMed) }}%</span></label>
      <input type="range" v-model.number="eduMed" :min="5" :max="90" :step="5" :disabled="simStarted" />
    </div>
    <div class="param-group">
      <label>High <span class="param-value">{{ Math.round(eduHigh) }}%</span></label>
      <input type="range" v-model.number="eduHigh" :min="5" :max="90" :step="5" :disabled="simStarted" />
    </div>

    <h3 class="panel-title">LIVE CONTROLS</h3>

    <div class="param-group">
      <label>
        Robotic Automation
        <span class="param-value">{{ aiRate.toFixed(0) }}%/yr</span>
      </label>
      <input type="range" v-model.number="aiRate" :min="0" :max="50" :step="1" />
      <div class="param-hint">Physical/manual job automation (factories, warehouses)</div>
    </div>

    <div class="param-group">
      <label>
        AI Diffusion Rate
        <span class="param-value">{{ aiDiffusion.toFixed(0) }}%/yr</span>
      </label>
      <input type="range" v-model.number="aiDiffusion" :min="0" :max="50" :step="1" />
      <div class="param-hint">AI/LLM displacement of cognitive work (Anthropic data)</div>
    </div>

    <div class="param-group">
      <label>
        Redistribution
        <span class="param-value">{{ redistribution.toFixed(0) }}%</span>
      </label>
      <input type="range" v-model.number="redistribution" :min="0" :max="100" :step="5" />
      <div class="param-hint">Tax &amp; transfer intensity</div>
    </div>

    <div class="param-group">
      <label class="ubi-toggle">
        <input type="checkbox" v-model="immigrationEnabled" />
        <span>Enable Immigration</span>
      </label>
      <div class="param-hint">Toggle immigration &amp; emigration system on/off</div>
    </div>

    <div class="param-group" v-if="immigrationEnabled">
      <label>
        Immigration Rate
        <span class="param-value">{{ immigrationRate.toFixed(0) }}%</span>
      </label>
      <input type="range" v-model.number="immigrationRate" :min="0" :max="100" :step="5" />
      <div class="param-hint">Slot-based: immigrants come if jobs exist. 10% clandestine if no slots.</div>
    </div>

    <div class="param-group">
      <label class="ubi-toggle">
        <input type="checkbox" v-model="enableUBI" />
        <span>Enable UBI (Universal Basic Income)</span>
      </label>
      <div class="param-hint">When enabled, surplus tax revenue is distributed equally to all agents</div>
    </div>

    <div class="param-group">
      <label class="ubi-toggle">
        <input type="checkbox" v-model="diseasesEnabled" />
        <span>Enable Diseases</span>
      </label>
      <div class="param-hint">When disabled, agents cannot fall ill or spread contagion</div>
    </div>

    <h3 class="panel-title">Religion Layer</h3>

    <div class="param-group">
      <label class="ubi-toggle">
        <input type="checkbox" v-model="religionEnabled" :disabled="simStarted" />
        <span>Enable Religion</span>
      </label>
      <div class="param-hint">Assigns religious affiliations that influence marriage, fertility, satisfaction &amp; civic opinions</div>
    </div>

    <div class="param-group" v-if="religionEnabled">
      <label>
        Discrimination Intensity
        <span class="param-value">{{ religionDiscrimination.toFixed(0) }}%</span>
      </label>
      <input type="range" min="0" max="100" step="5" v-model.number="religionDiscrimination" />
      <div class="param-hint">How much minority religious groups experience satisfaction drain (0 = none, 100 = severe)</div>
    </div>

    <button class="reset-btn" @click="resetSim">
      Reset Simulation
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.params-panel {
  padding: $space-md;
  display: flex;
  flex-direction: column;
  gap: $space-md;
}

.panel-title {
  font-size: $font-size-xs;
  font-weight: 600;
  color: $text-muted;
  letter-spacing: 0.08em;
  margin: 0;
  padding-top: $space-sm;
  border-top: 1px solid $border-color;

  &:first-child {
    border-top: none;
    padding-top: 0;
  }
}

.param-group {
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    font-size: $font-size-sm;
    color: $text-secondary;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    background: $bg-button;
    border-radius: 2px;
    outline: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: $color-accent;
      cursor: pointer;
    }

    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;

      &::-webkit-slider-thumb {
        background: $text-muted;
      }
    }
  }
}

.param-value {
  font-family: monospace;
  font-size: $font-size-xs;
  color: $color-accent;
}

.param-hint {
  font-size: 10px;
  color: $text-muted;
  font-style: italic;
}

.economy-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.economy-detail {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;

  span {
    font-size: 10px;
    color: $text-muted;
    background: rgba(255, 255, 255, 0.04);
    padding: 1px 5px;
    border-radius: 3px;
  }
}

.chip {
  padding: 3px 8px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-button;
  color: $text-secondary;
  font-size: $font-size-xs;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: $border-active;
  }

  &--active {
    background: $bg-button-active;
    border-color: $color-accent;
    color: $color-accent;
  }

  &--disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }
}

.ubi-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: $color-accent;
    cursor: pointer;
  }

  span {
    font-size: $font-size-sm;
    color: $text-secondary;
  }
}

.reset-btn {
  padding: $space-sm $space-md;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-button;
  color: $text-primary;
  font-size: $font-size-sm;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;

  &:hover {
    background: $color-accent;
    color: $bg-panel;
    border-color: $color-accent;
  }
}
</style>
