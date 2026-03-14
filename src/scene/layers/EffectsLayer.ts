// --- Effects Layer ---
// Stress halos and atmospheric effects on precarious clusters
// Subtle emissive glow on stressed tiles
// Listens to: snapshot:updated, mode:changed, toggle:layer

import { Group, Color, PointLight } from 'three'
import type { Snapshot } from '../../types/simulation'
import type { VisualMode } from '../../types/visualization'
import { sphereGeometry } from '../utils/geometries'
import { PALETTE } from '../../types/visualization'
import {
  createInstancedMesh,
  setInstanceColor,
  markInstancesDirty,
  _dummy,
} from '../utils/instancing'
import { MeshBasicMaterial, type InstancedMesh } from 'three'
import eventBus from '../../events/eventBus'

export class EffectsLayer {
  readonly group = new Group()
  private haloMesh: InstancedMesh | null = null
  private maxCount = 0
  private currentMode: VisualMode = 'default'
  private stressLight: PointLight | null = null

  constructor() {
    this.group.name = 'EffectsLayer'
    this.bindEvents()

    // Ambient stress light (tints precarious zones)
    this.stressLight = new PointLight(PALETTE.stress, 0, 30)
    this.stressLight.position.set(0, 5, 0)
    this.group.add(this.stressLight)
  }

  private bindEvents() {
    eventBus.on('snapshot:updated', (snap) => this.update(snap))
    eventBus.on('mode:changed', (mode) => {
      this.currentMode = mode
    })
    eventBus.on('toggle:layer', ({ key, value }) => {
      if (key === 'stressOverlay') {
        this.group.visible = value
      }
    })
  }

  private ensureMesh(count: number) {
    if (this.haloMesh && this.maxCount >= count) return
    if (this.haloMesh) {
      this.group.remove(this.haloMesh)
      this.haloMesh.dispose()
    }
    this.maxCount = count
    const mat = new MeshBasicMaterial({
      color: PALETTE.stress,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    })
    this.haloMesh = createInstancedMesh(sphereGeometry, mat, count)
    this.haloMesh.name = 'stressHalos'
    this.group.add(this.haloMesh)
  }

  update(snapshot: Snapshot) {
    const { cells, gridWidth, gridHeight, metrics } = snapshot

    // Only show halos for stressed cells (stress > 0.3)
    const stressedCells = cells.filter(c => c.stress > 0.3)
    const count = stressedCells.length
    this.ensureMesh(Math.max(count, 1))
    if (!this.haloMesh) return

    this.haloMesh.count = count

    const offsetX = (gridWidth - 1) / 2
    const offsetZ = (gridHeight - 1) / 2
    const _col = new Color()
    const isStressMode = this.currentMode === 'stress'

    for (let i = 0; i < count; i++) {
      const cell = stressedCells[i]
      const worldX = cell.x - offsetX
      const worldZ = cell.y - offsetZ

      // Halo size scales with stress
      const haloScale = (isStressMode ? 3 : 1.5) + cell.stress * 3
      _dummy.position.set(worldX, 0.1, worldZ)
      _dummy.scale.set(haloScale, 0.5, haloScale)
      _dummy.rotation.set(0, 0, 0)
      _dummy.updateMatrix()
      this.haloMesh.setMatrixAt(i, _dummy.matrix)

      // Color: red-orange with intensity from stress
      _col.setHex(PALETTE.stress)
      _col.multiplyScalar(isStressMode ? 0.8 : 0.4)
      setInstanceColor(this.haloMesh, i, _col)
    }

    markInstancesDirty(this.haloMesh)

    // Update stress point light intensity based on global stress
    if (this.stressLight && metrics.stressIndex !== undefined) {
      this.stressLight.intensity = metrics.stressIndex * (isStressMode ? 3 : 1)
    }
  }

  dispose() {
    this.haloMesh?.dispose()
  }
}
