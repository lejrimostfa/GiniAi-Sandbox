// --- Material Palettes ---
// Shared materials for all scene layers to minimize draw calls

import { MeshStandardMaterial, MeshBasicMaterial, Color } from 'three'
import { STATE_COLORS, PALETTE } from '../../types/visualization'
import type { CellState } from '../../types/simulation'
import type { VisualMode } from '../../types/visualization'

// --- Base materials (shared across instances) ---

export const tileMaterial = new MeshStandardMaterial({
  color: PALETTE.ground,
  roughness: 0.9,
  metalness: 0.1,
  flatShading: true,
})

export const agentMaterial = new MeshStandardMaterial({
  roughness: 0.6,
  metalness: 0.2,
  flatShading: true,
})

export const pedestalMaterial = new MeshStandardMaterial({
  color: 0x888899,
  roughness: 0.7,
  metalness: 0.3,
  flatShading: true,
})

export const sphereMaterial = new MeshStandardMaterial({
  color: 0xAABBCC,
  roughness: 0.4,
  metalness: 0.1,
  emissive: 0x223344,
  emissiveIntensity: 0.3,
  flatShading: true,
})

export const ringMaterial = new MeshBasicMaterial({
  color: PALETTE.redistribution,
  transparent: true,
  opacity: 0.6,
})

export const infrastructureMaterial = new MeshStandardMaterial({
  color: 0x555566,
  roughness: 0.8,
  metalness: 0.4,
  flatShading: true,
})

// --- Color utility functions ---

const _col = new Color()

/** Get the base color for an agent state */
export function getStateColor(state: CellState): number {
  return STATE_COLORS[state]
}

/** Get tile ground color based on stress level */
export function getTileColor(stress: number): Color {
  const base = new Color(PALETTE.ground)
  const hot = new Color(PALETTE.groundStress)
  return base.lerp(hot, Math.min(stress, 1))
}

/** Get agent color adjusted by visual mode */
export function getAgentColorForMode(
  state: CellState,
  resource: number,
  stress: number,
  mode: VisualMode
): Color {
  _col.setHex(STATE_COLORS[state])

  switch (mode) {
    case 'state':
      // Pure state colors, slightly saturated
      return _col.clone()

    case 'resource':
      // Brightness encodes resource level
      _col.setHex(STATE_COLORS[state])
      _col.multiplyScalar(0.4 + resource * 0.6)
      return _col.clone()

    case 'stress':
      // Lerp toward stress red
      _col.lerp(new Color(PALETTE.stress), stress * 0.7)
      return _col.clone()

    case 'redistribution':
      // Dim non-redistributed agents
      return _col.clone()

    case 'capital':
      // Owners brighter, others dimmed
      if (state === 'O') {
        _col.multiplyScalar(1.2)
      } else {
        _col.multiplyScalar(0.4)
      }
      return _col.clone()

    case 'regime':
      // Combined emphasis: stress + resource
      const regimeIntensity = stress * 0.5 + (1 - resource) * 0.3
      _col.lerp(new Color(PALETTE.stress), regimeIntensity)
      return _col.clone()

    case 'default':
    default:
      return _col.clone()
  }
}
