<script setup lang="ts">
// --- Help Page ---
// Simplified interconnection diagram explaining how simulation events
// relate to each other, with emojis for visual clarity

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="help-overlay" @click.self="emit('close')">
    <div class="help-page">
      <button class="help-page__close" @click="emit('close')">✕</button>
      <h2 class="help-page__title">📖 How does the simulation work?</h2>
      <p class="help-page__intro">
        Everything is interconnected. Every event has cascading consequences.
        Here are the main mechanics:
      </p>

      <!-- Life Cycle -->
      <section class="help-section">
        <h3>🔄 Life Cycle</h3>
        <div class="chain">
          <span class="chain__node">👶 Birth</span>
          <span class="chain__arrow">→</span>
          <span class="chain__node">👦 Child (school)</span>
          <span class="chain__arrow">→</span>
          <span class="chain__node">🎓 Graduation (age 18)</span>
          <span class="chain__arrow">→</span>
          <span class="chain__node">🔍 Unemployed</span>
          <span class="chain__arrow">→</span>
          <span class="chain__node">🏃 Employed</span>
          <span class="chain__arrow">→</span>
          <span class="chain__node">👴 Retired</span>
          <span class="chain__arrow">→</span>
          <span class="chain__node">☠️ Death</span>
        </div>
      </section>

      <!-- Economy -->
      <section class="help-section">
        <h3>💰 Economy</h3>
        <ul class="cause-list">
          <li>🏃 <b>Work</b> → 💵 Wage (upon reaching workplace)</li>
          <li>🛒 <b>Market</b> → 💸 Spending (upon reaching market)</li>
          <li>📦 <b>Manual worker</b> → 🌳 Resource → 🏭 Factory → 💵 Wage</li>
          <li>👨‍💼 <b>Entrepreneur</b> → 🏦 Loan → 🏢 Create business → 📈 Revenue or 💥 Bankruptcy</li>
          <li>🏦 <b>Bank</b> → Loans to agents (monthly repayment)</li>
          <li>📉 <b>Business failure</b> → Employees laid off + personal debt</li>
        </ul>
      </section>

      <!-- Government -->
      <section class="help-section">
        <h3>🏛️ Government & Redistribution</h3>
        <ul class="cause-list">
          <li>💼 <b>Taxes</b> → Collected from workers' income</li>
          <li>👴 <b>Pensions</b> → Funded by taxes (50% max of budget)</li>
          <li>🔧 <b>Infrastructure</b> → Maintenance cost (20% of remaining budget)</li>
          <li>📉 <b>Unemployment benefits</b> → Aid for unemployed (30% of remaining)</li>
          <li>🤝 <b>Surplus</b> → Redistributed as Universal Basic Income (UBI) to all</li>
        </ul>
      </section>

      <!-- Causal chains -->
      <section class="help-section">
        <h3>⚡ Causal Chains</h3>
        <div class="cause-grid">
          <div class="cause-card cause-card--bad">
            <div class="cause-card__title">📉 Prolonged Unemployment</div>
            <div class="cause-card__chain">
              🔍 Jobless → 😞 Satisfaction ↓ → 🪙 Poverty → 🥷 Crime
            </div>
          </div>
          <div class="cause-card cause-card--bad">
            <div class="cause-card__title">🤒 Disease</div>
            <div class="cause-card__chain">
              🪙 Poverty + 😞 Prolonged stress → 🤒 Illness → ☠️ Premature death
            </div>
          </div>
          <div class="cause-card cause-card--bad">
            <div class="cause-card__title">💔 Divorce</div>
            <div class="cause-card__chain">
              😞 Very low satisfaction → 💔 Divorce → 💸 Wealth loss
            </div>
          </div>
          <div class="cause-card cause-card--good">
            <div class="cause-card__title">💍 Marriage</div>
            <div class="cause-card__chain">
              💼 Stable job + 😊 High satisfaction → 💍 Marriage (physical encounter)
            </div>
          </div>
          <div class="cause-card cause-card--good">
            <div class="cause-card__title">🏢 Entrepreneurship</div>
            <div class="cause-card__chain">
              💰 Wealthy + 🎓 Educated + 📈 Productive → 🏢 Create business → 💵 or 💥
            </div>
          </div>
          <div class="cause-card cause-card--neutral">
            <div class="cause-card__title">🤖 Automation</div>
            <div class="cause-card__chain">
              🏭 Robots → Manual workers replaced / 🧠 AI → White-collar displaced
            </div>
          </div>
        </div>
      </section>

      <!-- Proximity -->
      <section class="help-section">
        <h3>📍 Proximity Interactions</h3>
        <p class="help-text">
          Social events only occur when agents physically encounter each other:
        </p>
        <ul class="cause-list">
          <li>🤒→😷 <b>Contagion</b> — A sick agent near a healthy one</li>
          <li>🥷→💰 <b>Theft</b> — A criminal near a victim</li>
          <li>🥷→🔍 <b>Influence</b> — Unemployed near a criminal → radicalization</li>
          <li>💼→🔍 <b>Word-of-mouth</b> — An employee shares a job opportunity</li>
          <li>💍 <b>Marriage</b> — Two compatible agents meet physically</li>
          <li>🥷→🏛️ <b>Rehabilitation</b> — A criminal near a government building</li>
        </ul>
      </section>

      <!-- Annual Events -->
      <section class="help-section">
        <h3>📅 Annual Events</h3>
        <div class="annual-grid">
          <div class="annual-item"><span class="annual-q">Q1</span> 🏛️ Tax Day — Everyone visits the government</div>
          <div class="annual-item"><span class="annual-q">Q2</span> 🔍 Job Fair — Unemployed agents seek work</div>
          <div class="annual-item"><span class="annual-q">Q3</span> 🛒 Market Festival — Everyone goes shopping</div>
          <div class="annual-item"><span class="annual-q">Q4</span> 🏥 Health & Education — Healthcare + studies</div>
        </div>
      </section>

      <!-- Key Insight -->
      <section class="help-section help-section--highlight">
        <h3>🎯 Summary</h3>
        <p class="help-text">
          <b>Inequality</b> (Gini coefficient) is the emergent result of all these interactions.
          The higher the Gini, the more concentrated the wealth.
          Redistribution, education, and employment are the levers to reduce it.
          But beware: too much redistribution can stifle entrepreneurship! ⚖️
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.help-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.help-page {
  position: relative;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  padding: $space-xl;
  max-width: 720px;
  max-height: 85vh;
  overflow-y: auto;
  color: $text-primary;

  &__close {
    position: absolute;
    top: 12px;
    right: 12px;
    background: none;
    border: none;
    color: $text-muted;
    font-size: 18px;
    cursor: pointer;
    &:hover { color: $text-primary; }
  }

  &__title {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 $space-sm 0;
    color: $color-accent;
  }

  &__intro {
    font-size: 13px;
    color: $text-secondary;
    margin-bottom: $space-lg;
  }
}

