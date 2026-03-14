<script setup lang="ts">
// --- V2 Charts Panel ---
// Tabbed charts: Gini, Employment, Wealth, Automation, Satisfaction,
// Wealth Distribution (bar), Societal Phenomena (line), Cross-Variable (scatter)

import { ref, computed } from 'vue'
import { Line, Bar, Scatter } from 'vue-chartjs'
import { Chart as ChartJS } from 'chart.js'
import { useSimStore } from '../../stores/v2SimulationStore'
import { baseLineOptions, CHART_COLORS, ZOOM_OPTIONS } from '../charts/chartConfig'
import type { ChartData, ChartOptions } from 'chart.js'

const sim = useSimStore()
const activeTab = ref('gini')

const tabs = [
  { id: 'gini', label: 'Gini' },
  { id: 'employment', label: 'Employment' },
  { id: 'wealth', label: 'Wealth' },
  { id: 'wealthDist', label: 'Distribution' },
  { id: 'automation', label: 'Automation' },
  { id: 'satisfaction', label: 'Satisfaction' },
  { id: 'societal', label: 'Societal' },
  { id: 'scatter', label: 'Cross-Var' },
]

const labels = computed(() => sim.metricsHistory.map((m) => {
  const week = m.tick
  return `W${week}`
}))

// --- Gini chart ---
const giniData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: [{
    label: 'Gini Coefficient',
    data: sim.metricsHistory.map((m) => m.giniCoefficient),
    borderColor: CHART_COLORS.gini, backgroundColor: CHART_COLORS.giniFill, fill: true,
  }],
}))
const giniOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('Gini Coefficient over Time')
  o.scales!.y = { ...o.scales!.y, min: 0, max: 1,
    title: { display: true, text: 'Gini', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  return o
})

// --- Employment chart ---
const empData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: [
    { label: 'Employed', data: sim.metricsHistory.map((m) => m.employedCount),
      borderColor: CHART_COLORS.worker, backgroundColor: CHART_COLORS.workerFill, fill: true },
    { label: 'Unemployed', data: sim.metricsHistory.map((m) => m.unemployedCount),
      borderColor: CHART_COLORS.precarious, backgroundColor: CHART_COLORS.precariousFill, fill: true },
    { label: 'Business Owners', data: sim.metricsHistory.map((m) => m.businessOwnerCount),
      borderColor: 'rgba(155, 114, 170, 1)', backgroundColor: 'rgba(155, 114, 170, 0.15)', fill: true },
  ],
}))
const empOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('Employment Breakdown')
  o.scales!.y = { ...o.scales!.y, min: 0,
    title: { display: true, text: 'Agent Count', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  return o
})

// --- Wealth chart ---
const wealthData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: [
    { label: 'Median Wealth', data: sim.metricsHistory.map((m) => m.medianWealth),
      borderColor: CHART_COLORS.gini, backgroundColor: 'transparent' },
    { label: 'Mean Wealth', data: sim.metricsHistory.map((m) => m.meanWealth),
      borderColor: CHART_COLORS.redistribution, backgroundColor: 'transparent', borderDash: [4, 3] },
  ],
}))
const wealthOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('Wealth Distribution')
  o.scales!.y = { ...o.scales!.y,
    title: { display: true, text: 'Wealth ($)', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  return o
})

// --- Wealth Distribution Bar chart (individuals sorted by wealth) ---
const wealthDistData = computed<ChartData<'bar'>>(() => {
  const dist = sim.currentMetrics?.wealthDistribution ?? []
  return {
    labels: dist.map((_, i) => i + 1),
    datasets: [{
      label: 'Wealth',
      data: dist,
      backgroundColor: dist.map(w =>
        w < 0 ? 'rgba(224, 122, 95, 0.7)'
        : w < 200 ? 'rgba(212, 165, 116, 0.6)'
        : 'rgba(129, 178, 154, 0.7)'
      ),
      borderWidth: 0,
    }],
  }
})
const wealthDistOpts = computed<ChartOptions<'bar'>>(() => ({
  responsive: true, maintainAspectRatio: false,
  animation: { duration: 0 },
  plugins: {
    zoom: ZOOM_OPTIONS,
    title: { display: true, text: 'Wealth per Individual (sorted)', color: CHART_COLORS.text, font: { size: 12, weight: 'bold' } },
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(26, 26, 46, 0.95)', titleColor: '#E8E8E8', bodyColor: '#A0A0B0',
      callbacks: { title: (items) => `Individual #${items[0]?.label}`, label: (item) => `$${Math.round(item.raw as number)}` },
    },
  },
  scales: {
    x: {
      title: { display: true, text: 'Individuals (poorest → richest)', color: CHART_COLORS.textMuted, font: { size: 10 } },
      ticks: { display: false }, grid: { display: false },
    },
    y: {
      title: { display: true, text: 'Wealth ($)', color: CHART_COLORS.textMuted, font: { size: 10 } },
      ticks: { color: CHART_COLORS.textMuted, font: { size: 9, family: 'monospace' } },
      grid: { color: CHART_COLORS.grid },
    },
  },
}))

