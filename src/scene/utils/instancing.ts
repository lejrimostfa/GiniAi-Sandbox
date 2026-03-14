// --- Instancing Helpers ---
// Utilities for efficient instanced mesh updates

import {
  InstancedMesh,
  Matrix4,
  Color,
  Object3D,
  type BufferGeometry,
  type Material,
} from 'three'

const _dummy = new Object3D()
const _color = new Color()
const _matrix = new Matrix4()

/** Create an instanced mesh with a given capacity */
export function createInstancedMesh(
  geometry: BufferGeometry,
  material: Material,
  count: number
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, count)
  mesh.instanceMatrix.setUsage(35048) // DynamicDrawUsage
  if (mesh.instanceColor) {
    mesh.instanceColor.setUsage(35048)
  }
  mesh.count = 0 // Start with 0 visible instances
  mesh.frustumCulled = false // We manage visibility ourselves
  return mesh
}

/** Set transform for one instance */
export function setInstanceTransform(
  mesh: InstancedMesh,
  index: number,
  x: number,
  y: number,
  z: number,
  scaleX: number = 1,
  scaleY: number = 1,
  scaleZ: number = 1
) {
  _dummy.position.set(x, y, z)
  _dummy.scale.set(scaleX, scaleY, scaleZ)
  _dummy.updateMatrix()
  mesh.setMatrixAt(index, _dummy.matrix)
}

/** Set color for one instance */
export function setInstanceColor(
  mesh: InstancedMesh,
  index: number,
  color: number | Color
) {
  if (typeof color === 'number') {
    _color.setHex(color)
  } else {
    _color.copy(color)
  }
  mesh.setColorAt(index, _color)
}

/** Mark instance matrices and colors as needing GPU update */
export function markInstancesDirty(mesh: InstancedMesh) {
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true
  }
}

export { _dummy, _color, _matrix }
