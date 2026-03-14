<script setup lang="ts">
// --- Playback Controls ---
// Play / Pause / Step / Reset / Speed / Timeline scrubber
// Connected to simulationStore via actions and reactive state

import { computed } from 'vue'
import { useSimulationStore } from '../../stores/simulationStore'
import { PLAYBACK_SPEEDS } from '../../types/visualization'
import eventBus from '../../events/eventBus'

const sim = useSimulationStore()

const isPlaying = computed(() => sim.isPlaying)
const currentStep = computed(() => sim.currentStep)
const totalSteps = computed(() => sim.totalSteps)
const speed = computed(() => sim.playbackSpeed)

function togglePlay() {
  if (sim.isPlaying) {
    sim.pause()
  } else {
    sim.play()
  }
}

function onSeek(event: Event) {
  const target = event.target as HTMLInputElement
  sim.seek(Number(target.value))
}

function cycleSpeed() {
  const speeds = PLAYBACK_SPEEDS
  const idx = speeds.indexOf(speed.value as typeof speeds[number])
  const next = speeds[(idx + 1) % speeds.length]
  sim.setSpeed(next)
}

function resetCamera() {
  eventBus.emit('camera:reset', undefined)
}
</script>

<template>
  <div class="playback">
    <div class="playback__buttons">
      <button class="btn btn--icon" @click="sim.stop()" title="Stop">
        &#9632;
      </button>
      <button class="btn btn--icon" @click="sim.stepBackward()" title="Step Back">
        &#9664;
      </button>
      <button
        class="btn btn--icon"
        :class="{ 'btn--active': isPlaying }"
        @click="togglePlay"
        :title="isPlaying ? 'Pause' : 'Play'"
      >
        {{ isPlaying ? '&#10074;&#10074;' : '&#9654;' }}
      </button>
      <button class="btn btn--icon" @click="sim.stepForward()" title="Step Forward">
        &#9654;&#124;
      </button>
      <button class="btn" @click="cycleSpeed" title="Playback Speed">
        {{ speed }}x
      </button>
      <button class="btn btn--icon" @click="resetCamera" title="Reset Camera">
        &#8634;
      </button>
    </div>

    <div class="playback__timeline" v-if="totalSteps > 0">
      <span class="playback__step">{{ currentStep }}</span>
      <input
        type="range"
        :min="0"
        :max="totalSteps - 1"
        :value="currentStep"
        @input="onSeek"
        class="playback__scrubber"
      />
      <span class="playback__step">{{ totalSteps - 1 }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.playback {
  display: flex;
  align-items: center;
  gap: $space-lg;
  padding: $space-sm $space-lg;
  background: $bg-panel;
  border-top: 1px solid $border-color;
  height: $bottombar-height;

  &__buttons {
    display: flex;
    align-items: center;
    gap: $space-xs;
  }

  &__timeline {
    flex: 1;
    display: flex;
    align-items: center;
    gap: $space-sm;
  }

  &__scrubber {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: rgba(100, 100, 140, 0.3);
    outline: none;

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: $color-accent;
      cursor: pointer;
    }
  }

  &__step {
    font-family: $font-mono;
    font-size: $font-size-xs;
    color: $text-secondary;
    min-width: 30px;
    text-align: center;
  }
}
</style>
