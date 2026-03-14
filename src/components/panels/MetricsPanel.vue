<script setup lang="ts">
// --- Metrics Panel ---
// Displays 12 real-time metrics from the current snapshot
// Each metric has a label, value, and optional glossary tooltip
// Connected to simulationStore.currentSnapshot

import { computed } from 'vue'
import { useSimulationStore } from '../../stores/simulationStore'

const sim = useSimulationStore()
const metrics = computed(() => sim.currentSnapshot?.metrics ?? null)
const step = computed(() => sim.currentSnapshot?.step ?? 0)

interface MetricDef {
  key: string
  label: string
  format: (v: number) => string
  color?: string
  help: string
}

const metricDefs: MetricDef[] = [
  {
    key: 'workerShare', label: 'Workers',
    format: (v) => `${(v * 100).toFixed(1)}%`,
    color: '#5B8FB9',
    help: 'Share of agents in Worker state (integrated, employed)',
  },
  {
    key: 'precariousShare', label: 'Precarious',
    format: (v) => `${(v * 100).toFixed(1)}%`,
    color: '#E07A5F',
    help: 'Share of agents in Precarious state (displaced, fragile)',
  },
  {
    key: 'ownerShare', label: 'Owners',
    format: (v) => `${(v * 100).toFixed(1)}%`,
    color: '#3D405B',
    help: 'Share of agents owning automated productive capital',
  },
  {
    key: 'gini', label: 'Gini',
    format: (v) => v.toFixed(3),
    color: '#D4A574',
    help: 'Gini coefficient of resource distribution (0 = equal, 1 = max inequality)',
  },
  {
    key: 'deprivationShare', label: 'Deprivation',
    format: (v) => `${(v * 100).toFixed(1)}%`,
    color: '#C44536',
    help: 'Share of agents in deprivation (precarious with very low resources)',
  },
  {
    key: 'mobilityPW', label: 'Mobility P→W',
    format: (v) => `${(v * 100).toFixed(1)}%`,
    help: 'Transition rate from Precarious to Worker (upward mobility)',
  },
  {
    key: 'mobilityWP', label: 'Mobility W→P',
    format: (v) => `${(v * 100).toFixed(1)}%`,
    help: 'Transition rate from Worker to Precarious (downward mobility)',
  },
  {
    key: 'largestPrecariousCluster', label: 'Max Cluster',
    format: (v) => v.toFixed(0),
    color: '#E07A5F',
    help: 'Size of the largest connected cluster of precarious agents',
  },
  {
    key: 'meanClusterSize', label: 'Mean Cluster',
    format: (v) => v.toFixed(1),
    help: 'Average size of precarious agent clusters',
  },
  {
    key: 'redistributionLevel', label: 'Redistribution',
    format: (v) => v.toFixed(2),
    color: '#81B29A',
    help: 'Current redistribution intensity parameter (ρ)',
  },
  {
    key: 'stressIndex', label: 'Stress Index',
    format: (v) => v.toFixed(3),
    color: '#C44536',
    help: 'Mean stress across all agents (0 = no stress, 1 = max)',
  },
]

function getMetricValue(key: string): number {
  if (!metrics.value) return 0
  return (metrics.value as unknown as Record<string, number>)[key] ?? 0
}
</script>

<template>
  <div class="metrics-panel panel">
    <div class="panel__title">
      Metrics
      <span style="float: right; font-family: monospace; color: #D4A574;">
        Step {{ step }}
      </span>
    </div>

    <div class="metrics-grid">
      <div
        v-for="m in metricDefs"
        :key="m.key"
        class="metric-card"
      >
        <div class="metric-card__label">
          <span>{{ m.label }}</span>
          <span class="metric-card__help" :title="m.help">?</span>
        </div>
        <div
          class="metric-card__value"
          :style="m.color ? { color: m.color } : {}"
        >
          {{ metrics ? m.format(getMetricValue(m.key)) : '—' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.metrics-panel {
  overflow-y: auto;
}

.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $space-xs;
}

@media (max-width: 1400px) {
  .metrics-grid {
    grid-template-columns: 1fr;
  }
}
</style>
