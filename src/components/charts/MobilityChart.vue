<script setup lang="ts">
// --- Mobility Rates Chart ---
// Dual line: P→W (upward) and W→P (downward) mobility rates
// Critical for detecting mobility collapse regimes

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
      label: 'P → W (upward)',
      data: getSeriesData('mobilityPW').map(v => v * 100),
      borderColor: CHART_COLORS.mobilityUp,
      backgroundColor: 'transparent',
    },
    {
      label: 'W → P (downward)',
      data: getSeriesData('mobilityWP').map(v => v * 100),
      borderColor: CHART_COLORS.mobilityDown,
      backgroundColor: 'transparent',
    },
  ],
}))

const chartOptions = computed<ChartOptions<'line'>>(() => {
  const opts = baseLineOptions('Social Mobility Rates')
  opts.scales!.y = {
    ...opts.scales!.y,
    title: { display: true, text: 'Rate (%)', color: CHART_COLORS.textMuted, font: { size: 10 } },
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