// --- Automation chart (dual-channel: robotic + AI) ---
const autoData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: [
    { label: 'Filled Jobs', data: sim.metricsHistory.map((m) => m.filledJobs),
      borderColor: CHART_COLORS.worker, backgroundColor: CHART_COLORS.workerFill, fill: true },
    { label: 'Available Slots', data: sim.metricsHistory.map((m) => m.totalJobs),
      borderColor: CHART_COLORS.textMuted, backgroundColor: 'transparent', borderDash: [4, 4], fill: false },
    { label: 'Robotic Automated', data: sim.metricsHistory.map((m) => m.automatedJobs),
      borderColor: CHART_COLORS.stress, backgroundColor: CHART_COLORS.stressFill, fill: true },
    { label: 'AI Displaced', data: sim.metricsHistory.map((m) => m.aiDisplacedJobs),
      borderColor: '#B07AE0', backgroundColor: 'rgba(176,122,224,0.15)', fill: true },
  ],
}))
const autoOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('Jobs vs Displacement (Robotic + AI)')
  o.scales!.y = { ...o.scales!.y, min: 0,
    title: { display: true, text: 'Job Count', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  return o
})

// --- Satisfaction chart ---
const satData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: [{
    label: 'Mean Satisfaction',
    data: sim.metricsHistory.map((m) => m.meanSatisfaction * 100),
    borderColor: CHART_COLORS.redistribution, backgroundColor: CHART_COLORS.redistributionFill, fill: true,
  }],
}))
const satOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('Population Satisfaction')
  o.scales!.y = { ...o.scales!.y, min: 0, max: 100,
    title: { display: true, text: 'Satisfaction (%)', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  return o
})

// --- Societal Phenomena chart ---
const societalData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: [
    { label: 'Births', data: sim.metricsHistory.map(m => m.births),
      borderColor: '#81B29A', backgroundColor: 'transparent' },
    { label: 'Deaths', data: sim.metricsHistory.map(m => m.deaths),
      borderColor: '#707080', backgroundColor: 'transparent' },
    { label: 'Premature Deaths', data: sim.metricsHistory.map(m => m.prematureDeaths),
      borderColor: '#C44536', backgroundColor: 'transparent' },
    { label: 'Diseases', data: sim.metricsHistory.map(m => m.diseases),
      borderColor: '#E07A5F', backgroundColor: 'transparent', borderDash: [3, 2] },
    { label: 'Crimes', data: sim.metricsHistory.map(m => m.crimes),
      borderColor: '#9B72AA', backgroundColor: 'transparent' },
    { label: 'Divorces', data: sim.metricsHistory.map(m => m.divorces),
      borderColor: '#D4A574', backgroundColor: 'transparent', borderDash: [5, 3] },
    { label: 'Marriages', data: sim.metricsHistory.map(m => m.marriages),
      borderColor: '#F2CC8F', backgroundColor: 'transparent' },
    { label: 'Layoffs', data: sim.metricsHistory.map(m => m.layoffs),
      borderColor: '#E63946', backgroundColor: 'transparent', borderDash: [6, 2] },
  ],
}))
const societalOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('Societal Phenomena')
  o.scales!.y = { ...o.scales!.y, min: 0,
    title: { display: true, text: 'Count per Tick', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  return o
})

// --- Cross-variable scatter plot ---
const scatterX = ref<string>('giniCoefficient')
const scatterY = ref<string>('crimeRate')
const scatterZ = ref<string>('avgEducationLevel')

