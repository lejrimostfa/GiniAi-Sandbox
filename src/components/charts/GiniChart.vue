<script setup lang="ts">
// --- Gini Coefficient Chart ---
// Line chart: Gini index over time
// Key inequality metric for publication

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
      label: 'Gini Coefficient',
      data: getSeriesData('gini'),
      borderColor: CHART_COLORS.gini,
      backgroundColor: CHART_COLORS.giniFill,
      fill: true,
    },
    {
      label: 'Redistribution (ρ)',
      data: getSeriesData('redistributionLevel'),
      borderColor: CHART_COLORS.redistribution,
      backgroundColor: CHART_COLORS.redistributionFill,
      fill: true,
      borderDash: [5, 3],
    },
  ],
}))

const chartOptions = computed<ChartOptions<'line'>>(() => {
  const opts = baseLineOptions('Inequality & Redistribution')
  opts.scales!.y = {
    ...opts.scales!.y,
    title: { display: true, text: 'Index', color: CHART_COLORS.textMuted, font: { size: 10 } },
    min: 0,
    max: 1,
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
