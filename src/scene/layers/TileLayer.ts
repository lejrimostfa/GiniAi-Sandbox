// --- Tile Layer ---
// Instanced ground tiles that encode stress via color
// Listens to: snapshot:updated, mode:changed, toggle:layer

import { Group } from 'three'
import type { Snapshot } from '../../types/simulation'
import type { VisualMode } from '../../types/visualization'
import { tileGeometry } from '../utils/geometries'
import { tileMaterial, getTileColor } from '../materials/palettes'
import {
  createInstancedMesh,
  setInstanceTransform,
  setInstanceColor,
  markInstancesDirty,
} from '../utils/instancing'
import type { InstancedMesh } from 'three'
import eventBus from '../../events/eventBus'

export class TileLayer {
  readonly group = new Group()
  private mesh: InstancedMesh | null = null
  private maxCount = 0
  private currentMode: VisualMode = 'default'

  constructor() {
    this.group.name = 'TileLayer'
    this.bindEvents()
  }

  /** Connect to event bus */
  private bindEvents() {
    eventBus.on('snapshot:updated', (snap) => this.update(snap))
    eventBus.on('mode:changed', (mode) => {
      this.currentMode = mode
    })
    eventBus.on('toggle:layer', ({ key, value }) => {
      if (key === 'tiles') {
        this.group.visible = value
      }
    })
  }

  /** Initialize or resize the instanced mesh */
  private ensureMesh(count: number) {
    if (this.mesh && this.maxCount >= count) return
    // Remove old mesh
    if (this.mesh) {
      this.group.remove(this.mesh)
      this.mesh.dispose()
    }
    this.maxCount = count
    this.mesh = createInstancedMesh(tileGeometry, tileMaterial.clone(), count)
    this.mesh.name = 'tiles'
    this.mesh.receiveShadow = true
    this.group.add(this.mesh)
  }

  /** Update tiles from snapshot data */
  update(snapshot: Snapshot) {
    const { cells, gridWidth, gridHeight } = snapshot
    const count = cells.length
    this.ensureMesh(count)
    if (!this.mesh) return

    this.mesh.count = count

    // Center offset so grid is centered at origin
    const offsetX = (gridWidth - 1) / 2
    const offsetZ = (gridHeight - 1) / 2

    for (let i = 0; i < count; i++) {
      const cell = cells[i]
      const worldX = cell.x - offsetX
      const worldZ = cell.y - offsetZ

      // Slight Y depression for stressed tiles
      const yOffset = this.currentMode === 'stress' ? -cell.stress * 0.05 : 0

      setInstanceTransform(this.mesh, i, worldX, yOffset, worldZ)

      // Color based on stress and mode
      const stressFactor = this.currentMode === 'stress' ? cell.stress : cell.stress * 0.5
      const color = getTileColor(stressFactor)
      setInstanceColor(this.mesh, i, color)
    }

    markInstancesDirty(this.mesh)
  }

  dispose() {
    if (this.mesh) {
      this.mesh.dispose()
    }
  }
}
