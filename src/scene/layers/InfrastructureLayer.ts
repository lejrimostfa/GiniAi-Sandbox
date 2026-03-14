// --- Infrastructure Layer ---
// Kitbashed geometric structures near Owner cells
// Density and height scale with owner local density and resource
// Listens to: snapshot:updated, mode:changed, toggle:layer

import { Group, Color } from 'three'
import type { Snapshot, Cell } from '../../types/simulation'
import type { VisualMode } from '../../types/visualization'
import { cubeGeometry, monolithGeometry, pylonGeometry, machineBlockGeometry } from '../utils/geometries'
import { infrastructureMaterial } from '../materials/palettes'
import {
  createInstancedMesh,
  setInstanceColor,
  markInstancesDirty,
  _dummy,
} from '../utils/instancing'
import type { InstancedMesh, BufferGeometry } from 'three'
import eventBus from '../../events/eventBus'

/** Infrastructure piece types for visual variety */
const PIECE_GEOMETRIES: BufferGeometry[] = [
  cubeGeometry,
  monolithGeometry,
  pylonGeometry,
  machineBlockGeometry,
]

export class InfrastructureLayer {
  readonly group = new Group()
  private meshes: InstancedMesh[] = []
  private maxCount = 0
  private currentMode: VisualMode = 'default'

  constructor() {
    this.group.name = 'InfrastructureLayer'
    this.bindEvents()
  }

  private bindEvents() {
    eventBus.on('snapshot:updated', (snap) => this.update(snap))
    eventBus.on('mode:changed', (mode) => {
      this.currentMode = mode
    })
    eventBus.on('toggle:layer', ({ key, value }) => {
      if (key === 'infrastructure') {
        this.group.visible = value
      }
    })
  }

  private ensureMeshes(count: number) {
    if (this.meshes.length > 0 && this.maxCount >= count) return

    // Dispose old
    for (const m of this.meshes) {
      this.group.remove(m)
      m.dispose()
    }
    this.meshes = []
    this.maxCount = count

    // One instanced mesh per piece type
    for (const geo of PIECE_GEOMETRIES) {
      const mesh = createInstancedMesh(geo, infrastructureMaterial.clone(), count)
      mesh.name = 'infrastructure'
      mesh.castShadow = true
      this.group.add(mesh)
      this.meshes.push(mesh)
    }
  }

  /** Deterministic piece selection based on cell position */
  private getPieceIndex(cell: Cell): number {
    return (cell.x * 7 + cell.y * 13) % PIECE_GEOMETRIES.length
  }

  update(snapshot: Snapshot) {
    const { cells, gridWidth, gridHeight } = snapshot
    // Only owner cells get infrastructure
    const ownerCells = cells.filter(c => c.state === 'O')
    const count = ownerCells.length
    this.ensureMeshes(Math.max(count, 1))

    const offsetX = (gridWidth - 1) / 2
    const offsetZ = (gridHeight - 1) / 2
    const _col = new Color()
    const isCapitalMode = this.currentMode === 'capital'

    // Count per piece type
    const counts = new Array(PIECE_GEOMETRIES.length).fill(0)

    for (let i = 0; i < count; i++) {
      const cell = ownerCells[i]
      const pieceIdx = this.getPieceIndex(cell)
      const instanceIdx = counts[pieceIdx]
      counts[pieceIdx]++

      const worldX = cell.x - offsetX
      const worldZ = cell.y - offsetZ
      const density = cell.ownerLocalDensity ?? 0.3

      // Infrastructure height scales with density and resource
      const heightScale = 0.5 + density * 1.5 + cell.resource * 0.5
      // Offset from center of tile
      const offsetDx = ((cell.x * 3 + cell.y * 5) % 5 - 2) * 0.08
      const offsetDz = ((cell.x * 7 + cell.y * 2) % 5 - 2) * 0.08

      _dummy.position.set(
        worldX + 0.25 + offsetDx,
        heightScale * 0.15,
        worldZ + 0.25 + offsetDz
      )
      _dummy.scale.set(0.8 + density * 0.4, heightScale, 0.8 + density * 0.4)
      _dummy.rotation.set(0, (cell.x + cell.y) * 0.5, 0)
      _dummy.updateMatrix()

      const mesh = this.meshes[pieceIdx]
      mesh.setMatrixAt(instanceIdx, _dummy.matrix)

      // Color: darker anthracite, brighter in capital mode
      _col.setHex(0x3D405B)
      if (isCapitalMode) {
        _col.lerp(new Color(0x667799), density)
      }
      _col.multiplyScalar(0.6 + cell.resource * 0.4)
      setInstanceColor(mesh, instanceIdx, _col)
    }

    // Set counts and mark dirty
    for (let p = 0; p < PIECE_GEOMETRIES.length; p++) {
      this.meshes[p].count = counts[p]
      markInstancesDirty(this.meshes[p])
    }
  }

  dispose() {
    for (const m of this.meshes) m.dispose()
  }
}
