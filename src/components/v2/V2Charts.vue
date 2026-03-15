<script setup lang="ts">
// --- V2 Charts Panel ---
// Tabbed charts: Gini, Employment, Wealth, Automation, Satisfaction,
// Wealth Distribution (bar), Societal Phenomena (line), Cross-Variable (scatter)

import { ref, computed, watch, nextTick, type Ref } from 'vue'
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

// ============================================================
// Rolling average helper (must be defined before buildLineData)
// ============================================================
const SMOOTH_WINDOW = 4

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

// ============================================================
// Generic series toggle system — reused across all multi-series charts
// ============================================================
interface SeriesDef {
  key: string
  label: string
  color: string
  fill?: string   // explicit fill color (default: transparent)
  dash?: number[]
  accessor: (m: SimMetrics) => number
  smooth?: boolean // apply rolling average
  yAxisID?: string // for dual-axis charts
}

// Chart toggle registry: maps chart id → { config, visible ref }
// This avoids passing Ref objects in the template (Vue auto-unwraps refs)
interface ChartToggleEntry {
  config: SeriesDef[]
  visible: Ref<Set<string>>
}
const chartToggles: Record<string, ChartToggleEntry> = {}

function registerChart(id: string, config: SeriesDef[], defaultKeys?: string[]): Ref<Set<string>> {
  const visible = ref(new Set(defaultKeys ?? config.map(s => s.key))) as Ref<Set<string>>
  chartToggles[id] = { config, visible }
  return visible
}

