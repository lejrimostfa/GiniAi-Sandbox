<script setup lang="ts">
// --- Advanced Parameters Panel ---
// Exposes all BehaviorConfig constants as runtime-adjustable sliders
// Grouped by behavior category with collapsible sections
// Updates are live — pushed to simulation engine each tick

import { ref, reactive, watch } from 'vue'
import { useSimStore } from '../../stores/v2SimulationStore'
import { DEFAULT_BEHAVIOR_CONFIG } from '../../simulation/types'
import type { BehaviorConfig } from '../../simulation/types'

const sim = useSimStore()

// Local reactive copy of behavior config (start from current overrides merged with defaults)
const config = reactive<BehaviorConfig>({
  ...DEFAULT_BEHAVIOR_CONFIG,
  ...sim.params.behaviorConfig,
})

// Track which groups are expanded
const expanded = reactive<Record<string, boolean>>({
  crime: false,
  prison: false,
  police: false,
  hospital: false,
  amusement: false,
  family: false,
  housing: false,
  strikes: false,
  economy: false,
  disease: false,
})

// Slider definitions: grouped by category
// Each slider: { key, label, min, max, step, unit? }
interface SliderDef {
  key: keyof BehaviorConfig
  label: string
  min: number
  max: number
  step: number
  unit?: string
}

interface GroupDef {
  id: string
  icon: string
  title: string
  sliders: SliderDef[]
}

const groups: GroupDef[] = [
  {
    id: 'crime', icon: '🥷', title: 'Crime',
    sliders: [
      { key: 'crimeUnemploymentTicks', label: 'Unemployment ticks before crime', min: 4, max: 104, step: 1, unit: 'ticks' },
      { key: 'crimeWealthThreshold', label: 'Poverty threshold', min: 5, max: 100, step: 1, unit: '$' },
      { key: 'crimeSatisfactionThreshold', label: 'Satisfaction threshold', min: 0.05, max: 0.60, step: 0.01 },
      { key: 'crimeSuccessBaseProb', label: 'Robbery success rate', min: 0.05, max: 0.80, step: 0.01 },
      { key: 'crimeAttemptCooldown', label: 'Attempt cooldown', min: 1, max: 20, step: 1, unit: 'ticks' },
    ],
  },
  {
    id: 'prison', icon: '🔒', title: 'Prison',
    sliders: [
      { key: 'prisonSentenceMin', label: 'Min sentence', min: 1, max: 52, step: 1, unit: 'weeks' },
      { key: 'prisonSentenceMax', label: 'Max sentence', min: 4, max: 156, step: 1, unit: 'weeks' },
      { key: 'prisonCostPerPrisoner', label: 'Cost per prisoner', min: 1, max: 30, step: 1, unit: '$/tick' },
    ],
  },
  {
    id: 'police', icon: '👮', title: 'Police',
    sliders: [
      { key: 'policeBaseRatio', label: 'Base ratio (1 per N)', min: 10, max: 200, step: 5 },
      { key: 'arrestSuccessRate', label: 'Arrest success rate', min: 0.1, max: 1.0, step: 0.05 },
      { key: 'policeDeterrentRadius', label: 'Deterrent radius', min: 2, max: 30, step: 1 },
      { key: 'policeDeterrentFactor', label: 'Deterrent factor', min: 0.1, max: 0.9, step: 0.05 },
    ],
  },
  {
    id: 'hospital', icon: '🏥', title: 'Hospital',
    sliders: [
      { key: 'hospitalBirthCost', label: 'Birth cost (gov)', min: 5, max: 80, step: 1, unit: '$' },
      { key: 'hospitalTreatmentCost', label: 'Treatment cost', min: 2, max: 50, step: 1, unit: '$' },
      { key: 'hospitalMaintenanceCost', label: 'Maintenance cost', min: 1, max: 20, step: 1, unit: '$/tick' },
      { key: 'hospitalRecoveryProb', label: 'Recovery probability', min: 0.05, max: 0.80, step: 0.01 },
      { key: 'hospitalBirthMortalityNoHospital', label: 'Birth mortality (no hospital)', min: 0.0, max: 0.30, step: 0.01 },
    ],
  },
  {
    id: 'amusement', icon: '🎡', title: 'Amusement Park',
    sliders: [
      { key: 'amusementParkEntryCost', label: 'Entry cost', min: 1, max: 30, step: 1, unit: '$' },
      { key: 'amusementParkSatBoost', label: 'Satisfaction boost', min: 0.01, max: 0.40, step: 0.01 },
      { key: 'amusementParkVisitProb', label: 'Visit probability', min: 0.01, max: 0.40, step: 0.01 },
    ],
  },
  {
    id: 'family', icon: '👨‍👩‍👧', title: 'Family & Fertility',
    sliders: [
      { key: 'normalSatThreshold', label: 'Satisfaction for conception', min: 0.1, max: 0.9, step: 0.01 },
      { key: 'poorSatThreshold', label: 'Poor couple threshold', min: 0.05, max: 0.5, step: 0.01 },
      { key: 'normalMaxChildren', label: 'Max children (normal)', min: 1, max: 10, step: 1 },
      { key: 'poorMaxChildren', label: 'Max children (poor)', min: 1, max: 12, step: 1 },
      { key: 'povertyFertilityBoostMax', label: 'Poverty fertility boost', min: 0.0, max: 0.8, step: 0.01 },
    ],
  },
  {
    id: 'housing', icon: '🏠', title: 'Housing',
    sliders: [
      { key: 'apartmentRentRatio', label: 'Apartment rent ratio', min: 0.01, max: 0.10, step: 0.005 },
      { key: 'houseRentRatio', label: 'House rent ratio', min: 0.01, max: 0.15, step: 0.005 },
    ],
  },
  {
    id: 'strikes', icon: '✊', title: 'Strikes',
    sliders: [
      { key: 'strikeDissatisfactionThreshold', label: 'Dissatisfaction threshold', min: 0.10, max: 0.80, step: 0.01 },
      { key: 'strikeBaseProbability', label: 'Base probability', min: 0.01, max: 0.50, step: 0.01 },
    ],
  },
  {
    id: 'economy', icon: '💰', title: 'Economy',
    sliders: [
      { key: 'capitalReturnRate', label: 'Capital return rate (r)', min: 0.0, max: 0.15, step: 0.005 },
      { key: 'capitalReturnThreshold', label: 'Capital threshold', min: 50, max: 500, step: 10, unit: '$' },
      { key: 'passiveLivingCost', label: 'Living cost', min: 0, max: 15, step: 0.5, unit: '$/tick' },
      { key: 'entrepreneurProb', label: 'Entrepreneur probability', min: 0.01, max: 0.20, step: 0.01 },
    ],
  },
  {
    id: 'disease', icon: '🦠', title: 'Disease',
    sliders: [
      { key: 'diseasePovertyTicks', label: 'Poverty ticks before sick', min: 1, max: 30, step: 1, unit: 'ticks' },
      { key: 'diseaseWealthThreshold', label: 'Wealth threshold', min: 10, max: 100, step: 5, unit: '$' },
      { key: 'deathSickTicks', label: 'Sick ticks before death risk', min: 2, max: 40, step: 1, unit: 'ticks' },
    ],
  },
]

