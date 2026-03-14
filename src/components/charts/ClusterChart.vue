<script setup lang="ts">
// --- Cluster Dynamics Chart ---
// Dual line: largest precarious cluster + mean cluster size
// Shows spatial clustering / entrapment evolution

import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import { useMetricsHistory } from '../../composables/useMetricsHistory'
import { useSimulationStore } from '../../stores/simulationStore'
import { baseLineOptions, CHART_COLORS, cursorPlugin } from './chartConfig'
import type { ChartData, ChartOptions } from 'chart.js'

const { stepLabels, getSeriesData } = useMetricsHistory()
const sim = useSimulationStore()

const chartData = computed<ChartData<'line'>>(() => ({
  labels: stepLabels.value,
  datasets: [
    {
      label: 'Largest Cluster',
      data: getSeriesData('largestPrecariousCluster'),
      borderColor: CHART_COLORS.clusterMax,
      backgroundColor: 'rgba(224, 122, 95, 0.1)',
      fill: true,
    },
    {
      label: 'Mean Cluster Size',
      data: getSeriesData('meanClusterSize'),
      borderColor: CHART_COLORS.clusterMean,
      backgroundColor: 'transparent',
      borderDash: [4, 3],
    },
  ],
}))

const chartOptions = computed<ChartOptions<'line'>>(() => {
  const opts = baseLineOptions('Precarious Cluster Dynamics')
  opts.scales!.y = {
    ...opts.scales!.y,
    title: { display: true, text: 'Cluster Size (cells)', color: CHART_COLORS.textMuted, font: { size: 10 } },
    min: 0,
  }
  return opts
})

const plugins = computed(() => [cursorPlugin(sim.currentStep)])
</script>

<template>
  <div class="chart-container">
    <Line :data="chartData" :options="chartOptions" :plugins="plugins" />
  </div>
</template>

<style scoped>
.chart-container {
  width: 100%;
  height: 100%;
  min-height: 200px;
}
</style>
