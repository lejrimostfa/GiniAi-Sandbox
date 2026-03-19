<script setup lang="ts">
// --- Vote Results Panel ---
// Displays referendum results: YES/NO/ABSTAIN bars, turnout, breakdowns
// Connected to civicStore

import { computed } from 'vue'
import { useCivicStore } from '../../stores/civicStore'
import { useChatStore } from '../../stores/chatStore'

const civic = useCivicStore()
const chat = useChatStore()
const r = computed(() => civic.result)

function fmtPct(v: number): string {
  return (v * 100).toFixed(1) + '%'
}

// Breakdown tab keys
const breakdownTabs = computed(() => {
  const base: string[] = ['byEducation', 'byEmployment', 'byWealth', 'byHomeOwnership']
  if (r.value?.breakdowns?.byReligion) base.push('byReligion')
  return base
})

const tabLabels: Record<string, string> = {
  byEducation: 'Education',
  byEmployment: 'Employment',
  byWealth: 'Wealth',
  byHomeOwnership: 'Ownership',
  byReligion: 'Religion',
}
</script>

<template>
  <div v-if="r" class="results">
    <h4 class="results__title">📊 VOTE RESULTS</h4>

    <!-- Main result -->
    <div class="results__outcome" :class="r.yesShare > 0.5 ? 'results__outcome--yes' : 'results__outcome--no'">
      {{ r.yesShare > 0.5 ? '✅ YES wins' : '❌ NO wins' }}
    </div>

    <!-- Summary -->
    <div class="results__summary">
      <div class="results__stat">
        <span class="results__label">Turnout</span>
        <span class="results__value">{{ fmtPct(r.turnout) }}</span>
      </div>
      <div class="results__stat">
        <span class="results__label">YES</span>
        <span class="results__value results__value--yes">{{ r.yesVotes }} ({{ fmtPct(r.yesShare) }})</span>
      </div>
      <div class="results__stat">
        <span class="results__label">NO</span>
        <span class="results__value results__value--no">{{ r.noVotes }} ({{ fmtPct(r.noShare) }})</span>
      </div>
      <div class="results__stat">
        <span class="results__label">Abstain</span>
        <span class="results__value results__value--abs">{{ r.abstainVotes }}</span>
      </div>
    </div>

    <!-- Vote bar -->
    <div class="results__bar">
      <div class="results__bar-yes" :style="{ width: fmtPct(r.yesShare) }"></div>
      <div class="results__bar-no" :style="{ width: fmtPct(r.noShare) }"></div>
    </div>

    <!-- Breakdowns -->
    <div class="results__breakdowns">
      <details v-for="tab in breakdownTabs" :key="tab" class="results__breakdown">
        <summary class="results__breakdown-title">{{ tabLabels[tab] }}</summary>
        <table class="results__table">
          <thead>
            <tr><th>Group</th><th>Yes</th><th>No</th><th>Abstain</th></tr>
          </thead>
          <tbody>
            <tr v-for="(entry, group) in (r.breakdowns as Record<string, Record<string, { yes: number; no: number; abstain: number }>>)[tab]" :key="group">
              <td style="text-transform: capitalize;">{{ group }}</td>
              <td class="results__td--yes">{{ entry.yes }}</td>
              <td class="results__td--no">{{ entry.no }}</td>
              <td class="results__td--abs">{{ entry.abstain }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </div>

    <!-- Bloc Chat Buttons -->
    <div class="results__chat-blocs">
      <span class="results__chat-label">Interview voters:</span>
      <div class="results__chat-btns">
        <button class="results__chat-btn results__chat-btn--yes" :disabled="r.yesVotes === 0" @click="chat.openBlocChat('YES')" title="Chat with YES voters">💬 YES</button>
        <button class="results__chat-btn results__chat-btn--no" :disabled="r.noVotes === 0" @click="chat.openBlocChat('NO')" title="Chat with NO voters">💬 NO</button>
        <button class="results__chat-btn results__chat-btn--abs" :disabled="r.abstainVotes === 0" @click="chat.openBlocChat('UNDECIDED')" title="Chat with abstainers">💬 Abstain</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.results {
  padding: $space-sm;

  &__title {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: $text-secondary;
    margin-bottom: $space-xs;
  }

  &__outcome {
    font-size: 0.85rem;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 4px;
    margin-bottom: 6px;
    text-align: center;

    &--yes { background: rgba(76, 175, 80, 0.15); color: #66bb6a; }
    &--no  { background: rgba(239, 83, 80, 0.15); color: #ef5350; }
  }

  &__summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    margin-bottom: 8px;
  }

  &__stat {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    padding: 2px 4px;
  }

  &__label { color: $text-muted; }
  &__value { font-weight: 600; color: $text-primary; }
  &__value--yes { color: #66bb6a; }
  &__value--no  { color: #ef5350; }
  &__value--abs { color: $text-muted; }

  &__bar {
    display: flex;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.05);
    margin-bottom: 8px;
  }

  &__bar-yes { background: #66bb6a; transition: width 0.3s; }
  &__bar-no  { background: #ef5350; transition: width 0.3s; }

  &__breakdowns {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__breakdown {
    font-size: 0.65rem;
  }

  &__breakdown-title {
    cursor: pointer;
    color: $text-secondary;
    font-weight: 600;
    padding: 2px 0;
    &:hover { color: $text-primary; }
  }

  &__table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 2px;

    th, td {
      padding: 2px 4px;
      text-align: left;
      font-size: 0.65rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    th { color: $text-muted; font-weight: 600; }
  }

  &__td--yes { color: #66bb6a; }
  &__td--no  { color: #ef5350; }
  &__td--abs { color: $text-muted; }

  &__chat-blocs {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  &__chat-label {
    font-size: 0.6rem;
    color: $text-muted;
    display: block;
    margin-bottom: 4px;
  }

  &__chat-btns {
    display: flex;
    gap: 4px;
  }

  &__chat-btn {
    flex: 1;
    padding: 3px 6px;
    font-size: 0.6rem;
    font-weight: 600;
    border-radius: 3px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;

    &:disabled {
      opacity: 0.25;
      cursor: not-allowed;
      pointer-events: none;
    }

    &--yes {
      background: rgba(76, 175, 80, 0.1);
      color: #66bb6a;
      border-color: rgba(76, 175, 80, 0.2);
      &:hover:not(:disabled) { background: rgba(76, 175, 80, 0.25); }
    }
    &--no {
      background: rgba(239, 83, 80, 0.1);
      color: #ef5350;
      border-color: rgba(239, 83, 80, 0.2);
      &:hover:not(:disabled) { background: rgba(239, 83, 80, 0.25); }
    }
    &--abs {
      background: rgba(160, 160, 176, 0.1);
      color: $text-muted;
      border-color: rgba(160, 160, 176, 0.2);
      &:hover:not(:disabled) { background: rgba(160, 160, 176, 0.25); color: $text-secondary; }
    }
  }
}
</style>
