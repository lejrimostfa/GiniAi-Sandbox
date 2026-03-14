// --- Resource Layer ---
// Instanced pedestals (column height = structural resource)
// Instanced floating spheres (size = current buffer)
// Listens to: snapshot:updated, mode:changed, toggle:layer

import { Group, Color } from 'three'
import type { Snapshot } from '../../types/simulation'
import type { VisualMode } from '../../types/visualization'
import { pedestalGeometry, sphereGeometry } from '../utils/geometries'
import { pedestalMaterial, sphereMaterial } from '../materials/palettes'
import { STATE_COLORS, PALETTE } from '../../types/visualization'
import {
  createInstancedMesh,
  setInstanceColor,
  markInstancesDirty,
  _dummy,
} from '../utils/instancing'
import type { InstancedMesh } from 'three'
import eventBus from '../../events/eventBus'

export class ResourceLayer {
  readonly group = new Group()
  private pedestalMesh: InstancedMesh | null = null
  private sphereMesh: InstancedMesh | null = null
  private maxCount = 0
  private showSpheres = true
  private currentMode: VisualMode = 'default'

  constructor() {
    this.group.name = 'ResourceLayer'
    this.bindEvents()
  }

  private bindEvents() {
    eventBus.on('snapshot:updated', (snap) => this.update(snap))
    eventBus.on('mode:changed', (mode) => {
      this.currentMode = mode
    })
    eventBus.on('toggle:layer', ({ key, value }) => {
      if (key === 'resourceSpheres') {
        this.showSpheres = value
        if (this.sphereMesh) this.sphereMesh.visible = value
      }
    })
  }

  private ensureMeshes(count: number) {
    if (this.pedestalMesh && this.maxCount >= count) return

    if (this.pedestalMesh) {
      this.group.remove(this.pedestalMesh)
      this.pedestalMesh.dispose()
    }
    if (this.sphereMesh) {
      this.group.remove(this.sphereMesh)
      this.sphereMesh.dispose()
    }

    this.maxCount = count
    this.pedestalMesh = createInstancedMesh(pedestalGeometry, pedestalMaterial.clone(), count)
    this.pedestalMesh.name = 'pedestals'
    this.group.add(this.pedestalMesh)

    this.sphereMesh = createInstancedMesh(sphereGeometry, sphereMaterial.clone(), count)
    this.sphereMesh.name = 'spheres'
    this.sphereMesh.visible = this.showSpheres
    this.group.add(this.sphereMesh)
  }

  update(snapshot: Snapshot) {
    const { cells, gridWidth, gridHeight } = snapshot
    const count = cells.length
    this.ensureMeshes(count)
    if (!this.pedestalMesh || !this.sphereMesh) return

    this.pedestalMesh.count = count
    this.sphereMesh.count = count

    const offsetX = (gridWidth - 1) / 2
    const offsetZ = (gridHeight - 1) / 2
    const _col = new Color()

    const isResourceMode = this.currentMode === 'resource'
    const isCapitalMode = this.currentMode === 'capital'

    for (let i = 0; i < count; i++) {
      const cell = cells[i]
      const worldX = cell.x - offsetX
      const worldZ = cell.y - offsetZ

      // Pedestal: height encodes resource level
      const pedestalHeight = 0.05 + cell.resource * 0.4
      const pedestalY = pedestalHeight / 2

      _dummy.position.set(worldX, pedestalY, worldZ)
      _dummy.scale.set(1, pedestalHeight, 1)
      _dummy.rotation.set(0, 0, 0)
      _dummy.updateMatrix()
      this.pedestalMesh.setMatrixAt(i, _dummy.matrix)

      // Pedestal color: tinted by state, brighter in resource mode
      _col.setHex(STATE_COLORS[cell.state])
      _col.multiplyScalar(isResourceMode ? 0.6 + cell.resource * 0.4 : 0.4)
      setInstanceColor(this.pedestalMesh, i, _col)

      // Floating sphere: size encodes resource buffer
      const sphereScale = 0.3 + cell.resource * 1.2
      const sphereY = pedestalHeight + 0.15 + cell.resource * 0.15

      _dummy.position.set(worldX, sphereY, worldZ)
      _dummy.scale.set(sphereScale, sphereScale, sphereScale)
      _dummy.updateMatrix()
      this.sphereMesh.setMatrixAt(i, _dummy.matrix)

      // Sphere color: emissive hint of state color
      _col.setHex(STATE_COLORS[cell.state])
      if (isCapitalMode && cell.state === 'O') {
        _col.lerp(new Color(PALETTE.accent), 0.5)
      }
      _col.multiplyScalar(0.7 + cell.resource * 0.3)
      setInstanceColor(this.sphereMesh, i, _col)
    }

    markInstancesDirty(this.pedestalMesh)
    markInstancesDirty(this.sphereMesh)
  }

  dispose() {
    this.pedestalMesh?.dispose()
    this.sphereMesh?.dispose()
  }
}
