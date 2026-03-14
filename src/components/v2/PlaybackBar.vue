<script setup lang="ts">
// --- V2 Playback Bar ---
// Play/pause/step, speed control, tick display
// Connected to v2SimulationStore

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSimStore } from '../../stores/v2SimulationStore'
import eventBus from '../../events/eventBus'

const sim = useSimStore()

const speeds = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30]
const speedLabel = computed(() => {
  const s = sim.speed
  return s < 1 ? `×${s}` : `×${s}`
})

// Time computations: each tick = 1 week (ticksPerYear = 52)
const ticksPerYear = 52
const currentWeek = computed(() => (sim.currentTick % ticksPerYear) + 1)
const currentYear = computed(() => Math.floor(sim.currentTick / ticksPerYear))

function togglePlay() {
  if (sim.isPlaying) {
    sim.pause()
  } else {
    sim.play()
  }
}

function cycleSpeed() {
  const idx = speeds.indexOf(sim.speed)
  const next = speeds[(idx + 1) % speeds.length]
  sim.setSpeed(next)
}

function speedUp() {
  const idx = speeds.indexOf(sim.speed)
  if (idx < speeds.length - 1) sim.setSpeed(speeds[idx + 1])
}

function speedDown() {
  const idx = speeds.indexOf(sim.speed)
  if (idx > 0) sim.setSpeed(speeds[idx - 1])
}

// --- Keyboard shortcuts ---
function onKeydown(e: KeyboardEvent) {
  // Ignore if user is typing in an input/textarea
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  if (e.code === 'Space') {
    e.preventDefault()
    togglePlay()
  } else if (e.key === '+' || e.key === '=') {
    speedUp()
  } else if (e.key === '-') {
    speedDown()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

const showExportMenu = ref(false)

function toggleExportMenu() {
  showExportMenu.value = !showExportMenu.value
}

function doExport(fn: () => void) {
  fn()
  showExportMenu.value = false
}

const emit = defineEmits<{
  (e: 'toggleCharts'): void
}>()
</script>

<template>
  <div class="playback-bar">
    <div class="playback-bar__controls">
      <!-- Play/Pause -->
      <button class="pb-btn" @click="togglePlay" :title="sim.isPlaying ? 'Pause' : 'Play'">
        {{ sim.isPlaying ? '⏸' : '▶' }}
      </button>

      <!-- Step -->
      <button class="pb-btn" @click="sim.step()" title="Step forward">
        ⏭
      </button>

      <!-- Speed -->
      <button class="pb-btn pb-btn--speed-ctrl" @click="speedDown" title="Slow down (-)">
        −
      </button>
      <button class="pb-btn pb-btn--speed" @click="cycleSpeed" title="Change speed">
        {{ speedLabel }}
      </button>
      <button class="pb-btn pb-btn--speed-ctrl" @click="speedUp" title="Speed up (+)">
        +
      </button>

      <!-- Reset camera -->
      <button class="pb-btn" @click="eventBus.emit('camera:reset')" title="Reset camera">
        ⟳
      </button>
    </div>

    <!-- Tick display -->
    <div class="playback-bar__info">
      <span class="playback-bar__tick">
        Week <strong>{{ currentWeek }}</strong>/52
        &nbsp;·&nbsp;
        Year <strong>{{ currentYear }}</strong>
      </span>
      <span class="playback-bar__pop">
        Pop: <strong>{{ sim.agents.length }}</strong>
      </span>
    </div>

    <!-- Export menu -->
    <div class="export-wrapper">
      <button class="pb-btn pb-btn--export" @click="toggleExportMenu" title="Export data" :disabled="!sim.hasData">
        💾
      </button>
      <div v-if="showExportMenu" class="export-menu">
        <div class="export-menu__title">Individual exports</div>
        <button class="export-menu__item" @click="doExport(sim.exportParams)">
          ⚙️ Parameters
        </button>
        <button class="export-menu__item" @click="doExport(sim.exportTimeSeries)">
          � Time-Series (all ticks)
        </button>
        <button class="export-menu__item" @click="doExport(sim.exportAgents)">
          🧑 Agents (state + history)
        </button>
        <button class="export-menu__item" @click="doExport(sim.exportLocations)">
          🏢 Locations
        </button>
        <button class="export-menu__item" @click="doExport(sim.exportLifeEvents)">
          � Life Events (all agents)
        </button>
        <button class="export-menu__item" @click="doExport(sim.exportWealthData)">
          💰 Wealth Distribution
        </button>
        <div class="export-menu__sep"></div>
        <div class="export-menu__title">Legacy</div>
        <button class="export-menu__item" @click="doExport(sim.exportInitialSnapshot)">
          � Initial Snapshot
        </button>
        <button class="export-menu__item" @click="doExport(sim.exportFinalSnapshot)">
          📸 Current Snapshot
        </button>
        <div class="export-menu__sep"></div>
        <button class="export-menu__item export-menu__item--accent" @click="doExport(sim.exportAllSeparate)">
          📦 Export All (6 files)
        </button>
      </div>
    </div>

    <!-- Charts toggle -->
    <button class="charts-toggle" @click="emit('toggleCharts')" title="Toggle Charts">
      📊 Charts
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.playback-bar {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 $space-md;
  background: $bg-panel;
  border-top: 1px solid $border-color;
  gap: $space-md;

  &__controls {
    display: flex;
    gap: 4px;
  }

  &__info {
    display: flex;
    gap: $space-md;
    font-size: $font-size-sm;
    color: $text-secondary;
    font-family: monospace;
  }

  &__tick strong,
  &__pop strong {
    color: $text-primary;
  }
}

.pb-btn {
  width: 32px;
  height: 28px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-button;
  color: $text-secondary;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s;

  &:hover {
    background: $bg-button-hover;
    border-color: $border-active;
  }

  &--speed {
    width: auto;
    padding: 0 8px;
    font-size: $font-size-xs;
    font-family: monospace;
    font-weight: 600;
    color: $color-accent;
  }

  &--speed-ctrl {
    width: 24px;
    font-size: 16px;
    font-weight: 700;
    color: $text-muted;
    &:hover { color: $color-accent; }
  }
}

.export-wrapper {
  position: relative;
  margin-left: auto;
}

.export-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 6px;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  padding: 4px 0;
  min-width: 240px;
  max-height: 400px;
  overflow-y: auto;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
  z-index: 100;

  &__title {
    padding: 4px 12px 2px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(255, 255, 255, 0.35);
  }

  &__item {
    display: block;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: $text-secondary;
    font-size: $font-size-sm;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;

    &:hover {
      background: rgba(255, 255, 255, 0.06);
      color: $text-primary;
    }

    &--accent {
      color: $color-accent;
      font-weight: 600;
    }
  }

  &__sep {
    height: 1px;
    background: $border-color;
    margin: 4px 0;
  }
}

.charts-toggle {
  padding: 4px $space-md;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-button;
  color: $text-secondary;
  font-size: $font-size-sm;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: $bg-button-hover;
    border-color: $border-active;
  }
}
</style>
