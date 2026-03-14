// --- Reusable Geometries ---
// Shared geometry instances to minimize GPU memory usage

import {
  BoxGeometry,
  CapsuleGeometry,
  SphereGeometry,
  CylinderGeometry,
  RingGeometry,
  PlaneGeometry,
} from 'three'

// Tile ground plane (1x1 unit, flat)
export const tileGeometry = new PlaneGeometry(0.92, 0.92)
tileGeometry.rotateX(-Math.PI / 2)

// Agent capsule (low-poly)
export const capsuleGeometry = new CapsuleGeometry(0.12, 0.25, 4, 8)

// Resource pedestal (cylinder)
export const pedestalGeometry = new CylinderGeometry(0.06, 0.08, 1, 6)

// Resource floating sphere
export const sphereGeometry = new SphereGeometry(0.08, 8, 6)

// Redistribution ring
export const ringGeometry = new RingGeometry(0.25, 0.35, 16)
ringGeometry.rotateX(-Math.PI / 2)

// Infrastructure pieces (kitbash elements for owners)
export const cubeGeometry = new BoxGeometry(0.15, 0.3, 0.15)
export const monolithGeometry = new BoxGeometry(0.08, 0.5, 0.08)
export const pylonGeometry = new CylinderGeometry(0.03, 0.06, 0.4, 4)
export const machineBlockGeometry = new BoxGeometry(0.2, 0.15, 0.2)
