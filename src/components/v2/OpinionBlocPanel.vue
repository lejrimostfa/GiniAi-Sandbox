<script setup lang="ts">
// --- Opinion Bloc Panel ---
// Displays YES / NO / UNDECIDED blocs with size, avg score, cohesion
// Connected to civicStore

import { computed } from 'vue'
import { useCivicStore } from '../../stores/civicStore'

const civic = useCivicStore()

const blocColors: Record<string, string> = {
  YES: '#66bb6a',
  NO: '#ef5350',
  UNDECIDED: '#ffa726',
}

const totalCitizens = computed(() =>
  civic.blocs.reduce((sum, b) => sum + b.citizenIds.length, 0)
)
</script>

<template>
  <div v-if="civic.isActive && civic.blocs.length > 0" class="blocs">
    <h4 class="blocs__title">📊 OPINION BLOCS</h4>

    <div class="blocs__grid">
      <div
        v-for="bloc in civic.blocs"
        :key="bloc.id"
        class="bloc-card"
        :style="{ borderLeftColor: blocColors[bloc.label] ?? '#888' }"
      >
        <div class="bloc-card__header">
          <span class="bloc-card__label" :style="{ color: blocColors[bloc.label] ?? '#888' }">
            {{ bloc.label }}
          </span>
          <span class="bloc-card__count">{{ bloc.citizenIds.length }}</span>
        </div>

        <!-- Size bar -->
        <div class="bloc-card__bar">
          <div
            class="bloc-card__bar-fill"
            :style="{
              width: totalCitizens > 0 ? ((bloc.citizenIds.length / totalCitizens) * 100) + '%' : '0%',
              background: blocColors[bloc.label] ?? '#888'
            }"
          ></div>
        </div>

        <div class="bloc-card__stats">
          <span>Avg score: <strong>{{ bloc.avgScore.toFixed(2) }}</strong></span>
          <span>Cohesion: <strong>{{ (1 - Math.min(bloc.cohesion, 1)).toFixed(2) }}</strong></span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.blocs {
  padding: $space-sm;

  &__title {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: $text-secondary;
    margin-bottom: $space-xs;
  }

  &__grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
}

.bloc-card {
  padding: 6px 8px;
  border-left: 3px solid #888;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0 4px 4px 0;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  &__label {
    font-size: 0.75rem;
    font-weight: 700;
  }

  &__count {
    font-size: 0.8rem;
    font-weight: 700;
    color: $text-primary;
  }

  &__bar {
    height: 4px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 4px;
  }

  &__bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s;
  }

  &__stats {
    display: flex;
    justify-content: space-between;
    font-size: 0.65rem;
    color: $text-muted;

    strong {
      color: $text-secondary;
    }
  }
}
</style>
