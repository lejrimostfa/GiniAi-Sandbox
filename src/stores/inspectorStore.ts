// --- Inspector Store ---
// Manages hovered and selected cell state
// Listens to raycasting events from the Scene

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Cell } from '../types/simulation'
import eventBus from '../events/eventBus'

export const useInspectorStore = defineStore('inspector', () => {
  // --- State ---
  const hoveredCell = ref<Cell | null>(null)
  const selectedCell = ref<Cell | null>(null)

  // --- Actions ---
  function setHovered(cell: Cell | null) {
    hoveredCell.value = cell
    eventBus.emit('cell:hovered', cell)
  }

  function setSelected(cell: Cell | null) {
    selectedCell.value = cell
    eventBus.emit('cell:selected', cell)
  }

  function deselect() {
    selectedCell.value = null
    eventBus.emit('cell:deselected', undefined)
  }

  // --- Listen to scene raycasting events ---
  eventBus.on('cell:hovered', (cell) => {
    if (hoveredCell.value !== cell) {
      hoveredCell.value = cell
    }
  })

  eventBus.on('cell:selected', (cell) => {
    if (selectedCell.value !== cell) {
      selectedCell.value = cell
    }
  })

  eventBus.on('cell:deselected', () => {
    selectedCell.value = null
  })

  return {
    hoveredCell,
    selectedCell,
    setHovered,
    setSelected,
    deselect,
  }
})
