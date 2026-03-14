<script setup lang="ts">
// --- Population Distribution Chart ---
// Stacked area: Worker%, Precarious%, Owner% over time
// Key chart for publication: shows regime composition dynamics

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
      label: 'Workers (W)',
      data: getSeriesData('workerShare').map(v => v * 100),
      borderColor: CHART_COLORS.worker,
      backgroundColor: CHART_COLORS.workerFill,
      fill: true,
      order: 3,
    },
    {
      label: 'Precarious (P)',
      data: getSeriesData('precariousShare').map(v => v * 100),
      borderColor: CHART_COLORS.precarious,
      backgroundColor: CHART_COLORS.precariousFill,
      fill: true,
      order: 2,
    },
    {
      label: 'Owners (O)',
      data: getSeriesData('ownerShare').map(v => v * 100),
      borderColor: CHART_COLORS.owner,
      backgroundColor: CHART_COLORS.ownerFill,
      fill: true,
      order: 1,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'line'>>(() => {
  const opts = baseLineOptions('Agent Type Distribution')
  opts.scales!.y = {
    ...opts.scales!.y,
    title: { display: true, text: 'Share (%)', color: CHART_COLORS.textMuted, font: { size: 10 } },
    min: 0,
    max: 100,
    stacked: true,
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
