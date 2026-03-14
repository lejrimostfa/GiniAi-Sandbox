// --- Redistribution Layer ---
// Instanced glowing rings at the base of agents receiving redistribution
// Pulse effect encodes redistribution intensity
// Listens to: snapshot:updated, mode:changed, toggle:layer

import { Group, Color } from 'three'
import type { Snapshot } from '../../types/simulation'
import type { VisualMode } from '../../types/visualization'
import { ringGeometry } from '../utils/geometries'
import { ringMaterial } from '../materials/palettes'
import { PALETTE } from '../../types/visualization'
import {
  createInstancedMesh,
  setInstanceColor,
  markInstancesDirty,
  _dummy,
} from '../utils/instancing'
import type { InstancedMesh } from 'three'
import eventBus from '../../events/eventBus'

export class RedistributionLayer {
  readonly group = new Group()
  private mesh: InstancedMesh | null = null
  private maxCount = 0
  private currentMode: VisualMode = 'default'
  private elapsed = 0

  constructor() {
    this.group.name = 'RedistributionLayer'
    this.bindEvents()
  }

  private bindEvents() {
    eventBus.on('snapshot:updated', (snap) => this.update(snap))
    eventBus.on('mode:changed', (mode) => {
      this.currentMode = mode
    })
    eventBus.on('toggle:layer', ({ key, value }) => {
      if (key === 'redistributionRings') {
        this.group.visible = value
      }
    })
    // Animate pulse via frame event
    eventBus.on('scene:frame', (dt) => {
      this.elapsed += dt
    })
  }

  private ensureMesh(count: number) {
    if (this.mesh && this.maxCount >= count) return
    if (this.mesh) {
      this.group.remove(this.mesh)
      this.mesh.dispose()
    }
    this.maxCount = count
    this.mesh = createInstancedMesh(ringGeometry, ringMaterial.clone(), count)
    this.mesh.name = 'redistributionRings'
    this.group.add(this.mesh)
  }

  update(snapshot: Snapshot) {
    const { cells, gridWidth, gridHeight } = snapshot
    // Only show rings for cells with redistribution > 0
    const redistCells = cells.filter(c => c.redistribution > 0.01)
    const count = redistCells.length
    this.ensureMesh(Math.max(count, 1))
    if (!this.mesh) return

    this.mesh.count = count

    const offsetX = (gridWidth - 1) / 2
    const offsetZ = (gridHeight - 1) / 2
    const _col = new Color()
    const isRedistMode = this.currentMode === 'redistribution'

    for (let i = 0; i < count; i++) {
      const cell = redistCells[i]
      const worldX = cell.x - offsetX
      const worldZ = cell.y - offsetZ

      // Pulse scale based on time and redistribution intensity
      const pulse = 1 + Math.sin(this.elapsed * 3 + cell.x + cell.y) * 0.1 * cell.redistribution
      const scale = (0.8 + cell.redistribution * 0.5) * pulse

      _dummy.position.set(worldX, 0.02, worldZ)
      _dummy.scale.set(scale, scale, scale)
      _dummy.rotation.set(0, 0, 0)
      _dummy.updateMatrix()
      this.mesh.setMatrixAt(i, _dummy.matrix)

      // Color: brighter in redistribution mode
      _col.setHex(PALETTE.redistribution)
      const intensity = isRedistMode ? 0.7 + cell.redistribution * 0.3 : 0.4 + cell.redistribution * 0.3
      _col.multiplyScalar(intensity)
      setInstanceColor(this.mesh, i, _col)
    }

    markInstancesDirty(this.mesh)
  }

  dispose() {
    this.mesh?.dispose()
  }
}
