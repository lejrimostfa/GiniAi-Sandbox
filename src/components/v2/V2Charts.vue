<script setup lang="ts">
// --- V2 Charts Panel ---
// Tabbed charts: Gini, Employment, Wealth, Automation, Satisfaction,
// Wealth Distribution (bar), Societal Phenomena (line), Cross-Variable (scatter)

import { ref, computed, watch, nextTick } from 'vue'
import { Line, Bar, Scatter } from 'vue-chartjs'
import { Chart as ChartJS } from 'chart.js'
import { useSimStore } from '../../stores/v2SimulationStore'
import type { SimMetrics } from '../../simulation/types'
import { baseLineOptions, CHART_COLORS, ZOOM_OPTIONS } from '../charts/chartConfig'
import type { ChartData, ChartOptions } from 'chart.js'

const sim = useSimStore()
const activeTab = ref('gini')

const tabs = [
  { id: 'gini', label: 'Gini' },
  { id: 'employment', label: 'Employment' },
  { id: 'wealth', label: 'Wealth' },
  { id: 'wealthDist', label: 'Distribution' },
  { id: 'ageDist', label: 'Age' },
  { id: 'automation', label: 'Automation' },
  { id: 'gdp', label: 'GDP' },
  { id: 'government', label: 'Government' },
  { id: 'satisfaction', label: 'Satisfaction' },
  { id: 'societal', label: 'Societal' },
  { id: 'housing', label: 'Housing' },
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
    { label: 'Retired', data: sim.metricsHistory.map((m) => m.retiredCount),
      borderColor: 'rgba(180, 160, 120, 1)', backgroundColor: 'rgba(180, 160, 120, 0.15)', fill: true, borderDash: [4, 2] },
    { label: 'Children', data: sim.metricsHistory.map((m) => m.childCount),
      borderColor: 'rgba(100, 180, 220, 1)', backgroundColor: 'rgba(100, 180, 220, 0.15)', fill: true, borderDash: [3, 2] },
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

// --- Age Distribution Bar chart (population pyramid by age bracket) ---
const ageDistData = computed<ChartData<'bar'>>(() => {
  const agents = sim.agents.filter(a => a.state !== 'dead')
  // Buckets: 0-4, 5-9, ..., 75-79, 80+
  const bucketSize = 5
  const bucketCount = 17 // 0-4 through 80+
  const buckets = new Array(bucketCount).fill(0)
  const bucketLabels: string[] = []
  for (let i = 0; i < bucketCount; i++) {
    const lo = i * bucketSize
    bucketLabels.push(i === bucketCount - 1 ? `${lo}+` : `${lo}-${lo + bucketSize - 1}`)
  }
  for (const a of agents) {
    const idx = Math.min(Math.floor(a.age / bucketSize), bucketCount - 1)
    buckets[idx]++
  }
  // Reverse so oldest is at top, youngest at bottom (standard pyramid)
  const revLabels = [...bucketLabels].reverse()
  const revBuckets = [...buckets].reverse()
  return {
    labels: revLabels,
    datasets: [{
      label: 'Agents',
      data: revBuckets,
      backgroundColor: revBuckets.map((_, i) => {
        const lo = (bucketCount - 1 - i) * bucketSize
        if (lo < 18) return 'rgba(100, 180, 255, 0.7)'  // children — blue
        if (lo < 65) return 'rgba(129, 178, 154, 0.7)'   // working age — green
        return 'rgba(212, 165, 116, 0.7)'                  // retired — gold
      }),
      borderWidth: 0,
    }],
  }
})
const ageDistOpts = computed<ChartOptions<'bar'>>(() => ({
  responsive: true, maintainAspectRatio: false,
  indexAxis: 'y' as const,
  animation: { duration: 0 },
  plugins: {
    zoom: ZOOM_OPTIONS,
    title: { display: true, text: 'Age Distribution', color: CHART_COLORS.text, font: { size: 12, weight: 'bold' as const } },
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(26, 26, 46, 0.95)', titleColor: '#E8E8E8', bodyColor: '#A0A0B0',
      callbacks: { label: (item) => `${item.raw} agents` },
    },
  },
  scales: {
    x: {
      title: { display: true, text: 'Number of Agents', color: CHART_COLORS.textMuted, font: { size: 10 } },
      ticks: { color: CHART_COLORS.textMuted, font: { size: 9, family: 'monospace' } },
      grid: { color: CHART_COLORS.grid },
    },
    y: {
      title: { display: true, text: 'Age Bracket', color: CHART_COLORS.textMuted, font: { size: 10 } },
      ticks: { color: CHART_COLORS.textMuted, font: { size: 9, family: 'monospace' } },
      grid: { display: false },
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
    { label: 'Workers Fired (Robotic)', data: sim.metricsHistory.map((m) => m.roboticFiredWorkers),
      borderColor: CHART_COLORS.stress, backgroundColor: CHART_COLORS.stressFill, fill: true },
    { label: 'Workers Fired (AI)', data: sim.metricsHistory.map((m) => m.aiFiredWorkers),
      borderColor: '#B07AE0', backgroundColor: 'rgba(176,122,224,0.15)', fill: true },
    { label: 'Slots Eliminated (total)', data: sim.metricsHistory.map((m) => m.automatedJobs + m.aiDisplacedJobs),
      borderColor: '#707080', backgroundColor: 'transparent', borderDash: [2, 3], fill: false },
  ],
}))
const autoOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('Jobs vs Displacement (Robotic + AI)')
  o.scales!.y = { ...o.scales!.y, min: 0,
    title: { display: true, text: 'Job Count', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  return o
})

// --- GDP chart ---
const gdpData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: [
    { label: 'GDP (total output)',
      data: smoothData(sim.metricsHistory.map(m => m.gdp)),
      borderColor: '#81B29A', backgroundColor: 'rgba(129,178,154,0.15)', fill: true },
    { label: 'GDP per Capita',
      data: smoothData(sim.metricsHistory.map(m => m.gdpPerCapita)),
      borderColor: '#F2CC8F', backgroundColor: 'transparent', borderDash: [4, 2] },
    { label: 'Tax Revenue',
      data: smoothData(sim.metricsHistory.map(m => m.taxRevenue)),
      borderColor: '#4A90D9', backgroundColor: 'rgba(74,144,217,0.1)', fill: true, borderDash: [3, 2] },
  ],
}))
const gdpOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('GDP & Economic Output')
  o.scales!.y = { ...o.scales!.y, min: 0,
    title: { display: true, text: 'Amount ($)', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  return o
})

