// --- Simulation Store ---
// Manages simulation snapshots, playback state, and current step
// Emits events on snapshot/playback changes for Scene consumption

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Snapshot, SimParams } from '../types/simulation'
import type { PlaybackState } from '../types/visualization'
import { DEFAULT_SIM_PARAMS } from '../types/simulation'
import eventBus from '../events/eventBus'

export const useSimulationStore = defineStore('simulation', () => {
  // --- State ---
  const snapshots = ref<Snapshot[]>([])
  const currentStep = ref(0)
  const playbackState = ref<PlaybackState>('stopped')
  const playbackSpeed = ref(1)
  const params = ref<SimParams>({ ...DEFAULT_SIM_PARAMS })

  // --- Getters ---
  const currentSnapshot = computed<Snapshot | null>(() => {
    if (snapshots.value.length === 0) return null
    const idx = Math.min(currentStep.value, snapshots.value.length - 1)
    return snapshots.value[idx] ?? null
  })

  const totalSteps = computed(() => snapshots.value.length)
  const isPlaying = computed(() => playbackState.value === 'playing')
  const hasData = computed(() => snapshots.value.length > 0)

  // --- Playback timer ---
  let playbackTimer: ReturnType<typeof setInterval> | null = null

  function startPlaybackTimer() {
    stopPlaybackTimer()
    const intervalMs = 1000 / playbackSpeed.value
    playbackTimer = setInterval(() => {
      if (currentStep.value < snapshots.value.length - 1) {
        currentStep.value++
        emitSnapshotUpdate()
      } else {
        pause()
      }
    }, intervalMs)
  }

  function stopPlaybackTimer() {
    if (playbackTimer !== null) {
      clearInterval(playbackTimer)
      playbackTimer = null
    }
  }

  // --- Event emission helpers ---
  function emitSnapshotUpdate() {
    const snap = currentSnapshot.value
    if (snap) {
      eventBus.emit('snapshot:updated', snap)
    }
  }

  // --- Actions ---
  function loadSnapshots(data: Snapshot[]) {
    snapshots.value = data
    currentStep.value = 0
    playbackState.value = 'stopped'
    stopPlaybackTimer()
    eventBus.emit('snapshot:loaded', data)
    emitSnapshotUpdate()
  }

  function play() {
    if (snapshots.value.length === 0) return
    playbackState.value = 'playing'
    eventBus.emit('playback:state-changed', 'playing')
    startPlaybackTimer()
  }

  function pause() {
    playbackState.value = 'paused'
    eventBus.emit('playback:state-changed', 'paused')
    stopPlaybackTimer()
  }

  function stop() {
    playbackState.value = 'stopped'
    currentStep.value = 0
    eventBus.emit('playback:state-changed', 'stopped')
    stopPlaybackTimer()
    emitSnapshotUpdate()
  }

  function stepForward() {
    if (currentStep.value < snapshots.value.length - 1) {
      currentStep.value++
      emitSnapshotUpdate()
    }
  }

  function stepBackward() {
    if (currentStep.value > 0) {
      currentStep.value--
      emitSnapshotUpdate()
    }
  }

  function seek(step: number) {
    currentStep.value = Math.max(0, Math.min(step, snapshots.value.length - 1))
    emitSnapshotUpdate()
  }

  function setSpeed(speed: number) {
    playbackSpeed.value = speed
    eventBus.emit('playback:speed-changed', speed)
    if (playbackState.value === 'playing') {
      startPlaybackTimer()
    }
  }

  function setParams(newParams: Partial<SimParams>) {
    params.value = { ...params.value, ...newParams }
    eventBus.emit('params:changed', params.value)
  }

  // --- Listen to event bus commands ---
  eventBus.on('playback:play', play)
  eventBus.on('playback:pause', pause)
  eventBus.on('playback:stop', stop)
  eventBus.on('playback:step-forward', stepForward)
  eventBus.on('playback:step-backward', stepBackward)
  eventBus.on('playback:seek', seek)

  return {
    // State
    snapshots,
    currentStep,
    playbackState,
    playbackSpeed,
    params,
    // Getters
    currentSnapshot,
    totalSteps,
    isPlaying,
    hasData,
    // Actions
    loadSnapshots,
    play,
    pause,
    stop,
    stepForward,
    stepBackward,
    seek,
    setSpeed,
    setParams,
  }
})