function onToggleSeries(chartId: string, key: string) {
  const entry = chartToggles[chartId]
  if (!entry) return
  const s = new Set(entry.visible.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  entry.visible.value = s
}

function onToggleAll(chartId: string) {
  const entry = chartToggles[chartId]
  if (!entry) return
  if (entry.visible.value.size === entry.config.length) {
    entry.visible.value = new Set()
  } else {
    entry.visible.value = new Set(entry.config.map(s => s.key))
  }
}

function isAllVisible(chartId: string): boolean {
  const entry = chartToggles[chartId]
  if (!entry) return false
  return entry.visible.value.size === entry.config.length
}

function buildLineData(
  config: SeriesDef[],
  visible: Ref<Set<string>>,
): ChartData<'line'> {
  return {
    labels: labels.value,
    datasets: config
      .filter(s => visible.value.has(s.key))
      .map(s => {
        const raw = sim.metricsHistory.map(s.accessor)
        return {
          label: s.label,
          data: s.smooth ? smoothData(raw) : raw,
          borderColor: s.color,
          backgroundColor: s.fill ?? 'transparent',
          ...(s.dash ? { borderDash: s.dash } : {}),
          ...(s.fill ? { fill: true } : {}),
          ...(s.yAxisID ? { yAxisID: s.yAxisID } : {}),
        }
      }),
  }
}

// --- Employment series config ---
const empSeriesConfig: SeriesDef[] = [
  { key: 'employed', label: 'Employed', color: CHART_COLORS.worker, fill: CHART_COLORS.workerFill, accessor: m => m.employedCount },
  { key: 'unemployed', label: 'Unemployed', color: CHART_COLORS.precarious, fill: CHART_COLORS.precariousFill, accessor: m => m.unemployedCount },
  { key: 'businessOwners', label: 'Business Owners', color: 'rgba(155, 114, 170, 1)', fill: 'rgba(155, 114, 170, 0.15)', accessor: m => m.businessOwnerCount },
  { key: 'retired', label: 'Retired', color: 'rgba(180, 160, 120, 1)', fill: 'rgba(180, 160, 120, 0.15)', dash: [4, 2], accessor: m => m.retiredCount },
  { key: 'children', label: 'Children', color: 'rgba(100, 180, 220, 1)', fill: 'rgba(100, 180, 220, 0.15)', dash: [3, 2], accessor: m => m.childCount },
]
const empVisible = registerChart('employment', empSeriesConfig)
const empData = computed<ChartData<'line'>>(() => buildLineData(empSeriesConfig, empVisible))
const empOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('Employment Breakdown')
  o.scales!.y = { ...o.scales!.y, min: 0,
    title: { display: true, text: 'Agent Count', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  return o
})

// --- Wealth series config ---
const wealthSeriesConfig: SeriesDef[] = [
  { key: 'median', label: 'Median Wealth', color: CHART_COLORS.gini, accessor: m => m.medianWealth },
  { key: 'mean', label: 'Mean Wealth', color: CHART_COLORS.redistribution, dash: [4, 3], accessor: m => m.meanWealth },
]
const wealthVisible = registerChart('wealth', wealthSeriesConfig)
const wealthData = computed<ChartData<'line'>>(() => buildLineData(wealthSeriesConfig, wealthVisible))
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

// --- Automation series config ---
const autoSeriesConfig: SeriesDef[] = [
  { key: 'filledJobs', label: 'Filled Jobs', color: CHART_COLORS.worker, fill: CHART_COLORS.workerFill, accessor: m => m.filledJobs },
  { key: 'availableSlots', label: 'Available Slots', color: CHART_COLORS.textMuted, dash: [4, 4], accessor: m => m.totalJobs },
  { key: 'roboticFired', label: 'Workers Fired (Robotic)', color: CHART_COLORS.stress, fill: CHART_COLORS.stressFill, accessor: m => m.roboticFiredWorkers },
  { key: 'aiFired', label: 'Workers Fired (AI)', color: '#B07AE0', fill: 'rgba(176,122,224,0.15)', accessor: m => m.aiFiredWorkers },
  { key: 'slotsElim', label: 'Slots Eliminated (total)', color: '#707080', dash: [2, 3], accessor: m => m.automatedJobs + m.aiDisplacedJobs },
]
const autoVisible = registerChart('automation', autoSeriesConfig)
const autoData = computed<ChartData<'line'>>(() => buildLineData(autoSeriesConfig, autoVisible))
const autoOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('Jobs vs Displacement (Robotic + AI)')
  o.scales!.y = { ...o.scales!.y, min: 0,
    title: { display: true, text: 'Job Count', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  return o
})

// --- GDP series config ---
const gdpSeriesConfig: SeriesDef[] = [
  { key: 'gdp', label: 'GDP (total output)', color: '#81B29A', fill: 'rgba(129,178,154,0.15)', smooth: true, accessor: m => m.gdp },
  { key: 'gdpPerCapita', label: 'GDP per Capita', color: '#F2CC8F', dash: [4, 2], smooth: true, accessor: m => m.gdpPerCapita },
  { key: 'taxRevenue', label: 'Tax Revenue', color: '#4A90D9', fill: 'rgba(74,144,217,0.1)', dash: [3, 2], smooth: true, accessor: m => m.taxRevenue },
]
const gdpVisible = registerChart('gdp', gdpSeriesConfig)
const gdpData = computed<ChartData<'line'>>(() => buildLineData(gdpSeriesConfig, gdpVisible))
const gdpOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('GDP & Economic Output')
  o.scales!.y = { ...o.scales!.y, min: 0,
    title: { display: true, text: 'Amount ($)', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  return o
})

// --- Government series config ---
const govSeriesConfig: SeriesDef[] = [
  { key: 'treasury', label: 'Treasury Balance', color: '#4A90D9', fill: 'rgba(74,144,217,0.15)', smooth: true, accessor: m => m.governmentTreasury },
  { key: 'taxRevenue', label: 'Tax Revenue (income)', color: '#81B29A', dash: [4, 2], smooth: true, accessor: m => m.taxRevenue },
  { key: 'pensions', label: 'Pensions', color: '#F2CC8F', dash: [3, 2], smooth: true, accessor: m => m.govExpPensions },
  { key: 'benefits', label: 'Benefits', color: '#E07A5F', dash: [3, 2], smooth: true, accessor: m => m.govExpBenefits },
  { key: 'police', label: 'Police', color: '#1565C0', dash: [3, 2], smooth: true, accessor: m => m.govExpPolice },
  { key: 'infra', label: 'Infrastructure', color: '#9B72AA', dash: [3, 2], smooth: true, accessor: m => m.govExpInfra },
  { key: 'prison', label: 'Prison', color: '#8B4513', dash: [3, 2], smooth: true, accessor: m => m.govExpPrison },
  { key: 'hospital', label: 'Hospital', color: '#E53935', dash: [3, 2], smooth: true, accessor: m => m.govExpHospital },
  { key: 'ubi', label: 'UBI', color: '#66BB6A', dash: [3, 2], smooth: true, accessor: m => m.govExpUBI },
  { key: 'policeCount', label: 'Police Count', color: '#1565C0', fill: 'rgba(21,101,192,0.1)', yAxisID: 'y1', accessor: m => m.policeCount },
  { key: 'strikeRate', label: 'Strike Rate (%)', color: '#CC3333', fill: 'rgba(204,51,51,0.1)', yAxisID: 'y1', accessor: m => m.strikeRate * 100 },
]
const govVisible = registerChart('government', govSeriesConfig)
const govData = computed<ChartData<'line'>>(() => buildLineData(govSeriesConfig, govVisible))
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

// --- Housing series config ---
const housingSeriesConfig: SeriesDef[] = [
  { key: 'owners', label: 'Owners', color: '#81B29A', fill: 'rgba(129,178,154,0.15)', accessor: m => m.homeOwnerCount },
  { key: 'mortgage', label: 'Mortgage', color: '#F2CC8F', fill: 'rgba(242,204,143,0.15)', accessor: m => m.mortgageCount },
  { key: 'renters', label: 'Renters', color: '#E07A5F', fill: 'rgba(224,122,95,0.15)', accessor: m => m.renterCount },
]
const housingVisible = registerChart('housing', housingSeriesConfig)
const housingData = computed<ChartData<'line'>>(() => buildLineData(housingSeriesConfig, housingVisible))
const housingOpts = computed<ChartOptions<'line'>>(() => {
  const o = baseLineOptions('Home Ownership vs Renting')
  o.scales!.y = { ...o.scales!.y, min: 0,
    title: { display: true, text: 'Agent Count', color: CHART_COLORS.textMuted, font: { size: 10 } } }
  return o
})

// --- Societal Phenomena series config (uses generic toggle system) ---
const societalSeriesConfig: SeriesDef[] = [
  { key: 'births', label: 'Births', color: '#81B29A', accessor: m => m.births },
  { key: 'deaths', label: 'Deaths', color: '#707080', accessor: m => m.deaths },
  { key: 'prematureDeaths', label: 'Premature Deaths', color: '#C44536', accessor: m => m.prematureDeaths },
  { key: 'diseases', label: 'Diseases', color: '#E07A5F', dash: [3, 2], accessor: m => m.diseases },
  { key: 'crimes', label: 'Crimes', color: '#9B72AA', accessor: m => m.crimes },
  { key: 'criminals', label: 'Criminals', color: '#CC3333', dash: [4, 2], accessor: m => m.criminalCount },
  { key: 'prisoners', label: 'Prisoners', color: '#8B4513', dash: [4, 2], accessor: m => m.prisonerCount },
  { key: 'divorces', label: 'Divorces', color: '#D4A574', dash: [5, 3], accessor: m => m.divorces },
  { key: 'marriages', label: 'Marriages', color: '#F2CC8F', accessor: m => m.marriages },
  { key: 'layoffs', label: 'Layoffs', color: '#E63946', dash: [6, 2], accessor: m => m.layoffs },
  { key: 'unemployed', label: 'Unemployed', color: '#FF8C42', accessor: m => m.unemployedCount },
  { key: 'fertilityRate', label: 'Fertility Rate', color: '#4A90D9', dash: [4, 3], accessor: m => m.fertilityRate },
  { key: 'taxRevenue', label: 'Tax Revenue', color: '#6BBF59', dash: [2, 2], smooth: true, accessor: m => m.taxRevenue },
  { key: 'redistribution', label: 'Redistribution', color: '#45B7D1', dash: [2, 2], smooth: true, accessor: m => m.redistributionPaid },
  { key: 'satisfaction', label: 'Satisfaction ×100', color: '#FFD700', accessor: m => Math.round(m.meanSatisfaction * 100) },
  { key: 'classTransitions', label: 'Class Transitions', color: '#B8860B', dash: [3, 3], accessor: m => m.classTransitions },
]
// Default visible: most important subset
const societalVisible = registerChart('societal', societalSeriesConfig, [
  'births', 'deaths', 'prematureDeaths', 'diseases', 'crimes', 'divorces', 'marriages', 'layoffs'
])

const societalData = computed<ChartData<'line'>>(() => buildLineData(societalSeriesConfig, societalVisible))
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
  { value: 'prisonerCount', label: 'Prisoners' },
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
  { value: 'govExpHospital', label: 'Hospital Expenses' },
  { value: 'govExpPrison', label: 'Prison Expenses' },
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
      <!-- Gini (single series, no toggles) -->
      <div v-show="activeTab === 'gini'" class="chart-wrap"><Line ref="giniChart" :data="giniData" :options="giniOpts" /></div>

      <!-- Employment (multi-series with toggles) -->
      <div v-show="activeTab === 'employment'" class="chart-wrap chart-wrap--toggled">
        <div class="series-toggles">
          <label class="series-toggle series-toggle--all">
            <input type="checkbox" :checked="isAllVisible('employment')" @change="onToggleAll('employment')" />
            <span class="series-toggle__label">All</span>
          </label>
          <span class="series-toggles__sep">|</span>
          <label v-for="s in empSeriesConfig" :key="s.key" class="series-toggle" :style="{ '--series-color': s.color }">
            <input type="checkbox" :checked="empVisible.has(s.key)" @change="onToggleSeries('employment', s.key)" />
            <span class="series-toggle__dot" :style="{ background: s.color }"></span>
            <span class="series-toggle__label">{{ s.label }}</span>
          </label>
        </div>
        <Line ref="empChart" :data="empData" :options="empOpts" />
      </div>

      <!-- Wealth (multi-series with toggles) -->
      <div v-show="activeTab === 'wealth'" class="chart-wrap chart-wrap--toggled">
        <div class="series-toggles">
          <label class="series-toggle series-toggle--all">
            <input type="checkbox" :checked="isAllVisible('wealth')" @change="onToggleAll('wealth')" />
            <span class="series-toggle__label">All</span>
          </label>
          <span class="series-toggles__sep">|</span>
          <label v-for="s in wealthSeriesConfig" :key="s.key" class="series-toggle" :style="{ '--series-color': s.color }">
            <input type="checkbox" :checked="wealthVisible.has(s.key)" @change="onToggleSeries('wealth', s.key)" />
            <span class="series-toggle__dot" :style="{ background: s.color }"></span>
            <span class="series-toggle__label">{{ s.label }}</span>
          </label>
        </div>
        <Line ref="wealthChart" :data="wealthData" :options="wealthOpts" />
      </div>

      <!-- Wealth Distribution bar (single dataset, no toggles) -->
      <div v-show="activeTab === 'wealthDist'" class="chart-wrap"><Bar ref="wealthDistChart" :data="wealthDistData" :options="wealthDistOpts" /></div>

      <!-- Age Distribution bar (single dataset, no toggles) -->
      <div v-show="activeTab === 'ageDist'" class="chart-wrap"><Bar ref="ageDistChart" :data="ageDistData" :options="ageDistOpts" /></div>

      <!-- Automation (multi-series with toggles) -->
      <div v-show="activeTab === 'automation'" class="chart-wrap chart-wrap--toggled">
        <div class="series-toggles">
          <label class="series-toggle series-toggle--all">
            <input type="checkbox" :checked="isAllVisible('automation')" @change="onToggleAll('automation')" />
            <span class="series-toggle__label">All</span>
          </label>
          <span class="series-toggles__sep">|</span>
          <label v-for="s in autoSeriesConfig" :key="s.key" class="series-toggle" :style="{ '--series-color': s.color }">
            <input type="checkbox" :checked="autoVisible.has(s.key)" @change="onToggleSeries('automation', s.key)" />
            <span class="series-toggle__dot" :style="{ background: s.color }"></span>
            <span class="series-toggle__label">{{ s.label }}</span>
          </label>
        </div>
        <Line ref="autoChart" :data="autoData" :options="autoOpts" />
      </div>

      <!-- GDP (multi-series with toggles) -->
      <div v-show="activeTab === 'gdp'" class="chart-wrap chart-wrap--toggled">
        <div class="series-toggles">
          <label class="series-toggle series-toggle--all">
            <input type="checkbox" :checked="isAllVisible('gdp')" @change="onToggleAll('gdp')" />
            <span class="series-toggle__label">All</span>
          </label>
          <span class="series-toggles__sep">|</span>
          <label v-for="s in gdpSeriesConfig" :key="s.key" class="series-toggle" :style="{ '--series-color': s.color }">
            <input type="checkbox" :checked="gdpVisible.has(s.key)" @change="onToggleSeries('gdp', s.key)" />
            <span class="series-toggle__dot" :style="{ background: s.color }"></span>
            <span class="series-toggle__label">{{ s.label }}</span>
          </label>
        </div>
        <Line ref="gdpChart" :data="gdpData" :options="gdpOpts" />
      </div>

      <!-- Government (multi-series with toggles) -->
      <div v-show="activeTab === 'government'" class="chart-wrap chart-wrap--toggled">
        <div class="series-toggles">
          <label class="series-toggle series-toggle--all">
            <input type="checkbox" :checked="isAllVisible('government')" @change="onToggleAll('government')" />
            <span class="series-toggle__label">All</span>
          </label>
          <span class="series-toggles__sep">|</span>
          <label v-for="s in govSeriesConfig" :key="s.key" class="series-toggle" :style="{ '--series-color': s.color }">
            <input type="checkbox" :checked="govVisible.has(s.key)" @change="onToggleSeries('government', s.key)" />
            <span class="series-toggle__dot" :style="{ background: s.color }"></span>
            <span class="series-toggle__label">{{ s.label }}</span>
          </label>
        </div>
        <Line ref="govChart" :data="govData" :options="govOpts" />
      </div>

      <!-- Satisfaction (single series, no toggles) -->
      <div v-show="activeTab === 'satisfaction'" class="chart-wrap"><Line ref="satChart" :data="satData" :options="satOpts" /></div>

      <!-- Societal (multi-series with toggles) -->
      <div v-show="activeTab === 'societal'" class="chart-wrap chart-wrap--toggled">
        <div class="series-toggles">
          <label class="series-toggle series-toggle--all">
            <input type="checkbox" :checked="isAllVisible('societal')" @change="onToggleAll('societal')" />
            <span class="series-toggle__label">All</span>
          </label>
          <span class="series-toggles__sep">|</span>
          <label v-for="s in societalSeriesConfig" :key="s.key" class="series-toggle" :style="{ '--series-color': s.color }">
            <input type="checkbox" :checked="societalVisible.has(s.key)" @change="onToggleSeries('societal', s.key)" />
            <span class="series-toggle__dot" :style="{ background: s.color }"></span>
            <span class="series-toggle__label">{{ s.label }}</span>
          </label>
        </div>
        <Line ref="societalChart" :data="societalData" :options="societalOpts" />
      </div>

      <!-- Housing (multi-series with toggles) -->
      <div v-show="activeTab === 'housing'" class="chart-wrap chart-wrap--toggled">
        <div class="series-toggles">
          <label class="series-toggle series-toggle--all">
            <input type="checkbox" :checked="isAllVisible('housing')" @change="onToggleAll('housing')" />
            <span class="series-toggle__label">All</span>
          </label>
          <span class="series-toggles__sep">|</span>
          <label v-for="s in housingSeriesConfig" :key="s.key" class="series-toggle" :style="{ '--series-color': s.color }">
            <input type="checkbox" :checked="housingVisible.has(s.key)" @change="onToggleSeries('housing', s.key)" />
            <span class="series-toggle__dot" :style="{ background: s.color }"></span>
            <span class="series-toggle__label">{{ s.label }}</span>
          </label>
        </div>
        <Line ref="housingChart" :data="housingData" :options="housingOpts" />
      </div>

      <!-- Cross-Variable Scatter -->
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

.chart-wrap--toggled {
  display: flex;
  flex-direction: column;
}

.series-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  padding: 4px 0;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.series-toggles__sep {
  color: $border-color;
  font-size: 10px;
  line-height: 1;
  margin: 0 2px;
}

.series-toggle {
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