// --- Government Treasury chart ---
const govData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: [
    { label: 'Treasury Balance',
      data: smoothData(sim.metricsHistory.map(m => m.governmentTreasury)),
      borderColor: '#4A90D9', backgroundColor: 'rgba(74,144,217,0.15)', fill: true, borderWidth: 2 },
    { label: 'Tax Revenue (income)',
      data: smoothData(sim.metricsHistory.map(m => m.taxRevenue)),
      borderColor: '#81B29A', backgroundColor: 'transparent', borderDash: [4, 2] },
    { label: 'Pensions',
      data: smoothData(sim.metricsHistory.map(m => m.govExpPensions)),
      borderColor: '#F2CC8F', backgroundColor: 'transparent', borderDash: [3, 2] },
    { label: 'Benefits',
      data: smoothData(sim.metricsHistory.map(m => m.govExpBenefits)),
      borderColor: '#E07A5F', backgroundColor: 'transparent', borderDash: [3, 2] },
    { label: 'Police',
      data: smoothData(sim.metricsHistory.map(m => m.govExpPolice)),
      borderColor: '#1565C0', backgroundColor: 'transparent', borderDash: [3, 2] },
    { label: 'Infrastructure',
      data: smoothData(sim.metricsHistory.map(m => m.govExpInfra)),
      borderColor: '#9B72AA', backgroundColor: 'transparent', borderDash: [3, 2] },
    { label: 'UBI',
      data: smoothData(sim.metricsHistory.map(m => m.govExpUBI)),
      borderColor: '#66BB6A', backgroundColor: 'transparent', borderDash: [3, 2] },
    { label: 'Police Count',
      data: sim.metricsHistory.map(m => m.policeCount),
      borderColor: '#1565C0', backgroundColor: 'rgba(21,101,192,0.1)', fill: true, yAxisID: 'y1' },
    { label: 'Strike Rate (%)',
      data: sim.metricsHistory.map(m => m.strikeRate * 100),
      borderColor: '#CC3333', backgroundColor: 'rgba(204,51,51,0.1)', fill: true, yAxisID: 'y1' },
  ],
}))
const govOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('Government Treasury & Expenses')
  o.scales!.y = { ...o.scales!.y,
    title: { display: true, text: 'Amount ($)', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  o.scales!.y1 = {
    position: 'right' as const,
    grid: { drawOnChartArea: false },
    title: { display: true, text: 'Count / %', color: CHART_COLORS.textMuted, font: { size: 10 } },
    ticks: { color: CHART_COLORS.textMuted },
    min: 0,
  }
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

// --- Housing chart (Owners vs Mortgage vs Renters) ---
const housingData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: [
    { label: 'Owners', data: sim.metricsHistory.map(m => m.homeOwnerCount),
      borderColor: '#81B29A', backgroundColor: 'rgba(129,178,154,0.15)', fill: true },
    { label: 'Mortgage', data: sim.metricsHistory.map(m => m.mortgageCount),
      borderColor: '#F2CC8F', backgroundColor: 'rgba(242,204,143,0.15)', fill: true },
    { label: 'Renters', data: sim.metricsHistory.map(m => m.renterCount),
      borderColor: '#E07A5F', backgroundColor: 'rgba(224,122,95,0.15)', fill: true },
  ],
}))
const housingOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('Home Ownership vs Renting')
  o.scales!.y = { ...o.scales!.y, min: 0,
    title: { display: true, text: 'Agent Count', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  return o
})

