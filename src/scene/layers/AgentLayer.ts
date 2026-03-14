// --- Agent Layer ---
// Instanced capsules representing W/P/O agents
// Visual encoding: height, tilt, color per state and mode
// Listens to: snapshot:updated, mode:changed, toggle:layer

import { Group } from 'three'
import type { Snapshot, Cell } from '../../types/simulation'
import type { VisualMode } from '../../types/visualization'
import { capsuleGeometry } from '../utils/geometries'
import { agentMaterial, getAgentColorForMode } from '../materials/palettes'
import {
  createInstancedMesh,
  setInstanceColor,
  markInstancesDirty,
  _dummy,
} from '../utils/instancing'
import type { InstancedMesh } from 'three'
import eventBus from '../../events/eventBus'

export class AgentLayer {
  readonly group = new Group()
  private mesh: InstancedMesh | null = null
  private maxCount = 0
  private currentMode: VisualMode = 'default'

  constructor() {
    this.group.name = 'AgentLayer'
    this.bindEvents()
  }

  private bindEvents() {
    eventBus.on('snapshot:updated', (snap) => this.update(snap))
    eventBus.on('mode:changed', (mode) => {
      this.currentMode = mode
    })
    eventBus.on('toggle:layer', ({ key, value }) => {
      if (key === 'agents') {
        this.group.visible = value
      }
    })
  }

  private ensureMesh(count: number) {
    if (this.mesh && this.maxCount >= count) return
    if (this.mesh) {
      this.group.remove(this.mesh)
      this.mesh.dispose()
    }
    this.maxCount = count
    this.mesh = createInstancedMesh(capsuleGeometry, agentMaterial.clone(), count)
    this.mesh.name = 'agents'
    this.mesh.castShadow = true
    this.group.add(this.mesh)
  }

  /** Get agent Y position based on state and resource */
  private getAgentY(cell: Cell): number {
    const baseY = 0.2
    switch (cell.state) {
      case 'O': return baseY + 0.15 + cell.resource * 0.1 // Elevated
      case 'W': return baseY + cell.resource * 0.05        // Stable
      case 'P': return baseY - 0.05                         // Lower
    }
  }

  /** Get agent scale based on state */
  private getAgentScale(cell: Cell): [number, number, number] {
    switch (cell.state) {
      case 'O': return [1.1, 1.3, 1.1]   // Taller
      case 'W': return [1.0, 1.0, 1.0]   // Standard
      case 'P': return [0.9, 0.85, 0.9]  // Slightly smaller
    }
  }

  update(snapshot: Snapshot) {
    const { cells, gridWidth, gridHeight } = snapshot
    const count = cells.length
    this.ensureMesh(count)
    if (!this.mesh) return

    this.mesh.count = count

    const offsetX = (gridWidth - 1) / 2
    const offsetZ = (gridHeight - 1) / 2

    for (let i = 0; i < count; i++) {
      const cell = cells[i]
      const worldX = cell.x - offsetX
      const worldZ = cell.y - offsetZ
      const y = this.getAgentY(cell)
      const [sx, sy, sz] = this.getAgentScale(cell)

      _dummy.position.set(worldX, y, worldZ)
      _dummy.scale.set(sx, sy, sz)

      // Slight tilt for precarious agents
      if (cell.state === 'P') {
        _dummy.rotation.set(0, 0, Math.sin(cell.x * 3 + cell.y * 7) * 0.15)
      } else {
        _dummy.rotation.set(0, 0, 0)
      }

      _dummy.updateMatrix()
      this.mesh.setMatrixAt(i, _dummy.matrix)

      // Color per mode
      const color = getAgentColorForMode(cell.state, cell.resource, cell.stress, this.currentMode)
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
