// --- UI Store ---
// Manages visual mode, display toggles, and panel visibility
// Emits events on mode/toggle changes for Scene consumption

import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import type { VisualMode, DisplayToggles } from '../types/visualization'
import { DEFAULT_DISPLAY_TOGGLES } from '../types/visualization'
import eventBus from '../events/eventBus'

export const useUiStore = defineStore('ui', () => {
  // --- State ---
  const visualMode = ref<VisualMode>('default')
  const displayToggles = reactive<DisplayToggles>({ ...DEFAULT_DISPLAY_TOGGLES })
  const showMetricsPanel = ref(true)
  const showInspectorPanel = ref(true)
  const showLegendPanel = ref(true)
  const showControlPanel = ref(true)

  // --- Actions ---
  function setVisualMode(mode: VisualMode) {
    visualMode.value = mode
    eventBus.emit('mode:changed', mode)
  }

  function toggleLayer(key: keyof DisplayToggles) {
    displayToggles[key] = !displayToggles[key]
    eventBus.emit('toggle:layer', { key, value: displayToggles[key] })
  }

  function setToggle(key: keyof DisplayToggles, value: boolean) {
    displayToggles[key] = value
    eventBus.emit('toggle:layer', { key, value })
  }

  function togglePanel(panel: 'metrics' | 'inspector' | 'legend' | 'control') {
    switch (panel) {
      case 'metrics': showMetricsPanel.value = !showMetricsPanel.value; break
      case 'inspector': showInspectorPanel.value = !showInspectorPanel.value; break
      case 'legend': showLegendPanel.value = !showLegendPanel.value; break
      case 'control': showControlPanel.value = !showControlPanel.value; break
    }
  }

  // --- Listen for keyboard-driven mode changes ---
  eventBus.on('mode:changed', (mode) => {
    if (visualMode.value !== mode) {
      visualMode.value = mode
    }
  })

  return {
    visualMode,
    displayToggles,
    showMetricsPanel,
    showInspectorPanel,
    showLegendPanel,
    showControlPanel,
    setVisualMode,
    toggleLayer,
    setToggle,
    togglePanel,
  }
})