function toggleGroup(id: string) {
  expanded[id] = !expanded[id]
}

function formatValue(val: number, step: number): string {
  if (step >= 1) return String(Math.round(val))
  if (step >= 0.1) return val.toFixed(1)
  if (step >= 0.01) return val.toFixed(2)
  return val.toFixed(3)
}

function resetGroup(group: GroupDef) {
  for (const s of group.sliders) {
    config[s.key] = DEFAULT_BEHAVIOR_CONFIG[s.key]
  }
}

function resetAll() {
  Object.assign(config, DEFAULT_BEHAVIOR_CONFIG)
}

// Push changes to store whenever any config value changes
watch(config, () => {
  // Build partial override: only include values that differ from defaults
  const overrides: Partial<BehaviorConfig> = {}
  for (const key of Object.keys(DEFAULT_BEHAVIOR_CONFIG) as (keyof BehaviorConfig)[]) {
    if (config[key] !== DEFAULT_BEHAVIOR_CONFIG[key]) {
      (overrides as Record<string, number>)[key] = config[key]
    }
  }
  sim.updateParams({ behaviorConfig: overrides })
}, { deep: true })

const showPanel = ref(false)
</script>

<template>
  <div class="adv-params">
    <button class="adv-params__toggle" @click="showPanel = !showPanel">
      <span>⚙️ Advanced Parameters</span>
      <span class="adv-params__chevron" :class="{ open: showPanel }">▾</span>
    </button>

    <div v-if="showPanel" class="adv-params__body">
      <div class="adv-params__actions">
        <button class="adv-params__reset-all" @click="resetAll" title="Reset all to defaults">
          🔄 Reset All
        </button>
      </div>

      <div v-for="group in groups" :key="group.id" class="adv-group">
        <button class="adv-group__header" @click="toggleGroup(group.id)">
          <span class="adv-group__icon">{{ group.icon }}</span>
          <span class="adv-group__title">{{ group.title }}</span>
          <span class="adv-group__chevron" :class="{ open: expanded[group.id] }">▸</span>
          <button
            class="adv-group__reset"
            @click.stop="resetGroup(group)"
            title="Reset group"
          >↺</button>
        </button>

        <div v-if="expanded[group.id]" class="adv-group__sliders">
          <div v-for="s in group.sliders" :key="s.key" class="adv-slider">
            <div class="adv-slider__header">
              <label class="adv-slider__label">{{ s.label }}</label>
              <span class="adv-slider__value">
                {{ formatValue(config[s.key], s.step) }}<span v-if="s.unit" class="adv-slider__unit">{{ s.unit }}</span>
              </span>
            </div>
            <input
              type="range"
              class="adv-slider__input"
              :min="s.min"
              :max="s.max"
              :step="s.step"
              v-model.number="config[s.key]"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.adv-params {
  border-top: 1px solid $border-color;
  margin-top: $space-sm;

  &__toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $space-sm $space-md;
    background: transparent;
    border: none;
    color: $text-secondary;
    font-size: $font-size-sm;
    font-family: $font-sans;
    cursor: pointer;
    transition: color 0.15s;
    &:hover { color: $text-primary; }
  }

  &__chevron {
    font-size: 12px;
    transition: transform 0.2s;
    &.open { transform: rotate(180deg); }
  }

  &__body {
    padding: 0 $space-sm $space-sm;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    margin-bottom: $space-xs;
  }

  &__reset-all {
    background: rgba(50, 50, 75, 0.6);
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    padding: 2px 8px;
    font-size: $font-size-xs;
    color: $text-muted;
    cursor: pointer;
    font-family: $font-sans;
    transition: background 0.15s, color 0.15s;
    &:hover {
      background: rgba(70, 70, 100, 0.8);
      color: $text-primary;
    }
  }
}

