<script setup lang="ts">
// --- V2 Metrics Dashboard ---
// Shows key simulation metrics in real-time: Gini, employment, wealth, automation
// Connected to v2SimulationStore

import { computed } from 'vue'
import { useSimStore } from '../../stores/v2SimulationStore'

const sim = useSimStore()
const m = computed(() => sim.currentMetrics)

function fmt(v: number | undefined, decimals = 1): string {
  if (v === undefined || v === null) return '—'
  return v.toFixed(decimals)
}

function fmtPct(v: number | undefined): string {
  if (v === undefined || v === null || isNaN(v as number)) return '—'
  return (v * 100).toFixed(1) + '%'
}

function fmtMoney(v: number | undefined): string {
  if (v === undefined || v === null) return '—'
  return '$' + Math.round(v).toLocaleString()
}
</script>

<template>
  <div class="metrics">
    <h3 class="metrics__title">
      METRICS
      <span class="metrics__tick" v-if="m">Year {{ m.year }} · Week {{ (m.tick % 52) + 1 }}</span>
    </h3>

    <div v-if="!m" class="metrics__empty">No data</div>

    <template v-else>
      <div class="metric-card metric-card--accent">
        <span class="metric-card__label">Gini Coefficient</span>
        <span class="metric-card__value">{{ fmt(m.giniCoefficient, 3) }}</span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Employed</span>
        <span class="metric-card__value metric-card__value--blue">
          {{ m.employedCount }} <small>({{ fmtPct(m.employedCount / m.totalPopulation) }})</small>
        </span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Unemployed</span>
        <span class="metric-card__value metric-card__value--orange">
          {{ m.unemployedCount }} <small>({{ fmtPct(m.unemployedCount / m.totalPopulation) }})</small>
        </span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Business Owners</span>
        <span class="metric-card__value metric-card__value--purple">{{ m.businessOwnerCount }}</span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Retired</span>
        <span class="metric-card__value" style="color: #707080">
          {{ m.retiredCount }} <small>({{ fmtPct(m.retiredCount / m.totalPopulation) }})</small>
        </span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Children</span>
        <span class="metric-card__value" style="color: #81C784">
          {{ m.childCount }} <small>({{ fmtPct(m.childCount / m.totalPopulation) }})</small>
        </span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Criminals</span>
        <span class="metric-card__value metric-card__value--red">
          {{ m.criminalCount }} <small>({{ fmtPct(m.criminalCount / m.totalPopulation) }})</small>
        </span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">� Prisoners</span>
        <span class="metric-card__value" style="color: #8B4513">
          {{ m.prisonerCount }}
        </span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">� Police</span>
        <span class="metric-card__value" style="color: #1565C0">
          {{ m.policeCount }}
        </span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">🏥 Hospital</span>
        <span class="metric-card__value" style="color: #E53935">
          {{ fmtMoney(m.govExpHospital) }}
        </span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">🏛️ Treasury</span>
        <span class="metric-card__value" :style="{ color: m.governmentTreasury >= 0 ? '#81B29A' : '#E07A5F' }">
          {{ fmtMoney(m.governmentTreasury) }}
        </span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Median Wealth</span>
        <span class="metric-card__value">{{ fmtMoney(m.medianWealth) }}</span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Top 10% Share</span>
        <span class="metric-card__value">{{ fmtPct(m.top10WealthShare) }}</span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Bottom 50% Share</span>
        <span class="metric-card__value">{{ fmtPct(m.bottom50WealthShare) }}</span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Robotic Automation</span>
        <span class="metric-card__value metric-card__value--red">{{ fmtPct(m.automationRate) }}</span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">AI Displacement</span>
        <span class="metric-card__value metric-card__value--red">{{ fmtPct(m.aiDisplacementRate) }}</span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Total Displaced</span>
        <span class="metric-card__value metric-card__value--red">{{ fmtPct(m.totalDisplacementRate) }}</span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Jobs (filled)</span>
        <span class="metric-card__value">{{ m.filledJobs }}</span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Workers Fired (Robot)</span>
        <span class="metric-card__value metric-card__value--red">{{ m.roboticFiredWorkers }}</span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Workers Fired (AI)</span>
        <span class="metric-card__value metric-card__value--red">{{ m.aiFiredWorkers }}</span>
      </div>

      <div class="metric-card">
        <span class="metric-card__label">Satisfaction</span>
        <span class="metric-card__value">{{ fmtPct(m.meanSatisfaction) }}</span>
      </div>

      <!-- Religion Demographics -->
      <template v-if="m.religionShares && Object.values(m.religionShares).some(v => v > 0)">
        <div class="metric-card" style="margin-top: 8px; border-top: 1px solid rgba(100,100,140,0.15);">
          <span class="metric-card__label" style="font-weight: 600;">Religion</span>
          <span class="metric-card__value" style="font-size: 10px; color: #9B72AA;">Avg Rel. {{ fmtPct(m.avgReligiosity) }}</span>
        </div>
        <div class="metric-card" v-for="(share, aff) in m.religionShares" :key="aff">
          <span class="metric-card__label" style="text-transform: capitalize;">{{ aff }}</span>
          <span class="metric-card__value">{{ fmtPct(share) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-card__label">Mixed Marriages</span>
          <span class="metric-card__value">{{ fmtPct(m.mixedMarriageRate) }}</span>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.metrics {
  padding: $space-md;

  &__title {
    font-size: $font-size-xs;
    font-weight: 600;
    color: $text-muted;
    letter-spacing: 0.08em;
    margin: 0 0 $space-sm 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__tick {
    font-size: 10px;
    color: $color-accent;
    font-family: monospace;
    letter-spacing: 0;
    font-weight: 500;
  }

  &__empty {
    color: $text-muted;
    font-size: $font-size-sm;
    text-align: center;
    padding: $space-lg 0;
  }
}

.metric-card {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 5px 0;
  border-bottom: 1px solid rgba(100, 100, 140, 0.1);

  &--accent {
    padding: $space-sm 0;
    border-bottom: 1px solid rgba(212, 165, 116, 0.2);
  }

  &__label {
    font-size: $font-size-xs;
    color: $text-muted;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &__value {
    font-family: monospace;
    font-size: $font-size-sm;
    color: $text-primary;

    small {
      font-size: 10px;
      color: $text-muted;
    }

    &--blue { color: #5B8FB9; }
    &--orange { color: #E07A5F; }
    &--purple { color: #9B72AA; }
    &--red { color: #C44536; }
  }

  &--accent &__value {
    font-size: 18px;
    font-weight: 700;
    color: $color-accent;
  }
}
</style>
