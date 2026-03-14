<script setup lang="ts">
// --- Sandbox Viewport ---
// Container for the Three.js canvas
// Initializes SandboxScene on mount, disposes on unmount

import { ref, onMounted, onBeforeUnmount } from 'vue'
import { SandboxScene } from '../../scene/SandboxScene'

const containerRef = ref<HTMLElement | null>(null)
let scene: SandboxScene | null = null

onMounted(() => {
  if (!containerRef.value) return
  scene = new SandboxScene(containerRef.value)
  scene.start()
})

onBeforeUnmount(() => {
  scene?.dispose()
  scene = null
})
</script>

<template>
  <div ref="containerRef" class="sandbox-viewport" />
</template>

<style scoped lang="scss">
.sandbox-viewport {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  cursor: crosshair;
}
</style>
