<script setup lang="ts">
// --- Root App Component (v2) ---
// Initializes the Primer-style ABM simulation and renders the v2 layout

import { onMounted } from 'vue'
import V2Layout from './components/v2/V2Layout.vue'
import { useSimStore } from './stores/v2SimulationStore'

const sim = useSimStore()

onMounted(() => {
  // Initialize simulation with default parameters
  sim.init()
})
</script>

<template>
  <V2Layout />
</template>