const scatterMetricKeys = [
  { value: 'tick', label: 'Time (Week)' },
  // Population
  { value: 'totalPopulation', label: 'Population' },
  { value: 'employedCount', label: 'Employed' },
  { value: 'unemployedCount', label: 'Unemployed' },
  { value: 'businessOwnerCount', label: 'Business Owners' },
  { value: 'retiredCount', label: 'Retired' },
  { value: 'childCount', label: 'Children' },
  // Economy
  { value: 'giniCoefficient', label: 'Gini' },
  { value: 'medianWealth', label: 'Median Wealth' },
  { value: 'meanWealth', label: 'Mean Wealth' },
  { value: 'medianIncome', label: 'Median Income' },
  { value: 'top10WealthShare', label: 'Top 10% Wealth Share' },
  { value: 'bottom50WealthShare', label: 'Bottom 50% Wealth Share' },
  { value: 'effectiveTaxRate', label: 'Tax Rate' },
  { value: 'taxRevenue', label: 'Tax Revenue' },
  { value: 'redistributionPaid', label: 'Benefits Paid' },
  // Social
  { value: 'meanSatisfaction', label: 'Satisfaction' },
  { value: 'avgEducationLevel', label: 'Avg Education' },
  // Societal events
  { value: 'births', label: 'Births (per tick)' },
  { value: 'deaths', label: 'Deaths (per tick)' },
  { value: 'prematureDeaths', label: 'Premature Deaths' },
  { value: 'divorces', label: 'Divorces (per tick)' },
  { value: 'marriages', label: 'Marriages (per tick)' },
  { value: 'crimes', label: 'Crimes (per tick)' },
  { value: 'diseases', label: 'Diseases (per tick)' },
  { value: 'layoffs', label: 'Layoffs (per tick)' },
  { value: 'fertilityRate', label: 'Fertility Rate' },
  { value: 'crimeRate', label: 'Crime Rate' },
  { value: 'diseaseRate', label: 'Disease Rate' },
  // Automation
  { value: 'automationRate', label: 'Robotic Automation' },
  { value: 'aiDisplacementRate', label: 'AI Displacement' },
  { value: 'totalDisplacementRate', label: 'Total Displacement' },
]

function getMetricValue(m: Record<string, unknown>, key: string): number {
  return (m[key] as number) ?? 0
}

const scatterData = computed<ChartData<'scatter'>>(() => {
  const hist = sim.metricsHistory
  const points = hist.map(m => ({
    x: getMetricValue(m as unknown as Record<string, unknown>, scatterX.value),
    y: getMetricValue(m as unknown as Record<string, unknown>, scatterY.value),
  }))
  // Color by Z value (map to hue: low=red, high=green)
  const zVals = hist.map(m => getMetricValue(m as unknown as Record<string, unknown>, scatterZ.value))
  const zMin = Math.min(...zVals, 0)
  const zMax = Math.max(...zVals, 1)
  const colors = zVals.map(z => {
    const t = zMax > zMin ? (z - zMin) / (zMax - zMin) : 0.5
    const r = Math.round(224 * (1 - t) + 129 * t)
    const g = Math.round(122 * (1 - t) + 178 * t)
    const b = Math.round(95 * (1 - t) + 154 * t)
    return `rgba(${r}, ${g}, ${b}, 0.7)`
  })
  return {
    datasets: [{
      label: `${scatterY.value} vs ${scatterX.value}`,
      data: points,
      backgroundColor: colors,
      pointRadius: 3,
      pointHoverRadius: 5,
    }],
  }
})
const scatterOpts = computed<ChartOptions<'scatter'>>(() => ({
  responsive: true, maintainAspectRatio: false,
  animation: { duration: 0 },
  plugins: {
    zoom: ZOOM_OPTIONS,
    title: { display: true, text: `${scatterY.value} vs ${scatterX.value} (color: ${scatterZ.value})`,
      color: CHART_COLORS.text, font: { size: 12, weight: 'bold' } },
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(26, 26, 46, 0.95)', titleColor: '#E8E8E8', bodyColor: '#A0A0B0',
    },
  },
  scales: {
    x: {
      title: { display: true, text: scatterX.value, color: CHART_COLORS.textMuted, font: { size: 10 } },
      ticks: { color: CHART_COLORS.textMuted, font: { size: 9 } },
      grid: { color: CHART_COLORS.grid },
    },
    y: {
      title: { display: true, text: scatterY.value, color: CHART_COLORS.textMuted, font: { size: 10 } },
      ticks: { color: CHART_COLORS.textMuted, font: { size: 9, family: 'monospace' } },
      grid: { color: CHART_COLORS.grid },
    },
  },
}))

const emit = defineEmits<{ (e: 'close'): void }>()

// --- Chart refs for zoom reset ---
const giniChart = ref<InstanceType<typeof Line> | null>(null)
const empChart = ref<InstanceType<typeof Line> | null>(null)
const wealthChart = ref<InstanceType<typeof Line> | null>(null)
const wealthDistChart = ref<InstanceType<typeof Bar> | null>(null)
const autoChart = ref<InstanceType<typeof Line> | null>(null)
const satChart = ref<InstanceType<typeof Line> | null>(null)
const societalChart = ref<InstanceType<typeof Line> | null>(null)
const scatterChart = ref<InstanceType<typeof Scatter> | null>(null)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chartRefs: Record<string, ReturnType<typeof ref<any>>> = {
  gini: giniChart, employment: empChart, wealth: wealthChart,
  wealthDist: wealthDistChart, automation: autoChart,
  satisfaction: satChart, societal: societalChart, scatter: scatterChart,
}

