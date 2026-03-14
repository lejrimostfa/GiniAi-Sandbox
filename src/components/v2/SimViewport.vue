<script setup lang="ts">
// --- V2 Simulation Viewport ---
// Hosts the Three.js AgentScene, feeds it world state each tick
// Connected to v2SimulationStore

import { ref, onMounted, onUnmounted, watch } from 'vue'
import { AgentScene } from '../../scene/v2/AgentScene'
import { useSimStore } from '../../stores/v2SimulationStore'

const canvasContainer = ref<HTMLElement | null>(null)
let scene: AgentScene | null = null
const sim = useSimStore()

onMounted(() => {
  if (!canvasContainer.value) return
  scene = new AgentScene(canvasContainer.value)

  // Feed initial state
  if (sim.worldState) {
    scene.update(sim.worldState)
  }
})

// Watch for world state changes and update scene
watch(() => sim.worldState, (state) => {
  if (state && scene) {
    scene.update(state)
  }
}, { flush: 'post' })

onUnmounted(() => {
  scene?.dispose()
  scene = null
})
</script>

<template>
  <div ref="canvasContainer" class="sim-viewport" />
</template>

<style scoped>
.sim-viewport {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
