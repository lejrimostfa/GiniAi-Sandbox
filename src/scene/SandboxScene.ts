// --- Sandbox Scene ---
// Main Three.js scene orchestrator
// Creates renderer, lights, layers, and manages the render loop
// Emits scene:ready, scene:frame, scene:resize events

import {
  Scene,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  Color,
  Clock,
  Raycaster,
  Vector2,
} from 'three'
import { PALETTE } from '../types/visualization'
import { CameraController } from './CameraController'
import { TileLayer } from './layers/TileLayer'
import { AgentLayer } from './layers/AgentLayer'
import { ResourceLayer } from './layers/ResourceLayer'
import { RedistributionLayer } from './layers/RedistributionLayer'
import { InfrastructureLayer } from './layers/InfrastructureLayer'
import { EffectsLayer } from './layers/EffectsLayer'
import eventBus from '../events/eventBus'
import type { Snapshot, Cell } from '../types/simulation'

export class SandboxScene {
  readonly scene: Scene
  readonly renderer: WebGLRenderer
  readonly cameraCtrl: CameraController

  // Layers
  readonly tileLayer: TileLayer
  readonly agentLayer: AgentLayer
  readonly resourceLayer: ResourceLayer
  readonly redistributionLayer: RedistributionLayer
  readonly infrastructureLayer: InfrastructureLayer
  readonly effectsLayer: EffectsLayer

  private clock = new Clock()
  private animationId: number | null = null
  private container: HTMLElement
  private raycaster = new Raycaster()
  private mouse = new Vector2()
  private currentSnapshot: Snapshot | null = null

  constructor(container: HTMLElement) {
    this.container = container
    const width = container.clientWidth
    const height = container.clientHeight

    // Scene setup
    this.scene = new Scene()
    this.scene.background = new Color(PALETTE.background)

    // Renderer
    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    container.appendChild(this.renderer.domElement)

    // Camera
    this.cameraCtrl = new CameraController(this.renderer.domElement, width, height)

    // Lights
    const ambientLight = new AmbientLight(0xCCCCDD, 0.6)
    this.scene.add(ambientLight)

    const dirLight = new DirectionalLight(0xFFFFEE, 0.8)
    dirLight.position.set(15, 25, 10)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.set(1024, 1024)
    dirLight.shadow.camera.near = 1
    dirLight.shadow.camera.far = 80
    dirLight.shadow.camera.left = -30
    dirLight.shadow.camera.right = 30
    dirLight.shadow.camera.top = 30
    dirLight.shadow.camera.bottom = -30
    this.scene.add(dirLight)

    const fillLight = new DirectionalLight(0x8899AA, 0.3)
    fillLight.position.set(-10, 15, -10)
    this.scene.add(fillLight)

    // Initialize layers
    this.tileLayer = new TileLayer()
    this.agentLayer = new AgentLayer()
    this.resourceLayer = new ResourceLayer()
    this.redistributionLayer = new RedistributionLayer()
    this.infrastructureLayer = new InfrastructureLayer()
    this.effectsLayer = new EffectsLayer()

    this.scene.add(this.tileLayer.group)
    this.scene.add(this.agentLayer.group)
    this.scene.add(this.resourceLayer.group)
    this.scene.add(this.redistributionLayer.group)
    this.scene.add(this.infrastructureLayer.group)
    this.scene.add(this.effectsLayer.group)

    // Event bindings
    this.bindEvents()

    // Mouse interaction
    this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this))
    this.renderer.domElement.addEventListener('click', this.onMouseClick.bind(this))

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(container)

    eventBus.emit('scene:ready', undefined)
  }

  private resizeObserver: ResizeObserver

  private bindEvents() {
    eventBus.on('snapshot:updated', (snap) => {
      this.currentSnapshot = snap
    })
  }

  /** Start the render loop */
  start() {
    if (this.animationId !== null) return
    this.clock.start()
    const loop = () => {
      this.animationId = requestAnimationFrame(loop)
      const dt = this.clock.getDelta()
      eventBus.emit('scene:frame', dt)
      this.cameraCtrl.update()
      this.renderer.render(this.scene, this.cameraCtrl.camera)
    }
    loop()
  }

  /** Stop the render loop */
  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  /** Handle container resize */
  private onResize() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (width === 0 || height === 0) return
    this.renderer.setSize(width, height)
    this.cameraCtrl.resize(width, height)
    eventBus.emit('scene:resize', { width, height })
  }

  /** Raycast to find hovered cell */
  private onMouseMove(event: MouseEvent) {
    if (!this.currentSnapshot) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    const cell = this.raycastCell()
    eventBus.emit('cell:hovered', cell)
  }

  /** Raycast to select cell */
  private onMouseClick(event: MouseEvent) {
    if (!this.currentSnapshot) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    const cell = this.raycastCell()
    if (cell) {
      eventBus.emit('cell:selected', cell)
    } else {
      eventBus.emit('cell:deselected', undefined)
    }
  }

  /** Find the cell under the mouse cursor via raycasting against tile positions */
  private raycastCell(): Cell | null {
    if (!this.currentSnapshot) return null
    this.raycaster.setFromCamera(this.mouse, this.cameraCtrl.camera)

    const { gridWidth, gridHeight, cells } = this.currentSnapshot
    const offsetX = (gridWidth - 1) / 2
    const offsetZ = (gridHeight - 1) / 2

    // Intersect with ground plane (y=0)
    const origin = this.raycaster.ray.origin
    const direction = this.raycaster.ray.direction
    if (direction.y >= 0) return null // Looking up

    const t = -origin.y / direction.y
    const hitX = origin.x + direction.x * t
    const hitZ = origin.z + direction.z * t

    // Convert to grid coordinates
    const gridX = Math.round(hitX + offsetX)
    const gridY = Math.round(hitZ + offsetZ)

    if (gridX < 0 || gridX >= gridWidth || gridY < 0 || gridY >= gridHeight) return null

    const idx = gridY * gridWidth + gridX
    return cells[idx] ?? null
  }

  /** Full cleanup */
  dispose() {
    this.stop()
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('mousemove', this.onMouseMove)
    this.renderer.domElement.removeEventListener('click', this.onMouseClick)
    this.tileLayer.dispose()
    this.agentLayer.dispose()
    this.resourceLayer.dispose()
    this.redistributionLayer.dispose()
    this.infrastructureLayer.dispose()
    this.effectsLayer.dispose()
    this.cameraCtrl.dispose()
    this.renderer.dispose()
    this.container.removeChild(this.renderer.domElement)
  }
}