function resetZoom() {
  const chartRef = chartRefs[activeTab.value]
  const instance = chartRef?.value?.chart as ChartJS | undefined
  if (instance) instance.resetZoom()
}
</script>

<template>
  <div class="v2charts">
    <div class="v2charts__header">
      <div class="v2charts__tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="v2charts__tab"
          :class="{ 'v2charts__tab--active': activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
      <button class="v2charts__reset" @click="resetZoom" title="Reset zoom">&#8634; Reset Zoom</button>
      <button class="v2charts__close" @click="emit('close')">&#10005;</button>
    </div>
    <div class="v2charts__body">
      <div v-show="activeTab === 'gini'" class="chart-wrap"><Line ref="giniChart" :data="giniData" :options="giniOpts" /></div>
      <div v-show="activeTab === 'employment'" class="chart-wrap"><Line ref="empChart" :data="empData" :options="empOpts" /></div>
      <div v-show="activeTab === 'wealth'" class="chart-wrap"><Line ref="wealthChart" :data="wealthData" :options="wealthOpts" /></div>
      <div v-show="activeTab === 'wealthDist'" class="chart-wrap"><Bar ref="wealthDistChart" :data="wealthDistData" :options="wealthDistOpts" /></div>
      <div v-show="activeTab === 'automation'" class="chart-wrap"><Line ref="autoChart" :data="autoData" :options="autoOpts" /></div>
      <div v-show="activeTab === 'satisfaction'" class="chart-wrap"><Line ref="satChart" :data="satData" :options="satOpts" /></div>
      <div v-show="activeTab === 'societal'" class="chart-wrap"><Line ref="societalChart" :data="societalData" :options="societalOpts" /></div>
      <div v-show="activeTab === 'scatter'" class="chart-wrap chart-wrap--scatter">
        <div class="scatter-controls">
          <label>X: <select v-model="scatterX">
            <option v-for="k in scatterMetricKeys" :key="k.value" :value="k.value">{{ k.label }}</option>
          </select></label>
          <label>Y: <select v-model="scatterY">
            <option v-for="k in scatterMetricKeys" :key="k.value" :value="k.value">{{ k.label }}</option>
          </select></label>
          <label>Color: <select v-model="scatterZ">
            <option v-for="k in scatterMetricKeys" :key="k.value" :value="k.value">{{ k.label }}</option>
          </select></label>
        </div>
        <Scatter ref="scatterChart" :data="scatterData" :options="scatterOpts" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.v2charts {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: $bg-panel;
  border-top: 1px solid $border-color;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 $space-sm;
    border-bottom: 1px solid $border-color;
    height: 32px;
    flex-shrink: 0;
  }

  &__tabs {
    display: flex;
    gap: 2px;
  }

  &__tab {
    padding: 4px $space-sm;
    border: none;
    background: transparent;
    color: $text-muted;
    font-size: $font-size-xs;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;

    &:hover { color: $text-secondary; }
    &--active { color: $color-accent; border-bottom-color: $color-accent; }
  }

  &__reset {
    background: none;
    border: 1px solid $border-color;
    color: $text-muted;
    font-size: $font-size-xs;
    cursor: pointer;
    padding: 2px 8px;
    border-radius: $radius-sm;
    margin-left: auto;
    margin-right: $space-sm;
    transition: all 0.15s;
    &:hover { color: $text-primary; border-color: $color-accent; }
  }

  &__close {
    background: none;
    border: none;
    color: $text-muted;
    font-size: 14px;
    cursor: pointer;
    padding: 4px 6px;
    &:hover { color: $text-primary; }
  }

  &__body {
    flex: 1;
    padding: $space-sm $space-md;
    overflow: hidden;
  }
}

.chart-wrap {
  width: 100%;
  height: 100%;
  min-height: 180px;

  &--scatter {
    display: flex;
    flex-direction: column;
  }
}

.scatter-controls {
  display: flex;
  gap: $space-md;
  margin-bottom: $space-xs;
  font-size: $font-size-xs;
  color: $text-muted;

  label {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  select {
    background: rgba(42, 42, 74, 0.8);
    color: $text-secondary;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    padding: 2px 6px;
    font-size: $font-size-xs;
    cursor: pointer;

    &:focus {
      outline: 1px solid $color-accent;
    }
  }
}
</style>
