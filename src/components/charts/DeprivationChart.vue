<script setup lang="ts">
// --- Deprivation & Stress Chart ---
// Dual line: deprivation share + global stress index
// Tracks exclusion severity and system-wide tension

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
      label: 'Deprivation Share',
      data: getSeriesData('deprivationShare').map(v => v * 100),
      borderColor: CHART_COLORS.deprivation,
      backgroundColor: 'rgba(196, 69, 54, 0.08)',
      fill: true,
    },
    {
      label: 'Stress Index',
      data: getSeriesData('stressIndex').map(v => v * 100),
      borderColor: CHART_COLORS.stress,
      backgroundColor: CHART_COLORS.stressFill,
      fill: true,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'line'>>(() => {
  const opts = baseLineOptions('Deprivation & Stress')
  opts.scales!.y = {
    ...opts.scales!.y,
    title: { display: true, text: 'Level (%)', color: CHART_COLORS.textMuted, font: { size: 10 } },
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
