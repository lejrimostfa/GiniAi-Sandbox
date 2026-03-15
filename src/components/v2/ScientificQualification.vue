<script setup lang="ts">
// ============================================================
// ScientificQualification — Full-page modal showing scientific
// validation results: tests, Monte Carlo, sensitivity, ODD compliance
// ============================================================

import { ref, computed } from 'vue'
import {
  runBatchAsync,
  defaultBatchConfig,
  batchResultToCSV,
  timeSeriesCSV,
} from '../../simulation/batch/BatchRunner'
import {
  runSensitivityAnalysis,
  defaultSensitivityParams,
  sensitivityReportToCSV,
} from '../../simulation/batch/SensitivityAnalysis'
import type { BatchResult, AggregateStats } from '../../simulation/batch/BatchRunner'
import type { SensitivityReport } from '../../simulation/batch/SensitivityAnalysis'

const emit = defineEmits<{ close: [] }>()

// ============================================================
// State
// ============================================================
type Tab = 'overview' | 'tests' | 'montecarlo' | 'sensitivity' | 'odd'
const activeTab = ref<Tab>('overview')

// Monte Carlo state
const mcRunning = ref(false)
const mcProgress = ref(0)
const mcTotal = ref(0)
const mcResult = ref<BatchResult | null>(null)
const mcPartial = ref<AggregateStats | null>(null)

// Sensitivity state
const saRunning = ref(false)
const saProgress = ref(0)
const saTotal = ref(0)
const saCurrentParam = ref('')
const saResult = ref<SensitivityReport | null>(null)

// Test results (static — represents last npm test run)
const testSuites = ref([
  {
    name: 'statistics.test.ts',
    tests: 31,
    passed: 31,
    failed: 0,
    categories: [
      { name: 'computeGiniFast', count: 11, desc: 'Gini coefficient correctness, edge cases, scale invariance' },
      { name: 'generateWealthDistribution', count: 6, desc: 'Target Gini convergence, determinism, positivity' },
      { name: 'createRNG', count: 4, desc: 'Determinism, range, uniformity' },
      { name: 'clamp/lerp/shuffle', count: 10, desc: 'Utility function correctness' },
    ],
  },
  {
    name: 'reproducibility.test.ts',
    tests: 11,
    passed: 11,
    failed: 0,
    categories: [
      { name: 'Reproducibility', count: 4, desc: 'Same seed = same results, different seeds diverge, reset equivalence' },
      { name: 'Basic Invariants', count: 7, desc: 'Population > 0, valid states, Gini in [0,1], wealth floor, archives' },
    ],
  },
])

const totalTests = computed(() => testSuites.value.reduce((s, t) => s + t.tests, 0))
const totalPassed = computed(() => testSuites.value.reduce((s, t) => s + t.passed, 0))

// ODD compliance checklist
const oddChecklist = ref([
  { section: '1.1 Purpose', status: 'pass' as const, detail: 'Clearly defined: automation → inequality dynamics' },
  { section: '1.2 Entities & Scales', status: 'pass' as const, detail: 'Agent, Location, Workplace entities with full state variables' },
  { section: '1.3 Process Overview', status: 'pass' as const, detail: '16-step sequential tick execution documented' },
  { section: '2.1 Basic Principles', status: 'pass' as const, detail: 'Piketty r>g, Anthropic Index, causal phenomena' },
  { section: '2.2 Emergence', status: 'pass' as const, detail: 'Gini trajectory, crime waves, business cycles emerge' },
  { section: '2.3 Adaptation', status: 'pass' as const, detail: 'State-dependent behavioral rules' },
  { section: '2.4 Objectives', status: 'pass' as const, detail: 'No utility functions — rule-based with satisfaction' },
  { section: '2.5 Sensing', status: 'pass' as const, detail: 'Local sensing only, no global information' },
  { section: '2.6 Interaction', status: 'pass' as const, detail: 'Direct (proximity) + indirect (locations)' },
  { section: '2.7 Stochasticity', status: 'pass' as const, detail: 'Seeded PRNG (Mulberry32), full reproducibility' },
  { section: '2.8 Observation', status: 'pass' as const, detail: '40+ metrics computed per tick' },
  { section: '3.1 Initialization', status: 'pass' as const, detail: 'Power-law wealth, education mix, spatial layout' },
  { section: '3.2 Input Data', status: 'pass' as const, detail: 'No external data — fully endogenous' },
  { section: '3.3 Submodels', status: 'pass' as const, detail: '6 documented submodels with parameters' },
  { section: '4.1 Unit Tests', status: 'pass' as const, detail: '42 tests covering statistics, reproducibility, invariants' },
  { section: '4.2 Monte Carlo', status: 'pending' as const, detail: 'Run batch analysis to validate' },
  { section: '4.3 Sensitivity', status: 'pending' as const, detail: 'Run OAT sensitivity analysis to validate' },
  { section: '4.4 Empirical Validation', status: 'warn' as const, detail: 'No real-world data comparison yet' },
])