// --- Societal Phenomena chart (with toggle checkboxes) ---
interface SocietalSeries {
  key: string
  label: string
  color: string
  dash?: number[]
  accessor: (m: SimMetrics) => number
}
const societalSeriesConfig: SocietalSeries[] = [
  { key: 'births', label: 'Births', color: '#81B29A', accessor: m => m.births },
  { key: 'deaths', label: 'Deaths', color: '#707080', accessor: m => m.deaths },
  { key: 'prematureDeaths', label: 'Premature Deaths', color: '#C44536', accessor: m => m.prematureDeaths },
  { key: 'diseases', label: 'Diseases', color: '#E07A5F', dash: [3, 2], accessor: m => m.diseases },
  { key: 'crimes', label: 'Crimes', color: '#9B72AA', accessor: m => m.crimes },
  { key: 'criminals', label: 'Criminals', color: '#CC3333', dash: [4, 2], accessor: m => m.criminalCount },
  { key: 'divorces', label: 'Divorces', color: '#D4A574', dash: [5, 3], accessor: m => m.divorces },
  { key: 'marriages', label: 'Marriages', color: '#F2CC8F', accessor: m => m.marriages },
  { key: 'layoffs', label: 'Layoffs', color: '#E63946', dash: [6, 2], accessor: m => m.layoffs },
  { key: 'unemployed', label: 'Unemployed', color: '#FF8C42', accessor: m => m.unemployedCount },
  { key: 'fertilityRate', label: 'Fertility Rate', color: '#4A90D9', dash: [4, 3], accessor: m => m.fertilityRate },
  { key: 'taxRevenue', label: 'Tax Revenue', color: '#6BBF59', dash: [2, 2], accessor: m => m.taxRevenue },
  { key: 'redistribution', label: 'Redistribution', color: '#45B7D1', dash: [2, 2], accessor: m => m.redistributionPaid },
  { key: 'satisfaction', label: 'Satisfaction ×100', color: '#FFD700', accessor: m => Math.round(m.meanSatisfaction * 100) },
  { key: 'classTransitions', label: 'Class Transitions', color: '#B8860B', dash: [3, 3], accessor: m => m.classTransitions },
]

