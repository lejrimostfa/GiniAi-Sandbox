<script setup lang="ts">
// --- Simulation Legend ---
// Collapsible sections explaining locations, agents, and floating events
import { ref } from 'vue'

const showLocations = ref(false)
const showAgents = ref(false)
const showEvents = ref(false)
</script>

<template>
  <div class="legend">
    <h3 class="legend__title">LEGEND</h3>

    <!-- Lieux section -->
    <div class="legend__section">
      <button class="legend__toggle" @click="showLocations = !showLocations">
        <span class="legend__arrow">{{ showLocations ? '▾' : '▸' }}</span>
        <span class="legend__section-label">Locations</span>
      </button>
      <div v-show="showLocations" class="legend__content">
        <div class="legend__item"><span class="legend__emoji">🏠</span><span>Home</span></div>
        <div class="legend__item"><span class="legend__emoji">🔧</span><span>Manual Labor</span></div>
        <div class="legend__item"><span class="legend__emoji">💼</span><span>Office / Skilled</span></div>
        <div class="legend__item"><span class="legend__emoji">🎨</span><span>Studio / Creative</span></div>
        <div class="legend__item"><span class="legend__emoji">🛍️</span><span>Retail / Service</span></div>
        <div class="legend__item"><span class="legend__emoji">🛒</span><span>Market</span></div>
        <div class="legend__item"><span class="legend__emoji">🎓</span><span>School / University</span></div>
        <div class="legend__item"><span class="legend__emoji">🏛️</span><span>Government</span></div>
        <div class="legend__item"><span class="legend__emoji">🌳</span><span>Resource</span></div>
        <div class="legend__item"><span class="legend__emoji">🏭</span><span>Factory</span></div>
        <div class="legend__item"><span class="legend__emoji">🏦</span><span>Bank</span></div>
      </div>
    </div>

    <!-- Agents section -->
    <div class="legend__section">
      <button class="legend__toggle" @click="showAgents = !showAgents">
        <span class="legend__arrow">{{ showAgents ? '▾' : '▸' }}</span>
        <span class="legend__section-label">Agents</span>
      </button>
      <div v-show="showAgents" class="legend__content">
        <div class="legend__item"><span class="legend__emoji">🏃</span><span>Working (♂)</span></div>
        <div class="legend__item"><span class="legend__emoji">🏃‍♀️</span><span>Working (♀)</span></div>
        <div class="legend__item"><span class="legend__emoji">🚶</span><span>Commuting</span></div>
        <div class="legend__item"><span class="legend__emoji">🧎</span><span>Resting</span></div>
        <div class="legend__item"><span class="legend__emoji">🔍</span><span>Job Seeking</span></div>
        <div class="legend__item"><span class="legend__emoji">🧍</span><span>Idle</span></div>
        <div class="legend__item"><span class="legend__emoji">🛒</span><span>Shopping</span></div>
        <div class="legend__item"><span class="legend__emoji">📚</span><span>Studying</span></div>
        <div class="legend__item"><span class="legend__emoji">📦</span><span>Hauling Resource</span></div>
        <div class="legend__item"><span class="legend__emoji">👨‍💼</span><span>Business Owner (♂)</span></div>
        <div class="legend__item"><span class="legend__emoji">👩‍💼</span><span>Business Owner (♀)</span></div>
        <div class="legend__item"><span class="legend__emoji">👴</span><span>Retired (♂)</span></div>
        <div class="legend__item"><span class="legend__emoji">👵</span><span>Retired (♀)</span></div>
        <div class="legend__item"><span class="legend__emoji">🥷</span><span>Criminal</span></div>
        <div class="legend__item"><span class="legend__emoji">�</span><span>Police</span></div>
        <div class="legend__item"><span class="legend__emoji">✊</span><span>On Strike</span></div>
        <div class="legend__item"><span class="legend__emoji">�👦</span><span>Child (♂)</span></div>
        <div class="legend__item"><span class="legend__emoji">👧</span><span>Child (♀)</span></div>
      </div>
    </div>

    <!-- Floating events section -->
    <div class="legend__section">
      <button class="legend__toggle" @click="showEvents = !showEvents">
        <span class="legend__arrow">{{ showEvents ? '▾' : '▸' }}</span>
        <span class="legend__section-label">Floating Events</span>
      </button>
      <div v-show="showEvents" class="legend__content">
        <div class="legend__item"><span class="legend__emoji" style="color: #81C784">+$</span><span>Income (wage, pension, loan)</span></div>
        <div class="legend__item"><span class="legend__emoji" style="color: #E07A5F">-$</span><span>Expense (shopping, rent, education)</span></div>
        <div class="legend__item"><span class="legend__emoji">💍</span><span>Marriage</span></div>
        <div class="legend__item"><span class="legend__emoji">👶</span><span>Birth</span></div>
        <div class="legend__item"><span class="legend__emoji">💔</span><span>Divorce</span></div>
        <div class="legend__item"><span class="legend__emoji">🤒</span><span>Illness</span></div>
        <div class="legend__item"><span class="legend__emoji">☠️</span><span>Death</span></div>
        <div class="legend__item"><span class="legend__emoji">🎓</span><span>Graduation / Education Upgrade</span></div>
        <div class="legend__item"><span class="legend__emoji">🏢</span><span>Business Created</span></div>
        <div class="legend__item"><span class="legend__emoji">💸</span><span>Severance Pay</span></div>
        <div class="legend__item"><span class="legend__emoji">🏠</span><span>Inheritance</span></div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.legend {
  padding: $space-sm $space-md;
  font-size: 11px;
  color: $text-muted;
  background: rgba(30, 30, 40, 0.6);
  border-radius: $radius-md;
  pointer-events: auto;

  &__title {
    font-size: $font-size-xs;
    font-weight: 600;
    letter-spacing: 0.08em;
    margin: 0 0 $space-xs 0;
    color: $text-primary;
  }

  &__section {
    margin-bottom: 2px;
  }

  &__toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    padding: 3px 0;
    cursor: pointer;
    width: 100%;
    text-align: left;
    color: inherit;

    &:hover {
      .legend__section-label { color: $text-primary; }
    }
  }

  &__arrow {
    font-size: 9px;
    color: $text-muted;
    width: 10px;
  }

  &__section-label {
    font-weight: 600;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: $color-accent;
    transition: color 0.15s;
  }

  &__content {
    padding-left: 14px;
    padding-bottom: 2px;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 1px 0;
  }

  &__emoji {
    font-size: 12px;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
  }
}
</style>