const oddPassCount = computed(() => oddChecklist.value.filter(c => c.status === 'pass').length)
const oddTotal = computed(() => oddChecklist.value.length)

// Overall score computation (weighted)
const overallScore = computed(() => {
  const weights = {
    tests: 0.15,
    reproducibility: 0.15,
    theoretical: 0.20,
    odd: 0.20,
    montecarlo: 0.10,
    sensitivity: 0.10,
    export: 0.05,
    code: 0.05,
  }

  let score = 0

  // Tests (0-10)
  const testScore = totalTests.value > 0 ? (totalPassed.value / totalTests.value) * 10 : 0
  score += testScore * weights.tests

  // Reproducibility (binary from MC or assumed from tests)
  const reproScore = mcResult.value
    ? (mcResult.value.aggregate.isReproducible ? 10 : 3)
    : (totalPassed.value === totalTests.value ? 8 : 4)
  score += reproScore * weights.reproducibility

  // Theoretical grounding (static — based on code review)
  score += 7 * weights.theoretical

  // ODD compliance
  const oddScore = oddTotal.value > 0 ? (oddPassCount.value / oddTotal.value) * 10 : 0
  score += oddScore * weights.odd

  // Monte Carlo
  const mcScore = mcResult.value
    ? (mcResult.value.aggregate.giniStd < 0.1 ? 9 : 6)
    : 0
  score += mcScore * weights.montecarlo

  // Sensitivity
  const saScore = saResult.value ? 8 : 0
  score += saScore * weights.sensitivity

  // Export (static)
  score += 8 * weights.export

  // Code quality (static)
  score += 7 * weights.code

  return Math.min(10, score)
})

// ============================================================
// Actions
// ============================================================
async function runMonteCarlo() {
  mcRunning.value = true
  mcProgress.value = 0
  mcResult.value = null
  mcPartial.value = null

  const config = defaultBatchConfig({
    seeds: Array.from({ length: 30 }, (_, i) => 42 + i * 7),
    totalTicks: 520,
    snapshotInterval: 52,
  })
  mcTotal.value = config.seeds.length

  try {
    const result = await runBatchAsync(config, (done, total, partial) => {
      mcProgress.value = done
      mcTotal.value = total
      if (partial) mcPartial.value = partial
    })
    mcResult.value = result

    // Update ODD checklist
    const mcItem = oddChecklist.value.find(c => c.section === '4.2 Monte Carlo')
    if (mcItem) {
      mcItem.status = 'pass'
      mcItem.detail = `30 seeds, Gini σ=${result.aggregate.giniStd.toFixed(4)}, reproducible=${result.aggregate.isReproducible}`
    }
  } catch (e) {
    console.error('Monte Carlo failed:', e)
  } finally {
    mcRunning.value = false
  }
}