// Default visible series (most important ones)
const societalVisible = ref<Set<string>>(new Set([
  'births', 'deaths', 'prematureDeaths', 'diseases', 'crimes', 'divorces', 'marriages', 'layoffs'
]))

function toggleSocietalSeries(key: string) {
  const s = societalVisible.value
  if (s.has(key)) s.delete(key)
  else s.add(key)
  societalVisible.value = new Set(s)
}

const allSocietalVisible = computed(() => societalVisible.value.size === societalSeriesConfig.length)

function toggleAllSocietal() {
  if (allSocietalVisible.value) {
    societalVisible.value = new Set()
  } else {
    societalVisible.value = new Set(societalSeriesConfig.map(s => s.key))
  }
}

// Rolling average helper to smooth noisy per-tick data (e.g. tax revenue, redistribution)
const SMOOTH_WINDOW = 4 // 4-tick moving average
const smoothKeys = new Set(['taxRevenue', 'redistribution'])

function smoothData(raw: number[]): number[] {
  if (raw.length <= SMOOTH_WINDOW) return raw
  const out: number[] = []
  for (let i = 0; i < raw.length; i++) {
    const start = Math.max(0, i - SMOOTH_WINDOW + 1)
    let sum = 0
    for (let j = start; j <= i; j++) sum += raw[j]
    out.push(sum / (i - start + 1))
  }
  return out
}

const societalData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: societalSeriesConfig
    .filter(s => societalVisible.value.has(s.key))
    .map(s => {
      const raw = sim.metricsHistory.map(s.accessor)
      return {
        label: s.label,
        data: smoothKeys.has(s.key) ? smoothData(raw) : raw,
        borderColor: s.color,
        backgroundColor: 'transparent',
        ...(s.dash ? { borderDash: s.dash } : {}),
      }
    }),
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
  { value: 'criminalCount', label: 'Criminals' },
  // Economy
  { value: 'giniCoefficient', label: 'Gini' },
  { value: 'medianWealth', label: 'Median Wealth' },
  { value: 'meanWealth', label: 'Mean Wealth' },
  { value: 'medianIncome', label: 'Median Income' },
  { value: 'top10WealthShare', label: 'Top 10% Wealth Share' },
  { value: 'bottom50WealthShare', label: 'Bottom 50% Wealth Share' },
  { value: 'gdp', label: 'GDP' },
  { value: 'gdpPerCapita', label: 'GDP per Capita' },
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
  // Workers fired by automation
  { value: 'roboticFiredWorkers', label: 'Workers Fired (Robotic)' },
  { value: 'aiFiredWorkers', label: 'Workers Fired (AI)' },
  // Housing
  { value: 'homeOwnerCount', label: 'Home Owners' },
  { value: 'mortgageCount', label: 'Mortgage Holders' },
  { value: 'renterCount', label: 'Renters' },
  // Government
  { value: 'governmentTreasury', label: 'Gov Treasury' },
  { value: 'policeCount', label: 'Police Count' },
  { value: 'strikeRate', label: 'Strike Rate' },
  { value: 'arrestsThisTick', label: 'Arrests (per tick)' },
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
const ageDistChart = ref<InstanceType<typeof Bar> | null>(null)
const autoChart = ref<InstanceType<typeof Line> | null>(null)
const gdpChart = ref<InstanceType<typeof Line> | null>(null)
const govChart = ref<InstanceType<typeof Line> | null>(null)
const satChart = ref<InstanceType<typeof Line> | null>(null)
const societalChart = ref<InstanceType<typeof Line> | null>(null)
const housingChart = ref<InstanceType<typeof Line> | null>(null)
const scatterChart = ref<InstanceType<typeof Scatter> | null>(null)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chartRefs: Record<string, ReturnType<typeof ref<any>>> = {
  gini: giniChart, employment: empChart, wealth: wealthChart,
  wealthDist: wealthDistChart, ageDist: ageDistChart, automation: autoChart, gdp: gdpChart,
  government: govChart, satisfaction: satChart, societal: societalChart, housing: housingChart, scatter: scatterChart,
}

