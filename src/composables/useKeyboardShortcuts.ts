// --- Keyboard Shortcuts ---
// Global keyboard bindings for playback and mode switching
// Space: play/pause, Arrow keys: step, 1-7: visual modes, R: reset camera, L: legend

import { onMounted, onBeforeUnmount } from 'vue'
import { useSimulationStore } from '../stores/simulationStore'
import { useUiStore } from '../stores/uiStore'
import type { VisualMode } from '../types/visualization'
import eventBus from '../events/eventBus'

const MODE_KEYS: Record<string, VisualMode> = {
  '1': 'default',
  '2': 'state',
  '3': 'resource',
  '4': 'stress',
  '5': 'redistribution',
  '6': 'capital',
  '7': 'regime',
}

export function useKeyboardShortcuts() {
  const sim = useSimulationStore()
  const ui = useUiStore()

  function onKeyDown(e: KeyboardEvent) {
    // Ignore if typing in an input
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    switch (e.code) {
      case 'Space':
        e.preventDefault()
        if (sim.isPlaying) sim.pause()
        else sim.play()
        break

      case 'ArrowRight':
        e.preventDefault()
        sim.stepForward()
        break

      case 'ArrowLeft':
        e.preventDefault()
        sim.stepBackward()
        break

      case 'KeyR':
        eventBus.emit('camera:reset', undefined)
        break

      case 'KeyL':
        ui.togglePanel('legend')
        break

      default:
        // Number keys 1-7 for visual modes
        if (MODE_KEYS[e.key]) {
          ui.setVisualMode(MODE_KEYS[e.key])
        }
        break
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
  })
}
