// --- Metrics History ---
// Accumulates snapshot metrics over time for time-series charts
// Resets when new data is loaded, records each step as playback advances
// Connected to simulationStore via event bus

import { ref, computed } from 'vue'
import eventBus from '../events/eventBus'
import { useSimulationStore } from '../stores/simulationStore'
import type { Snapshot } from '../types/simulation'

export interface MetricsHistoryPoint {
  step: number
  workerShare: number
  precariousShare: number
  ownerShare: number
  gini: number
  deprivationShare: number
  mobilityPW: number
  mobilityWP: number
  largestPrecariousCluster: number
  meanClusterSize: number
  redistributionLevel: number
  stressIndex: number
}

// Singleton state — shared across all consumers
const history = ref<MetricsHistoryPoint[]>([])
let listenersBound = false

/** Convert snapshots array to history points */
function snapshotsToHistory(snapshots: Snapshot[]): MetricsHistoryPoint[] {
  return snapshots.map((snap) => ({
    step: snap.step,
    workerShare: snap.metrics.workerShare,
    precariousShare: snap.metrics.precariousShare,
    ownerShare: snap.metrics.ownerShare,
    gini: snap.metrics.gini,
    deprivationShare: snap.metrics.deprivationShare,
    mobilityPW: snap.metrics.mobilityPW,
    mobilityWP: snap.metrics.mobilityWP,
    largestPrecariousCluster: snap.metrics.largestPrecariousCluster,
    meanClusterSize: snap.metrics.meanClusterSize,
    redistributionLevel: snap.metrics.redistributionLevel,
    stressIndex: snap.metrics.stressIndex ?? 0,
  }))
}

function bindListeners() {
  if (listenersBound) return
  listenersBound = true

  // Listen for future timeline loads
  eventBus.on('snapshot:loaded', (snapshots) => {
    history.value = snapshotsToHistory(snapshots)
  })
}

export function useMetricsHistory() {
  bindListeners()

  // If data already loaded before this composable was first used, populate now
  const sim = useSimulationStore()
  if (history.value.length === 0 && sim.snapshots.length > 0) {
    history.value = snapshotsToHistory(sim.snapshots)
  }

  /** Get metric array for a specific key */
  function getSeriesData(key: keyof Omit<MetricsHistoryPoint, 'step'>): number[] {
    return history.value.map((h) => h[key])
  }

  /** Get step labels */
  const stepLabels = computed(() => history.value.map((h) => h.step))

  /** Get data up to a specific step (for cursor tracking) */
  function getSeriesUpTo(key: keyof Omit<MetricsHistoryPoint, 'step'>, step: number): (number | null)[] {
    return history.value.map((h) => h.step <= step ? h[key] : null)
  }

  return {
    history,
    stepLabels,
    getSeriesData,
    getSeriesUpTo,
  }
}