function resetZoom() {
  const chartRef = chartRefs[activeTab.value]
  const instance = chartRef?.value?.chart as ChartJS | undefined
  if (instance) instance.resetZoom()
}

// Fix v-show chart sizing: when a tab becomes visible, Chart.js must recalculate its container dimensions
watch(activeTab, () => {
  nextTick(() => {
    const chartRef = chartRefs[activeTab.value]
    const instance = chartRef?.value?.chart as ChartJS | undefined
    if (instance) {
      instance.resetZoom()
      instance.resize()
    }
  })
})
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
      <div v-show="activeTab === 'ageDist'" class="chart-wrap"><Bar ref="ageDistChart" :data="ageDistData" :options="ageDistOpts" /></div>
      <div v-show="activeTab === 'automation'" class="chart-wrap"><Line ref="autoChart" :data="autoData" :options="autoOpts" /></div>
      <div v-show="activeTab === 'gdp'" class="chart-wrap"><Line ref="gdpChart" :data="gdpData" :options="gdpOpts" /></div>
      <div v-show="activeTab === 'government'" class="chart-wrap"><Line ref="govChart" :data="govData" :options="govOpts" /></div>
      <div v-show="activeTab === 'satisfaction'" class="chart-wrap"><Line ref="satChart" :data="satData" :options="satOpts" /></div>
      <div v-show="activeTab === 'societal'" class="chart-wrap chart-wrap--societal">
        <div class="societal-toggles">
          <label class="societal-toggle societal-toggle--all">
            <input type="checkbox" :checked="allSocietalVisible" @change="toggleAllSocietal" />
            <span class="societal-toggle__label">All</span>
          </label>
          <span class="societal-toggles__sep">|</span>
          <label v-for="s in societalSeriesConfig" :key="s.key" class="societal-toggle"
            :style="{ '--series-color': s.color }">
            <input type="checkbox" :checked="societalVisible.has(s.key)"
              @change="toggleSocietalSeries(s.key)" />
            <span class="societal-toggle__dot" :style="{ background: s.color }"></span>
            <span class="societal-toggle__label">{{ s.label }}</span>
          </label>
        </div>
        <Line ref="societalChart" :data="societalData" :options="societalOpts" />
      </div>
      <div v-show="activeTab === 'housing'" class="chart-wrap"><Line ref="housingChart" :data="housingData" :options="housingOpts" /></div>
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

.chart-wrap--societal {
  display: flex;
  flex-direction: column;
}

.societal-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  padding: 4px 0;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.societal-toggles__sep {
  color: $border-color;
  font-size: 10px;
  line-height: 1;
  margin: 0 2px;
}

.societal-toggle {
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  font-size: 10px;
  color: $text-muted;
  user-select: none;
  transition: color 0.15s;

  &--all {
    font-weight: 600;
    color: $text-secondary;
  }

  &:hover { color: $text-secondary; }

  input[type="checkbox"] {
    width: 12px;
    height: 12px;
    margin: 0;
    cursor: pointer;
    accent-color: var(--series-color);
  }

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  &__label {
    white-space: nowrap;
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