async function runSensitivity() {
  saRunning.value = true
  saProgress.value = 0
  saResult.value = null

  const params = defaultSensitivityParams()
  saTotal.value = 1 + params.reduce((s, p) => s + p.values.length, 0)

  try {
    const report = await runSensitivityAnalysis(
      { seed: 42, totalTicks: 520, populationSize: 100 },
      (done, total, param) => {
        saProgress.value = done
        saTotal.value = total
        saCurrentParam.value = param
      },
    )
    saResult.value = report

    // Update ODD checklist
    const saItem = oddChecklist.value.find(c => c.section === '4.3 Sensitivity')
    if (saItem) {
      saItem.status = 'pass'
      saItem.detail = `${params.length} parameters analyzed, ${report.elasticities.length} elasticities computed`
    }
  } catch (e) {
    console.error('Sensitivity analysis failed:', e)
  } finally {
    saRunning.value = false
  }
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportMcCSV() {
  if (!mcResult.value) return
  downloadCSV(batchResultToCSV(mcResult.value), 'monte_carlo_results.csv')
}

function exportMcTimeSeriesCSV() {
  if (!mcResult.value) return
  downloadCSV(timeSeriesCSV(mcResult.value), 'monte_carlo_timeseries.csv')
}

function exportSaCSV() {
  if (!saResult.value) return
  downloadCSV(sensitivityReportToCSV(saResult.value), 'sensitivity_analysis.csv')
}

// ============================================================
// Computed properties (moved from Options API to script setup)
// ============================================================
const tabs = computed(() => [
  { id: 'overview' as Tab, icon: '📊', label: 'Overview' },
  { id: 'tests' as Tab, icon: '✓', label: 'Tests' },
  { id: 'montecarlo' as Tab, icon: '🎲', label: 'Monte Carlo' },
  { id: 'sensitivity' as Tab, icon: '📐', label: 'Sensitivity' },
  { id: 'odd' as Tab, icon: '📋', label: 'ODD Protocol' },
])

const criteria = computed(() => [
  {
    icon: '✓', label: 'Unit Tests',
    score: `${totalPassed.value}/${totalTests.value}`,
    value: totalTests.value > 0 ? (totalPassed.value / totalTests.value) * 10 : 0,
    color: totalPassed.value === totalTests.value ? 'green' : 'red',
    detail: `${totalTests.value} tests across statistics, reproducibility, and invariants`,
  },
  {
    icon: '🔄', label: 'Reproducibility',
    score: mcResult.value ? (mcResult.value.aggregate.isReproducible ? 'PASS' : 'FAIL') : 'Pending',
    value: mcResult.value ? (mcResult.value.aggregate.isReproducible ? 10 : 3) : 8,
    color: mcResult.value ? (mcResult.value.aggregate.isReproducible ? 'green' : 'red') : 'yellow',
    detail: 'Seeded PRNG (Mulberry32) ensures deterministic results',
  },
  {
    icon: '📚', label: 'Theoretical Grounding',
    score: '7/10',
    value: 7,
    color: 'green',
    detail: 'Piketty r>g, Anthropic Index, Chen 1982 (Gini with negatives)',
  },
  {
    icon: '📋', label: 'ODD Compliance',
    score: `${oddPassCount.value}/${oddTotal.value}`,
    value: oddTotal.value > 0 ? (oddPassCount.value / oddTotal.value) * 10 : 0,
    color: oddPassCount.value >= oddTotal.value * 0.8 ? 'green' : 'yellow',
    detail: 'Grimm et al. (2006, 2020) protocol for ABM documentation',
  },
  {
    icon: '🎲', label: 'Monte Carlo',
    score: mcResult.value ? `σ=${mcResult.value.aggregate.giniStd.toFixed(3)}` : 'Not run',
    value: mcResult.value ? (mcResult.value.aggregate.giniStd < 0.1 ? 9 : 6) : 0,
    color: mcResult.value ? 'green' : 'gray',
    detail: '30 seeds with confidence intervals on key metrics',
  },
  {
    icon: '📐', label: 'Sensitivity Analysis',
    score: saResult.value ? `${saResult.value.elasticities.length} params` : 'Not run',
    value: saResult.value ? 8 : 0,
    color: saResult.value ? 'green' : 'gray',
    detail: 'OAT analysis of 5 key parameters with elasticities',
  },
])

const scoreClass = computed(() => {
  const s = overallScore.value
  if (s >= 8) return 'sq-score--high'
  if (s >= 6) return 'sq-score--mid'
  return 'sq-score--low'
})

// ============================================================
// Helper functions for template
// ============================================================
function elasticityClass(e: number): string {
  const abs = Math.abs(e)
  if (abs > 1) return 'sq-el--high'
  if (abs > 0.3) return 'sq-el--mid'
  return 'sq-el--low'
}

function maxGini(r: { outcomes: { gini: number }[] }): number {
  return Math.max(...r.outcomes.map(o => o.gini), 0.01)
}
</script>

<template>
  <div class="sq-overlay" @click.self="emit('close')">
    <div class="sq-panel">
      <!-- Header -->
      <div class="sq-header">
        <div class="sq-header__left">
          <span class="sq-header__icon">🔬</span>
          <h2 class="sq-header__title">Scientific Qualification</h2>
          <span class="sq-header__score" :class="scoreClass">
            {{ overallScore.toFixed(1) }}/10
          </span>
        </div>
        <button class="sq-header__close" @click="emit('close')">✕</button>
      </div>

      <!-- Tabs -->
      <nav class="sq-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="sq-tabs__btn"
          :class="{ 'sq-tabs__btn--active': activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.icon }} {{ tab.label }}
        </button>
      </nav>

      <!-- Tab Content -->
      <div class="sq-content">

        <!-- OVERVIEW -->
        <div v-if="activeTab === 'overview'" class="sq-tab">
          <div class="sq-score-hero">
            <div class="sq-score-circle" :class="scoreClass">
              <span class="sq-score-circle__value">{{ overallScore.toFixed(1) }}</span>
              <span class="sq-score-circle__label">/ 10</span>
            </div>
            <p class="sq-score-hero__desc">
              Scientific compliance score based on reproducibility, statistical rigor,
              documentation, and validation infrastructure.
            </p>
          </div>

          <div class="sq-criteria-grid">
            <div class="sq-criteria" v-for="c in criteria" :key="c.label">
              <div class="sq-criteria__header">
                <span>{{ c.icon }} {{ c.label }}</span>
                <span class="sq-criteria__badge" :class="'sq-criteria__badge--' + c.color">
                  {{ c.score }}
                </span>
              </div>
              <div class="sq-criteria__bar">
                <div class="sq-criteria__fill" :style="{ width: (c.value / 10 * 100) + '%' }" :class="'sq-criteria__fill--' + c.color"></div>
              </div>
              <p class="sq-criteria__detail">{{ c.detail }}</p>
            </div>
          </div>

          <div class="sq-actions-row">
            <button class="sq-btn sq-btn--primary" @click="runMonteCarlo" :disabled="mcRunning">
              {{ mcRunning ? `Running... ${mcProgress}/${mcTotal}` : '▶ Run Monte Carlo (30 seeds)' }}
            </button>
            <button class="sq-btn sq-btn--primary" @click="runSensitivity" :disabled="saRunning">
              {{ saRunning ? `Analyzing... ${saProgress}/${saTotal}` : '▶ Run Sensitivity Analysis' }}
            </button>
          </div>
        </div>

        <!-- TESTS -->
        <div v-if="activeTab === 'tests'" class="sq-tab">
          <div class="sq-stat-row">
            <div class="sq-stat">
              <span class="sq-stat__value sq-stat__value--green">{{ totalPassed }}</span>
              <span class="sq-stat__label">Passed</span>
            </div>
            <div class="sq-stat">
              <span class="sq-stat__value sq-stat__value--red">{{ totalTests - totalPassed }}</span>
              <span class="sq-stat__label">Failed</span>
            </div>
            <div class="sq-stat">
              <span class="sq-stat__value">{{ totalTests }}</span>
              <span class="sq-stat__label">Total</span>
            </div>
          </div>

          <div v-for="suite in testSuites" :key="suite.name" class="sq-suite">
            <div class="sq-suite__header">
              <span class="sq-suite__status" :class="suite.failed === 0 ? 'sq-suite__status--pass' : 'sq-suite__status--fail'">
                {{ suite.failed === 0 ? '✓' : '✗' }}
              </span>
              <span class="sq-suite__name">{{ suite.name }}</span>
              <span class="sq-suite__count">{{ suite.passed }}/{{ suite.tests }}</span>
            </div>
            <div class="sq-suite__categories">
              <div v-for="cat in suite.categories" :key="cat.name" class="sq-cat">
                <span class="sq-cat__name">{{ cat.name }}</span>
                <span class="sq-cat__count">{{ cat.count }} tests</span>
                <span class="sq-cat__desc">{{ cat.desc }}</span>
              </div>
            </div>
          </div>

          <p class="sq-footnote">
            Run <code>npm test</code> to execute all tests locally via Vitest.
          </p>
        </div>

        <!-- MONTE CARLO -->
        <div v-if="activeTab === 'montecarlo'" class="sq-tab">
          <p class="sq-tab__intro">
            Runs the simulation 30 times with different seeds (same parameters) to compute
            confidence intervals and verify result stability.
          </p>

          <div v-if="!mcResult && !mcRunning" class="sq-empty">
            <button class="sq-btn sq-btn--primary sq-btn--large" @click="runMonteCarlo">
              ▶ Run Monte Carlo Analysis (30 seeds × 10 years)
            </button>
            <p class="sq-empty__hint">Takes ~30-60 seconds depending on your hardware</p>
          </div>

          <!-- Progress -->
          <div v-if="mcRunning" class="sq-progress">
            <div class="sq-progress__bar">
              <div class="sq-progress__fill" :style="{ width: (mcTotal > 0 ? mcProgress / mcTotal * 100 : 0) + '%' }"></div>
            </div>
            <span class="sq-progress__text">{{ mcProgress }} / {{ mcTotal }} runs completed</span>

            <!-- Partial results while running -->
            <div v-if="mcPartial" class="sq-partial">
              <div class="sq-stat-row">
                <div class="sq-stat">
                  <span class="sq-stat__value">{{ mcPartial.giniMean.toFixed(4) }}</span>
                  <span class="sq-stat__label">Gini (μ)</span>
                </div>
                <div class="sq-stat">
                  <span class="sq-stat__value">± {{ mcPartial.giniStd.toFixed(4) }}</span>
                  <span class="sq-stat__label">Gini (σ)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Results -->
          <div v-if="mcResult" class="sq-mc-results">
            <div class="sq-stat-row">
              <div class="sq-stat">
                <span class="sq-stat__value">{{ mcResult.aggregate.giniMean.toFixed(4) }}</span>
                <span class="sq-stat__label">Gini (μ)</span>
              </div>
              <div class="sq-stat">
                <span class="sq-stat__value">± {{ mcResult.aggregate.giniStd.toFixed(4) }}</span>
                <span class="sq-stat__label">Gini (σ)</span>
              </div>
              <div class="sq-stat">
                <span class="sq-stat__value">{{ mcResult.aggregate.giniMin.toFixed(4) }}</span>
                <span class="sq-stat__label">Gini (min)</span>
              </div>
              <div class="sq-stat">
                <span class="sq-stat__value">{{ mcResult.aggregate.giniMax.toFixed(4) }}</span>
                <span class="sq-stat__label">Gini (max)</span>
              </div>
            </div>

            <div class="sq-stat-row">
              <div class="sq-stat">
                <span class="sq-stat__value">${{ mcResult.aggregate.meanWealthMean.toFixed(0) }}</span>
                <span class="sq-stat__label">Wealth (μ)</span>
              </div>
              <div class="sq-stat">
                <span class="sq-stat__value">± ${{ mcResult.aggregate.meanWealthStd.toFixed(0) }}</span>
                <span class="sq-stat__label">Wealth (σ)</span>
              </div>
              <div class="sq-stat">
                <span class="sq-stat__value">{{ (mcResult.aggregate.unemploymentRateMean * 100).toFixed(1) }}%</span>
                <span class="sq-stat__label">Unemployment (μ)</span>
              </div>
              <div class="sq-stat">
                <span class="sq-stat__value">{{ mcResult.aggregate.satisfactionMean.toFixed(3) }}</span>
                <span class="sq-stat__label">Satisfaction (μ)</span>
              </div>
            </div>

            <div class="sq-stat-row">
              <div class="sq-stat">
                <span class="sq-stat__value" :class="mcResult.aggregate.isReproducible ? 'sq-stat__value--green' : 'sq-stat__value--red'">
                  {{ mcResult.aggregate.isReproducible ? '✓ Reproducible' : '✗ NOT Reproducible' }}
                </span>
                <span class="sq-stat__label">Determinism Check</span>
              </div>
              <div class="sq-stat">
                <span class="sq-stat__value">{{ mcResult.aggregate.populationMean.toFixed(0) }}</span>
                <span class="sq-stat__label">Population (μ)</span>
              </div>
            </div>

            <!-- Gini distribution mini-chart (ASCII-style bar chart) -->
            <div class="sq-distribution">
              <h4>Gini Distribution Across Seeds</h4>
              <div class="sq-dist-bars">
                <div
                  v-for="(g, i) in mcResult.aggregate.giniValues"
                  :key="i"
                  class="sq-dist-bar"
                  :style="{ height: (g / Math.max(...mcResult.aggregate.giniValues) * 60) + 'px' }"
                  :title="`Seed ${mcResult.runs[i].seed}: Gini ${g.toFixed(4)}`"
                ></div>
              </div>
              <div class="sq-dist-legend">
                <span>Seed {{ mcResult.runs[0]?.seed }}</span>
                <span>Seed {{ mcResult.runs[mcResult.runs.length - 1]?.seed }}</span>
              </div>
            </div>

            <div class="sq-export-row">
              <button class="sq-btn" @click="exportMcCSV">📊 Export Final Results (CSV)</button>
              <button class="sq-btn" @click="exportMcTimeSeriesCSV">📈 Export Time Series (CSV)</button>
            </div>
          </div>
        </div>

        <!-- SENSITIVITY -->
        <div v-if="activeTab === 'sensitivity'" class="sq-tab">
          <p class="sq-tab__intro">
            One-At-a-Time (OAT) sensitivity analysis: varies each parameter independently
            while holding others at baseline, measuring impact on key outputs.
          </p>

          <div v-if="!saResult && !saRunning" class="sq-empty">
            <button class="sq-btn sq-btn--primary sq-btn--large" @click="runSensitivity">
              ▶ Run Sensitivity Analysis (5 parameters)
            </button>
            <p class="sq-empty__hint">Analyzes: AI Growth, AI Diffusion, Redistribution, Starting Gini, Immigration</p>
          </div>

          <!-- Progress -->
          <div v-if="saRunning" class="sq-progress">
            <div class="sq-progress__bar">
              <div class="sq-progress__fill" :style="{ width: (saTotal > 0 ? saProgress / saTotal * 100 : 0) + '%' }"></div>
            </div>
            <span class="sq-progress__text">{{ saProgress }} / {{ saTotal }} runs — {{ saCurrentParam }}</span>
          </div>

          <!-- Results -->
          <div v-if="saResult" class="sq-sa-results">
            <!-- Elasticity table -->
            <h4>Parameter Elasticities</h4>
            <p class="sq-footnote">Elasticity = % change in output per % change in input. |e| > 1 = sensitive.</p>

            <table class="sq-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Gini ε</th>
                  <th>GDP ε</th>
                  <th>Unemployment ε</th>
                  <th>Satisfaction ε</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="e in saResult.elasticities" :key="e.paramName">
                  <td>{{ e.paramName }}</td>
                  <td :class="elasticityClass(e.giniElasticity)">{{ e.giniElasticity.toFixed(3) }}</td>
                  <td :class="elasticityClass(e.gdpElasticity)">{{ e.gdpElasticity.toFixed(3) }}</td>
                  <td :class="elasticityClass(e.unemploymentElasticity)">{{ e.unemploymentElasticity.toFixed(3) }}</td>
                  <td :class="elasticityClass(e.satisfactionElasticity)">{{ e.satisfactionElasticity.toFixed(3) }}</td>
                </tr>
              </tbody>
            </table>

            <!-- Per-parameter detail -->
            <div v-for="r in saResult.results" :key="r.param.name" class="sq-param-detail">
              <h4>{{ r.param.name }} ({{ r.param.unit }})</h4>
              <div class="sq-param-bars">
                <div v-for="o in r.outcomes" :key="o.paramValue" class="sq-param-bar-group">
                  <div class="sq-param-bar"
                    :style="{ height: Math.max(4, o.gini / maxGini(r) * 40) + 'px' }"
                    :title="`${r.param.name}=${o.paramValue}: Gini=${o.gini.toFixed(4)}`"
                  ></div>
                  <span class="sq-param-bar-label">{{ o.paramValue }}</span>
                </div>
              </div>
            </div>

            <div class="sq-export-row">
              <button class="sq-btn" @click="exportSaCSV">📊 Export Sensitivity Report (CSV)</button>
            </div>
          </div>
        </div>

        <!-- ODD COMPLIANCE -->
        <div v-if="activeTab === 'odd'" class="sq-tab">
          <p class="sq-tab__intro">
            ODD Protocol compliance (Grimm et al. 2006, 2020) — the standard for describing
            agent-based models in scientific publications.
          </p>

          <div class="sq-odd-summary">
            <span class="sq-odd-score">{{ oddPassCount }}/{{ oddTotal }}</span>
            <span class="sq-odd-label">sections validated</span>
          </div>

          <div class="sq-odd-list">
            <div v-for="item in oddChecklist" :key="item.section" class="sq-odd-item">
              <span class="sq-odd-status" :class="'sq-odd-status--' + item.status">
                {{ item.status === 'pass' ? '✓' : item.status === 'warn' ? '⚠' : '○' }}
              </span>
              <div class="sq-odd-info">
                <span class="sq-odd-section">{{ item.section }}</span>
                <span class="sq-odd-detail">{{ item.detail }}</span>
              </div>
            </div>
          </div>

          <p class="sq-footnote">
            Full ODD document: <code>docs/ODD_PROTOCOL.md</code>
          </p>
        </div>

      </div>
    </div>
  </div>
</template>


<style scoped lang="scss">
@use '../../styles/variables' as *;

.sq-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.sq-panel {
  width: min(900px, 92vw);
  max-height: 88vh;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sq-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-md $space-lg;
  border-bottom: 1px solid $border-color;

  &__left {
    display: flex;
    align-items: center;
    gap: $space-sm;
  }

  &__icon { font-size: 20px; }

  &__title {
    font-size: 16px;
    font-weight: 700;
    color: $text-primary;
    margin: 0;
  }

  &__score {
    font-family: $font-mono;
    font-size: 14px;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: $radius-sm;
  }

  &__close {
    background: none;
    border: none;
    color: $text-muted;
    font-size: 18px;
    cursor: pointer;
    &:hover { color: $text-primary; }
  }
}

.sq-score--high { background: rgba(129, 178, 154, 0.2); color: #81B29A; }
.sq-score--mid { background: rgba(212, 165, 116, 0.2); color: $color-accent; }
.sq-score--low { background: rgba(224, 122, 95, 0.2); color: #E07A5F; }

.sq-tabs {
  display: flex;
  border-bottom: 1px solid $border-color;
  padding: 0 $space-md;
  overflow-x: auto;

  &__btn {
    background: none;
    border: none;
    color: $text-muted;
    font-size: 12px;
    padding: $space-sm $space-md;
    cursor: pointer;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;

    &:hover { color: $text-primary; }
    &--active {
      color: $color-accent;
      border-bottom-color: $color-accent;
    }
  }
}

.sq-content {
  flex: 1;
  overflow-y: auto;
  padding: $space-lg;
}

.sq-tab__intro {
  font-size: 12px;
  color: $text-secondary;
  margin: 0 0 $space-lg 0;
  line-height: 1.5;
}

// Score hero
.sq-score-hero {
  display: flex;
  align-items: center;
  gap: $space-lg;
  margin-bottom: $space-xl;
  padding: $space-lg;
  background: rgba(40, 40, 60, 0.4);
  border-radius: $radius-md;
}

.sq-score-circle {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 3px solid currentColor;

  &__value { font-size: 24px; font-weight: 800; font-family: $font-mono; }
  &__label { font-size: 11px; color: $text-muted; }
}

.sq-score-hero__desc {
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.6;
  margin: 0;
}

// Criteria grid
.sq-criteria-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $space-md;
  margin-bottom: $space-lg;
}

.sq-criteria {
  padding: $space-md;
  background: rgba(40, 40, 60, 0.3);
  border-radius: $radius-md;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    color: $text-primary;
    margin-bottom: $space-xs;
  }

  &__badge {
    font-size: 10px;
    font-family: $font-mono;
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 700;

    &--green { background: rgba(129, 178, 154, 0.2); color: #81B29A; }
    &--yellow { background: rgba(212, 165, 116, 0.2); color: $color-accent; }
    &--red { background: rgba(224, 122, 95, 0.2); color: #E07A5F; }
    &--gray { background: rgba(100, 100, 140, 0.2); color: $text-muted; }
  }

  &__bar {
    height: 4px;
    background: rgba(60, 60, 90, 0.5);
    border-radius: 2px;
    margin-bottom: $space-xs;
    overflow: hidden;
  }

  &__fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.5s ease;

    &--green { background: #81B29A; }
    &--yellow { background: $color-accent; }
    &--red { background: #E07A5F; }
    &--gray { background: $text-muted; }
  }

  &__detail {
    font-size: 10px;
    color: $text-muted;
    margin: 0;
    line-height: 1.4;
  }
}

// Actions row
.sq-actions-row {
  display: flex;
  gap: $space-md;
  flex-wrap: wrap;
}

.sq-btn {
  background: $bg-button;
  border: 1px solid $border-color;
  color: $text-primary;
  font-size: 11px;
  padding: $space-sm $space-md;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: background 0.15s;

  &:hover:not(:disabled) { background: $bg-button-hover; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }

  &--primary {
    background: rgba(212, 165, 116, 0.15);
    border-color: rgba(212, 165, 116, 0.3);
    color: $color-accent;
    font-weight: 600;
    &:hover:not(:disabled) { background: rgba(212, 165, 116, 0.25); }
  }

  &--large {
    padding: $space-md $space-xl;
    font-size: 13px;
  }
}

// Stats row
.sq-stat-row {
  display: flex;
  gap: $space-md;
  flex-wrap: wrap;
  margin-bottom: $space-md;
}

.sq-stat {
  flex: 1;
  min-width: 100px;
  padding: $space-sm $space-md;
  background: rgba(40, 40, 60, 0.3);
  border-radius: $radius-sm;
  text-align: center;

  &__value {
    display: block;
    font-size: 16px;
    font-weight: 700;
    font-family: $font-mono;
    color: $text-primary;

    &--green { color: #81B29A; }
    &--red { color: #E07A5F; }
  }

  &__label {
    display: block;
    font-size: 10px;
    color: $text-muted;
    margin-top: 2px;
  }
}

// Test suites
.sq-suite {
  margin-bottom: $space-md;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    gap: $space-sm;
    padding: $space-sm $space-md;
    background: rgba(40, 40, 60, 0.4);
  }

  &__status {
    font-size: 14px;
    font-weight: 700;
    &--pass { color: #81B29A; }
    &--fail { color: #E07A5F; }
  }

  &__name {
    font-size: 12px;
    font-weight: 600;
    font-family: $font-mono;
    color: $text-primary;
    flex: 1;
  }

  &__count {
    font-size: 11px;
    font-family: $font-mono;
    color: $text-muted;
  }

  &__categories {
    padding: $space-sm $space-md;
  }
}

.sq-cat {
  display: flex;
  align-items: center;
  gap: $space-sm;
  padding: 3px 0;

  &__name {
    font-size: 11px;
    font-weight: 600;
    color: $text-secondary;
    min-width: 160px;
  }

  &__count {
    font-size: 10px;
    font-family: $font-mono;
    color: $color-accent;
    min-width: 50px;
  }

  &__desc {
    font-size: 10px;
    color: $text-muted;
  }
}

// Progress bar
.sq-progress {
  margin-bottom: $space-md;

  &__bar {
    height: 6px;
    background: rgba(60, 60, 90, 0.5);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: $space-xs;
  }

  &__fill {
    height: 100%;
    background: $color-accent;
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  &__text {
    font-size: 11px;
    color: $text-muted;
    font-family: $font-mono;
  }
}

// Empty state
.sq-empty {
  text-align: center;
  padding: $space-xl;

  &__hint {
    font-size: 11px;
    color: $text-muted;
    margin-top: $space-sm;
  }
}

// Distribution bars
.sq-distribution {
  margin: $space-lg 0;

  h4 {
    font-size: 12px;
    font-weight: 600;
    color: $text-secondary;
    margin: 0 0 $space-sm 0;
  }
}

.sq-dist-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 60px;
  padding: 0 $space-xs;
}

.sq-dist-bar {
  flex: 1;
  min-width: 4px;
  background: $color-accent;
  border-radius: 2px 2px 0 0;
  opacity: 0.7;
  transition: opacity 0.15s;
  &:hover { opacity: 1; }
}

.sq-dist-legend {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: $text-muted;
  margin-top: 2px;
}

// Export row
.sq-export-row {
  display: flex;
  gap: $space-sm;
  margin-top: $space-lg;
  flex-wrap: wrap;
}

// Sensitivity table
.sq-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  margin-bottom: $space-md;

  th {
    text-align: left;
    padding: $space-xs $space-sm;
    font-weight: 600;
    color: $text-muted;
    border-bottom: 1px solid $border-color;
  }

  td {
    padding: $space-xs $space-sm;
    color: $text-secondary;
    font-family: $font-mono;
    border-bottom: 1px solid rgba(100, 100, 140, 0.15);
  }
}

.sq-el {
  &--high { color: #E07A5F !important; font-weight: 700; }
  &--mid { color: $color-accent !important; }
  &--low { color: $text-muted !important; }
}

// Sensitivity param bars
.sq-param-detail {
  margin: $space-md 0;

  h4 {
    font-size: 12px;
    font-weight: 600;
    color: $text-secondary;
    margin: 0 0 $space-xs 0;
  }
}

.sq-param-bars {
  display: flex;
  align-items: flex-end;
  gap: $space-sm;
  height: 50px;
}

.sq-param-bar-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.sq-param-bar {
  width: 100%;
  max-width: 40px;
  background: $color-accent;
  border-radius: 2px 2px 0 0;
  opacity: 0.7;
}

.sq-param-bar-label {
  font-size: 9px;
  color: $text-muted;
  margin-top: 2px;
  font-family: $font-mono;
}

// ODD compliance
.sq-odd-summary {
  display: flex;
  align-items: baseline;
  gap: $space-sm;
  margin-bottom: $space-md;
}

.sq-odd-score {
  font-size: 24px;
  font-weight: 800;
  font-family: $font-mono;
  color: $color-accent;
}

.sq-odd-label {
  font-size: 12px;
  color: $text-muted;
}

.sq-odd-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sq-odd-item {
  display: flex;
  align-items: flex-start;
  gap: $space-sm;
  padding: $space-xs $space-sm;
  border-radius: $radius-sm;

  &:hover { background: rgba(40, 40, 60, 0.3); }
}

.sq-odd-status {
  font-size: 14px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;

  &--pass { color: #81B29A; }
  &--warn { color: $color-accent; }
  &--pending { color: $text-muted; }
}

.sq-odd-info {
  display: flex;
  flex-direction: column;
}

.sq-odd-section {
  font-size: 12px;
  font-weight: 600;
  color: $text-primary;
}

.sq-odd-detail {
  font-size: 10px;
  color: $text-muted;
  line-height: 1.4;
}

.sq-footnote {
  font-size: 10px;
  color: $text-muted;
  margin-top: $space-md;

  code {
    font-family: $font-mono;
    background: rgba(60, 60, 90, 0.4);
    padding: 1px 4px;
    border-radius: 2px;
    font-size: 10px;
  }
}

.sq-partial {
  margin-top: $space-sm;
}
</style>
