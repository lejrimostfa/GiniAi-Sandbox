// --- Camera Controller ---
// Semi-isometric camera with orbit, zoom, pan controls
// Listens to: camera:reset, camera:zoom-to

import {
  PerspectiveCamera,
  Vector3,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import eventBus from '../events/eventBus'

/** Default camera settings for isometric-like sandbox view */
const DEFAULTS = {
  position: new Vector3(20, 25, 20),
  target: new Vector3(0, 0, 0),
  fov: 40,
  near: 0.1,
  far: 200,
  minDistance: 5,
  maxDistance: 80,
  minPolarAngle: 0.3,        // ~17° from top
  maxPolarAngle: Math.PI / 2.5, // ~72° from top
}

export class CameraController {
  readonly camera: PerspectiveCamera
  readonly controls: OrbitControls

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.camera = new PerspectiveCamera(
      DEFAULTS.fov,
      width / height,
      DEFAULTS.near,
      DEFAULTS.far
    )
    this.camera.position.copy(DEFAULTS.position)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.target.copy(DEFAULTS.target)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = DEFAULTS.minDistance
    this.controls.maxDistance = DEFAULTS.maxDistance
    this.controls.minPolarAngle = DEFAULTS.minPolarAngle
    this.controls.maxPolarAngle = DEFAULTS.maxPolarAngle
    this.controls.enablePan = true
    this.controls.panSpeed = 0.8
    this.controls.rotateSpeed = 0.5
    this.controls.zoomSpeed = 1.2
    this.controls.update()

    this.bindEvents()
  }

  private bindEvents() {
    eventBus.on('camera:reset', () => this.reset())
    eventBus.on('camera:zoom-to', ({ x, y }) => this.zoomTo(x, y))
  }

  /** Reset camera to default position */
  reset() {
    this.camera.position.copy(DEFAULTS.position)
    this.controls.target.copy(DEFAULTS.target)
    this.controls.update()
  }

  /** Smoothly zoom toward a grid coordinate */
  zoomTo(gridX: number, gridZ: number) {
    this.controls.target.set(gridX, 0, gridZ)
    this.camera.position.set(gridX + 8, 12, gridZ + 8)
    this.controls.update()
  }

  /** Update on each frame */
  update() {
    this.controls.update()
  }

  /** Resize handler */
  resize(width: number, height: number) {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.controls.dispose()
  }
}