.help-section {
  margin-bottom: $space-lg;

  h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 $space-sm 0;
    color: $text-primary;
  }

  &--highlight {
    background: rgba(212, 165, 116, 0.08);
    border-radius: $radius-md;
    padding: $space-md;
  }
}

.help-text {
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.6;
  margin: 0;
}

.chain {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;

  &__node {
    background: rgba(60, 60, 90, 0.5);
    border: 1px solid rgba(100, 100, 140, 0.3);
    border-radius: $radius-sm;
    padding: 3px 8px;
    font-size: 11px;
    white-space: nowrap;
  }

  &__arrow {
    color: $color-accent;
    font-weight: bold;
    font-size: 14px;
  }
}

.cause-list {
  list-style: none;
  padding: 0;
  margin: 0;

  li {
    font-size: 12px;
    color: $text-secondary;
    padding: 3px 0;
    line-height: 1.5;
  }
}

.cause-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $space-sm;
}

.cause-card {
  background: rgba(40, 40, 60, 0.5);
  border-radius: $radius-md;
  padding: $space-sm;
  border-left: 3px solid transparent;

  &--bad { border-left-color: #E07A5F; }
  &--good { border-left-color: #81B29A; }
  &--neutral { border-left-color: #5B8FB9; }

  &__title {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  &__chain {
    font-size: 11px;
    color: $text-muted;
    line-height: 1.5;
  }
}

.annual-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.annual-item {
  font-size: 12px;
  color: $text-secondary;
  padding: 4px 8px;
  background: rgba(40, 40, 60, 0.3);
  border-radius: $radius-sm;
}

.annual-q {
  display: inline-block;
  background: $color-accent;
  color: $bg-primary;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  margin-right: 6px;
}
</style>