.adv-group {
  margin-bottom: 2px;
  border-radius: $radius-sm;
  overflow: hidden;

  &__header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: $space-xs;
    padding: 4px $space-sm;
    background: rgba(40, 40, 60, 0.5);
    border: none;
    color: $text-secondary;
    font-size: $font-size-sm;
    font-family: $font-sans;
    cursor: pointer;
    transition: background 0.15s;
    &:hover { background: rgba(50, 50, 75, 0.7); }
  }

  &__icon {
    font-size: 12px;
    width: 18px;
    text-align: center;
  }

  &__title {
    flex: 1;
    text-align: left;
    font-weight: 500;
  }

  &__chevron {
    font-size: 10px;
    color: $text-muted;
    transition: transform 0.2s;
    &.open { transform: rotate(90deg); }
  }

  &__reset {
    background: none;
    border: none;
    color: $text-muted;
    font-size: 12px;
    cursor: pointer;
    padding: 0 2px;
    opacity: 0.5;
    transition: opacity 0.15s;
    &:hover { opacity: 1; color: $text-accent; }
  }

  &__sliders {
    padding: $space-xs $space-sm $space-sm;
    background: rgba(30, 30, 50, 0.4);
  }
}

.adv-slider {
  margin-bottom: $space-xs;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 1px;
  }

  &__label {
    font-size: $font-size-xs;
    color: $text-muted;
    font-family: $font-sans;
  }

  &__value {
    font-size: $font-size-xs;
    font-family: $font-mono;
    color: $text-accent;
    min-width: 40px;
    text-align: right;
  }

  &__unit {
    font-size: 9px;
    color: $text-muted;
    margin-left: 2px;
  }

  &__input {
    width: 100%;
    height: 14px;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    outline: none;
    cursor: pointer;

    &::-webkit-slider-runnable-track {
      height: 3px;
      background: rgba(100, 100, 140, 0.3);
      border-radius: 2px;
    }

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 10px;
      height: 10px;
      background: $color-accent;
      border-radius: 50%;
      margin-top: -3.5px;
      cursor: pointer;
      transition: transform 0.1s;
    }

    &:hover::-webkit-slider-thumb {
      transform: scale(1.3);
    }

    &::-moz-range-track {
      height: 3px;
      background: rgba(100, 100, 140, 0.3);
      border-radius: 2px;
    }

    &::-moz-range-thumb {
      width: 10px;
      height: 10px;
      background: $color-accent;
      border-radius: 50%;
      border: none;
      cursor: pointer;
    }
  }
}
</style>
