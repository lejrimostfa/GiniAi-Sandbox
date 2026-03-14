<script setup lang="ts">
// --- Phase Diagram Chart ---
// Scatter/line: Gini vs Precarious Share (parametric trajectory)
// Reveals regime basins and transition paths — key for publication

import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import { useMetricsHistory } from '../../composables/useMetricsHistory'
import { useSimulationStore } from '../../stores/simulationStore'
import { CHART_COLORS, cursorPlugin } from './chartConfig'
import type { ChartData, ChartOptions } from 'chart.js'

const { history } = useMetricsHistory()
const sim = useSimulationStore()

const chartData = computed<ChartData<'line'>>(() => {
  // Trajectory: each point is (precariousShare, gini)
  const points = history.value.map((h) => ({
    x: h.precariousShare * 100,
    y: h.gini,
  }))

  // Highlight current step point
  const current = history.value[sim.currentStep]
  const currentPoint = current
    ? [{ x: current.precariousShare * 100, y: current.gini }]
    : []

  return {
    datasets: [
      {
        label: 'Trajectory',
        data: points,
        borderColor: CHART_COLORS.gini,
        backgroundColor: 'transparent',
        showLine: true,
        tension: 0.2,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 3,
      },
      {
        label: 'Current',
        data: currentPoint,
        borderColor: CHART_COLORS.cursor,
        backgroundColor: 'rgba(212, 165, 116, 0.8)',
        pointRadius: 6,
        pointHoverRadius: 8,
        showLine: false,
      },
    ],
  }
})

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 0 },
  interaction: { mode: 'nearest', intersect: false },
  plugins: {
    title: {
      display: true,
      text: 'Phase Diagram: Gini vs Precarious Share',
      color: CHART_COLORS.text,
      font: { size: 12, weight: 'bold' },
      padding: { bottom: 8 },
    },
    legend: {
      display: true,
      position: 'top',
      labels: {
        color: CHART_COLORS.text,
        font: { size: 10 },
        boxWidth: 12,
        boxHeight: 2,
        padding: 8,
        usePointStyle: true,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(26, 26, 46, 0.95)',
      titleColor: '#E8E8E8',
      bodyColor: '#A0A0B0',
      borderColor: 'rgba(100, 100, 140, 0.3)',
      borderWidth: 1,
      bodyFont: { size: 10, family: 'monospace' },
      callbacks: {
        label: (ctx) => {
          const p = ctx.parsed
          return `Precarious: ${(p.x ?? 0).toFixed(1)}%  Gini: ${(p.y ?? 0).toFixed(3)}`
        },
      },
    },
  },
  scales: {
    x: {
      type: 'linear',
      title: { display: true, text: 'Precarious Share (%)', color: CHART_COLORS.textMuted, font: { size: 10 } },
      ticks: { color: CHART_COLORS.textMuted, font: { size: 9 } },
      grid: { color: CHART_COLORS.grid },
      min: 0,
    },
    y: {
      title: { display: true, text: 'Gini Coefficient', color: CHART_COLORS.textMuted, font: { size: 10 } },
      ticks: { color: CHART_COLORS.textMuted, font: { size: 9, family: 'monospace' } },
      grid: { color: CHART_COLORS.grid },
      min: 0,
      max: 1,
    },
  },
}))

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
