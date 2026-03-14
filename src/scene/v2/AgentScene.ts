// --- Agent Scene (v2) ---
// Primer-style Three.js scene: agents as emoji sprites, locations as emoji sprites
// Smooth camera, click-to-follow, trails, sprite-based rendering
// Connected to SimulationEngine via event bus

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Agent, Location, WorldState, AgentAction, AgentState, MoneyEvent, Gender, HeatmapMode } from '../../simulation/types'
import eventBus from '../../events/eventBus'

// ============================================================
// Agent emoji: combines state + action into a single person emoji
// ============================================================

function agentEmoji(state: AgentState, action: AgentAction, gender: Gender): string {
  const isFemale = gender === 'female'
  // Dead agent — temporary ☠️
  if (state === 'dead') return '☠️'
  // Child (going to school)
  if (state === 'child') return isFemale ? '👧' : '👦'
  // Criminal
  if (state === 'criminal') return '🥷'
  // Retired
  if (state === 'retired') return isFemale ? '👵' : '👴'
  // Business owner
  if (state === 'business_owner') return isFemale ? '👩‍💼' : '👨‍💼'
  // Action-based for employed / unemployed
  switch (action) {
    case 'working':     return isFemale ? '🏃‍♀️' : '🏃'
    case 'shopping':    return '🛒'
    case 'job_seeking': return isFemale ? '�' : '�'
    case 'studying':    return '📚'
    case 'commuting':   return isFemale ? '🚶‍♀️' : '🚶'
    case 'hauling':     return '📦'
    case 'resting':     return isFemale ? '🧎‍♀️' : '🧎'
    case 'stealing':    return '🥷'
    case 'dying':       return '☠️'
    case 'idle':
    default:
      return state === 'unemployed'
        ? (isFemale ? '🧍‍♀️' : '🧍')
        : (isFemale ? '👩' : '👤')
  }
}

// ============================================================
// Color constants
// ============================================================
const COLORS = {
  background: 0x1A1A2E,
  ground: 0x22223A,
  groundGrid: 0x2A2A4A,
  // Agent states
  employed: new THREE.Color(0x5B8FB9),     // blue
  unemployed: new THREE.Color(0xE07A5F),   // orange
  business_owner: new THREE.Color(0x9B72AA), // purple
  retired: new THREE.Color(0x707080),       // grey
  criminal: new THREE.Color(0xCC3333),     // red
  dead: new THREE.Color(0x444444),         // dark grey
  child: new THREE.Color(0x81C784),       // soft green
  // Location types
  workplace_manual: new THREE.Color(0x8899AA),
  workplace_skilled: new THREE.Color(0x5B8FB9),
  workplace_creative: new THREE.Color(0x9B72AA),
  workplace_service: new THREE.Color(0x81B29A),
  market: new THREE.Color(0xE07A5F),
  home: new THREE.Color(0x404060),
  school: new THREE.Color(0x81B29A),
  government: new THREE.Color(0xD4A574),
  resource: new THREE.Color(0x4A7C59),
  factory: new THREE.Color(0x8B7355),
}

// ============================================================
// Scene class
// ============================================================
export class AgentScene {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private controls!: OrbitControls
  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2()
  private container: HTMLElement

  // Agent emoji sprites (one per agent, keyed by agent ID)
  private agentSpriteGroup = new THREE.Group()
  private agentSprites: Map<string, THREE.Sprite> = new Map()
  private agentEmojiCache: Map<string, THREE.Texture> = new Map()
  private maxAgents = 600

  // Location meshes (group of individual meshes for different shapes)
  private locationGroup = new THREE.Group()
  private locationMeshes: Map<string, THREE.Mesh> = new Map()

  // Trail lines
  private trailGroup = new THREE.Group()
  private trailLines: Map<string, THREE.Line> = new Map()
  private showTrails = true

  // Money floater sprites
  private moneyGroup = new THREE.Group()
  private moneyFloaters: { sprite: THREE.Sprite; startY: number; life: number; maxLife: number }[] = []

  // Baby sprites at home locations (keyed by homeId)
  private babyGroup = new THREE.Group()
  private babySprites: Map<string, THREE.Sprite[]> = new Map()

  // Full-world interpolated heatmap (DataTexture on a ground plane)
  private heatmapMode: HeatmapMode = 'none'
  private heatmapMesh: THREE.Mesh | null = null
  private heatmapTexture: THREE.DataTexture | null = null
  private heatmapData: Uint8Array | null = null // RGBA pixel buffer
  private readonly HEATMAP_RES = 128 // grid resolution (128×128)
  private readonly HEATMAP_WORLD_SIZE = 200 // world units covered (-100 to +100)
  private readonly HEATMAP_RADIUS = 25 // influence radius per agent (world units)

  // Ground
  private groundMesh!: THREE.Mesh

  // State
  private currentState: WorldState | null = null
  private selectedAgentId: string | null = null
  private hoveredAgentId: string | null = null
  private followingAgent = false
  private animationId = 0
  private disposed = false

  // Smooth interpolation: linear lerp between prevPos→targetPos over tick interval
  // Each agent i: ...Pos[i*3]=x, ...Pos[i*3+1]=y(height), ...Pos[i*3+2]=z
  private prevPos: Float32Array = new Float32Array(0)    // position at start of current tick
  private targetPos: Float32Array = new Float32Array(0)   // position at end of current tick
  private renderPos: Float32Array = new Float32Array(0)   // current visual position (interpolated)
  private prevScales: Float32Array = new Float32Array(0)
  private targetScales: Float32Array = new Float32Array(0)
  private renderScales: Float32Array = new Float32Array(0)
  private agentCount = 0
  // Tick timing for smooth interpolation
  private lastTickTime = 0           // performance.now() when last update() was called
  private tickIntervalMs = 200       // estimated ms between ticks (auto-calibrated)
  // Map agent ID → last known buffer index (for stable interpolation across population changes)
  private agentIdToIndex: Map<string, number> = new Map()

  constructor(container: HTMLElement) {
    this.container = container
    this.initRenderer()
    this.initScene()
    this.initCamera()
    this.initLights()
    this.initGround()
    this.scene.add(this.agentSpriteGroup)
    this.scene.add(this.moneyGroup)
    this.scene.add(this.babyGroup)
    this.initHeatmapLayer()
    this.initEventListeners()
    this.startRenderLoop()
  }

  // ============================================================
  // Initialization
  // ============================================================
  private initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    this.renderer.shadowMap.enabled = false
    this.renderer.setClearColor(COLORS.background)
    this.container.appendChild(this.renderer.domElement)
  }

  private initScene(): void {
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(COLORS.background, 0.004)
    this.scene.add(this.locationGroup)
    this.scene.add(this.trailGroup)
  }

  private initCamera(): void {
    const aspect = this.container.clientWidth / this.container.clientHeight
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 500)
    this.camera.position.set(0, 80, 60)
    this.camera.lookAt(0, 0, 0)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI / 2.2
    this.controls.minDistance = 10
    this.controls.maxDistance = 200
    this.controls.target.set(0, 0, 0)
  }

  private initLights(): void {
    const ambient = new THREE.AmbientLight(0x404060, 1.5)
    this.scene.add(ambient)

    const dir = new THREE.DirectionalLight(0xFFEEDD, 1.2)
    dir.position.set(30, 50, 20)
    this.scene.add(dir)

    const fill = new THREE.DirectionalLight(0x6688AA, 0.4)
    fill.position.set(-20, 30, -10)
    this.scene.add(fill)
  }

  private initGround(): void {
    // Large ground plane
    const geo = new THREE.CircleGeometry(150, 64)
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.ground,
      roughness: 0.9,
      metalness: 0,
    })
    this.groundMesh = new THREE.Mesh(geo, mat)
    this.groundMesh.rotation.x = -Math.PI / 2
    this.groundMesh.position.y = -0.1
    this.groundMesh.receiveShadow = true
    this.scene.add(this.groundMesh)

    // Grid helper for spatial reference
    const grid = new THREE.GridHelper(200, 40, COLORS.groundGrid, COLORS.groundGrid)
    ;(grid.material as THREE.Material).opacity = 0.15
    ;(grid.material as THREE.Material).transparent = true
    grid.position.y = 0
    this.scene.add(grid)
  }

  // ============================================================
  // Event listeners
  // ============================================================
  private initEventListeners(): void {
    // Resize
    const onResize = () => {
      const w = this.container.clientWidth
      const h = this.container.clientHeight
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    // Mouse
    this.renderer.domElement.addEventListener('click', (e) => this.onClick(e))
    this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e))

    // Event bus
    eventBus.on('camera:reset', () => {
      this.followingAgent = false
      this.selectedAgentId = null
      this.camera.position.set(0, 80, 60)
      this.controls.target.set(0, 0, 0)
    })

    // Heatmap mode toggle
    eventBus.on('heatmap:mode', (mode) => {
      this.setHeatmapMode(mode as HeatmapMode)
    })
  }

  // ============================================================
  // Update from simulation state
  // ============================================================
  update(state: WorldState): void {
    this.currentState = state
    this.updateLocations(state.locations)
    this.updateAgents(state.agents)
    this.updateHeatmap(state.agents, state.locations)
    this.updateBabies(state.agents, state.locations)
    if (this.showTrails) this.updateTrails(state.agents)
    this.spawnMoneyFloaters(state.moneyEvents ?? [])
  }

  // ============================================================
  // Update location meshes
  // ============================================================
  private updateLocations(locations: Location[]): void {
    // Add new locations, update existing
    const seen = new Set<string>()
    for (const loc of locations) {
      seen.add(loc.id)
      if (!this.locationMeshes.has(loc.id)) {
        this.createLocationMesh(loc)
      }
    }
    // Remove old locations (hit mesh + associated sprite)
    for (const [id, mesh] of this.locationMeshes) {
      if (!seen.has(id)) {
        // Remove the emoji sprite
        const sprite = mesh.userData._sprite as THREE.Sprite | undefined
        if (sprite) {
          this.locationGroup.remove(sprite)
          ;(sprite.material as THREE.Material).dispose()
        }
        this.locationGroup.remove(mesh)
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
        this.locationMeshes.delete(id)
      }
    }
  }

  // ============================================================
  // Update baby sprites at home locations
  // Counts children per home, renders 👶 emojis at those homes
  // ============================================================
  private updateBabies(agents: Agent[], locations: Location[]): void {
    // Count children per homeId
    const childrenPerHome = new Map<string, number>()
    for (const agent of agents) {
      if (agent.state === 'dead' || agent.children <= 0) continue
      // Only count once per couple (alphabetically-first partner)
      if (agent.partnerId && agent.id > agent.partnerId) continue
      const current = childrenPerHome.get(agent.homeId) ?? 0
      childrenPerHome.set(agent.homeId, current + agent.children)
    }

    // Remove old baby sprites for homes that no longer have children
    for (const [homeId, sprites] of this.babySprites) {
      if (!childrenPerHome.has(homeId)) {
        for (const s of sprites) {
          this.babyGroup.remove(s)
          ;(s.material as THREE.Material).dispose()
        }
        this.babySprites.delete(homeId)
      }
    }

    // Create/update baby sprites
    const babyTexture = this.getLocationTexture('👶', 64)
    for (const [homeId, count] of childrenPerHome) {
      const home = locations.find((l) => l.id === homeId)
      if (!home) continue

      const existing = this.babySprites.get(homeId) ?? []
      // Add missing sprites
      while (existing.length < Math.min(count, 4)) {
        const mat = new THREE.SpriteMaterial({
          map: babyTexture,
          transparent: true,
          depthTest: false,
          sizeAttenuation: true,
        })
        const sprite = new THREE.Sprite(mat)
        sprite.scale.set(1.2, 1.2, 1)
        this.babyGroup.add(sprite)
        existing.push(sprite)
      }
      // Remove excess sprites
      while (existing.length > Math.min(count, 4)) {
        const s = existing.pop()!
        this.babyGroup.remove(s)
        ;(s.material as THREE.Material).dispose()
      }

      // Position babies around the home
      for (let i = 0; i < existing.length; i++) {
        const angle = (i / existing.length) * Math.PI * 2
        const offset = 1.5
        existing[i].position.set(
          home.position.x + Math.cos(angle) * offset,
          0.8,
          home.position.y + Math.sin(angle) * offset,
        )
      }

      this.babySprites.set(homeId, existing)
    }
  }

  // Emoji map for location types
  private static LOCATION_EMOJIS: Record<string, string> = {
    home: '🏠',
    workplace: '🏢',
    market: '🛒',
    school: '🎓',
    government: '🏛️',
    resource: '🌳',
    factory: '🏭',
    bank: '🏦',
  }

  // Workplace sub-type emojis
  private static WORKPLACE_SUBTYPE_EMOJIS: Record<string, string> = {
    manual: '🔧',
    skilled: '💼',
    creative: '🎨',
    service: '🛍️',
  }

  private locationTextureCache: Map<string, THREE.Texture> = new Map()

  private getLocationTexture(emoji: string, size = 128): THREE.Texture {
    const cached = this.locationTextureCache.get(emoji)
    if (cached) return cached

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    ctx.font = `${size * 0.7}px serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, size / 2, size / 2 + 4)
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    this.locationTextureCache.set(emoji, texture)
    return texture
  }

  private createLocationMesh(loc: Location): void {
    // Choose emoji
    let emoji = AgentScene.LOCATION_EMOJIS[loc.type] ?? '📍'
    if (loc.type === 'workplace' && loc.workplaceType) {
      emoji = AgentScene.WORKPLACE_SUBTYPE_EMOJIS[loc.workplaceType] ?? emoji
    }

    // Create a sprite with the emoji texture
    const texture = this.getLocationTexture(emoji)
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      sizeAttenuation: true,
    })
    const sprite = new THREE.Sprite(spriteMat)
    const spriteSize = 2.5 + loc.radius * 0.3
    sprite.scale.set(spriteSize, spriteSize, 1)
    sprite.position.set(loc.position.x, 1.8, loc.position.y)

    // Invisible hit-target mesh for raycasting (sprites don't raycast well)
    const hitGeo = new THREE.BoxGeometry(spriteSize * 0.8, spriteSize * 0.8, spriteSize * 0.8)
    const hitMat = new THREE.MeshBasicMaterial({ visible: false })
    const hitMesh = new THREE.Mesh(hitGeo, hitMat)
    hitMesh.position.copy(sprite.position)
    hitMesh.userData = { locationId: loc.id, locationType: loc.type }

    // Group sprite + hit mesh
    this.locationGroup.add(sprite)
    this.locationGroup.add(hitMesh)

    // Store the hit mesh for raycasting
    this.locationMeshes.set(loc.id, hitMesh)
    // Keep reference to sprite for cleanup
    hitMesh.userData._sprite = sprite
  }

  // ============================================================
  // Get agent emoji texture (cached)
  // ============================================================
  private getAgentEmojiTexture(emoji: string): THREE.Texture {
    const cached = this.agentEmojiCache.get(emoji)
    if (cached) return cached

    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    ctx.font = `${size * 0.75}px serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, size / 2, size / 2 + 2)
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    this.agentEmojiCache.set(emoji, texture)
    return texture
  }

  // ============================================================
  // Heatmap — full-world interpolated DataTexture layer
  // ============================================================

  /** Create the heatmap plane + DataTexture (called once in constructor) */
  private initHeatmapLayer(): void {
    const res = this.HEATMAP_RES
    const ws = this.HEATMAP_WORLD_SIZE

    // RGBA pixel buffer
    this.heatmapData = new Uint8Array(res * res * 4)

    // DataTexture — updated every tick
    this.heatmapTexture = new THREE.DataTexture(
      this.heatmapData, res, res, THREE.RGBAFormat
    )
    this.heatmapTexture.minFilter = THREE.LinearFilter
    this.heatmapTexture.magFilter = THREE.LinearFilter
    this.heatmapTexture.wrapS = THREE.ClampToEdgeWrapping
    this.heatmapTexture.wrapT = THREE.ClampToEdgeWrapping
    this.heatmapTexture.needsUpdate = true

    // Plane covering the world area, just above ground
    const geo = new THREE.PlaneGeometry(ws, ws)
    const mat = new THREE.MeshBasicMaterial({
      map: this.heatmapTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 1.0,
    })
    this.heatmapMesh = new THREE.Mesh(geo, mat)
    this.heatmapMesh.rotation.x = -Math.PI / 2
    this.heatmapMesh.position.y = 0.05
    this.heatmapMesh.visible = false
    this.scene.add(this.heatmapMesh)
  }

  /** Set the active heatmap mode. 'none' hides the layer. */
  setHeatmapMode(mode: HeatmapMode): void {
    this.heatmapMode = mode
    if (this.heatmapMesh) {
      this.heatmapMesh.visible = mode !== 'none'
    }
  }

  /** Compute a 0→1 value for an agent based on the current heatmap mode.
   *  0 = cool (blue), 1 = hot (red). */
  private heatmapValue(agent: Agent, maxWealth: number): number {
    switch (this.heatmapMode) {
      case 'wealth':
        return Math.max(0, Math.min(1, agent.wealth / maxWealth))
      case 'poverty':
        return 1 - Math.max(0, Math.min(1, agent.wealth / maxWealth))
      case 'illness':
        return agent.isSick ? 1 : 0
      case 'unemployment':
        return (agent.state === 'unemployed') ? 1 : (agent.state === 'criminal') ? 0.7 : 0
      case 'satisfaction':
        return agent.satisfaction
      case 'age':
        return Math.min(1, agent.age / 90)
      case 'education': {
        const eduVal = { low: 0.15, medium: 0.5, high: 1.0 }
        return eduVal[agent.education] ?? 0.5
      }
      case 'crime':
        return agent.state === 'criminal' ? 1 : 0
      case 'death':
        // Dead agents (state='dead') or very old/sick agents glow hot
        return agent.state === 'dead' ? 1 : (agent.isSick && agent.age > 60) ? 0.6 : 0
      case 'birth':
        // Agents who recently had a baby glow hot; children glow warm
        return agent.state === 'child' ? 0.8
          : (agent.children > 0 && agent.age >= 20 && agent.age <= 45) ? Math.min(1, agent.children * 0.3) : 0
      case 'familySize':
        // Family size: single=0, couple=0.3, couple+kids scales up
        return Math.min(1, ((agent.partnerId ? 1 : 0) + agent.children) / 5)
      default:
        return 0
    }
  }

  /** Check if the current heatmap mode is location-based (uses locations, not agents) */
  private static readonly LOCATION_HEATMAP_MODES: Set<string> = new Set(['housing', 'businesses', 'automation'])

  /** Compute a 0→1 value for a location based on the current heatmap mode. */
  private heatmapLocationValue(loc: Location): number {
    switch (this.heatmapMode) {
      case 'housing':
        // Homes glow by occupancy density (residents / max capacity)
        if (loc.type !== 'home') return 0
        return Math.min(1, (loc.residentsCount ?? 0) / Math.max(1, loc.maxResidents ?? 1))
      case 'businesses':
        // Workplaces glow by fill rate (filledSlots / jobSlots)
        if (loc.type !== 'workplace') return 0
        return loc.jobSlots > 0 ? Math.min(1, loc.filledSlots / loc.jobSlots) : 0
      case 'automation': {
        // Workplaces glow by automation level (automated+aiDisplaced / original total)
        if (loc.type !== 'workplace') return 0
        const originalTotal = loc.jobSlots + loc.automatedSlots + loc.aiDisplacedSlots
        if (originalTotal === 0) return 0
        return Math.min(1, (loc.automatedSlots + loc.aiDisplacedSlots) / originalTotal)
      }
      default:
        return 0
    }
  }

  /** Color ramp: 0→blue, 0.5→yellow, 1→red. Returns [r,g,b] in 0-255. */
  private static heatColor(t: number): [number, number, number] {
    // Blue(0) → Cyan(0.25) → Green(0.4) → Yellow(0.6) → Orange(0.8) → Red(1)
    let r: number, g: number, b: number
    if (t < 0.25) {
      const s = t / 0.25
      r = 0; g = s * 0.6; b = 0.95 - s * 0.3
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25
      r = s * 0.3; g = 0.6 + s * 0.3; b = 0.65 - s * 0.55
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25
      r = 0.3 + s * 0.6; g = 0.9 - s * 0.2; b = 0.1 - s * 0.1
    } else {
      const s = (t - 0.75) / 0.25
      r = 0.9 + s * 0.1; g = 0.7 - s * 0.6; b = 0
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
  }

  /** Rebuild the heatmap DataTexture from agent/location positions + values */
  private updateHeatmap(agents: Agent[], locations: Location[]): void {
    if (this.heatmapMode === 'none' || !this.heatmapData || !this.heatmapTexture) return

    const res = this.HEATMAP_RES
    const ws = this.HEATMAP_WORLD_SIZE
    const half = ws / 2
    const cellSize = ws / res
    const radius = this.HEATMAP_RADIUS
    const radiusSq = radius * radius
    const invR2 = 1 / radiusSq
    const data = this.heatmapData

    // Pre-compute positions + values (agents OR locations depending on mode)
    const ax: number[] = []
    const ay: number[] = []
    const av: number[] = []

    const isLocationMode = AgentScene.LOCATION_HEATMAP_MODES.has(this.heatmapMode)

    if (isLocationMode) {
      // Location-based modes: splat location data onto the grid
      for (const loc of locations) {
        const val = this.heatmapLocationValue(loc)
        if (val <= 0) continue
        ax.push((loc.position.x + half) / cellSize)
        ay.push((loc.position.y + half) / cellSize)
        av.push(val)
      }
    } else {
      // Agent-based modes: splat agent data onto the grid
      // For 'death' mode, include dead agents so their last position glows
      const pool = this.heatmapMode === 'death'
        ? agents
        : agents.filter(a => a.state !== 'dead')
      const maxWealth = Math.max(1, ...pool.map(a => a.wealth))
      for (const agent of pool) {
        ax.push((agent.position.x + half) / cellSize)
        ay.push((agent.position.y + half) / cellSize)
        av.push(this.heatmapValue(agent, maxWealth))
      }
    }

    // How many grid cells does the radius span?
    const radiusCells = Math.ceil(radius / cellSize)

    // Clear the buffer
    data.fill(0)

    // Accumulate: for each point, splat a Gaussian into nearby grid cells
    const valueSum = new Float32Array(res * res)
    const weightSum = new Float32Array(res * res)

    for (let a = 0; a < ax.length; a++) {
      const agx = ax[a]
      const agy = ay[a]
      const val = av[a]

      const gxMin = Math.max(0, Math.floor(agx - radiusCells))
      const gxMax = Math.min(res - 1, Math.ceil(agx + radiusCells))
      const gyMin = Math.max(0, Math.floor(agy - radiusCells))
      const gyMax = Math.min(res - 1, Math.ceil(agy + radiusCells))

      for (let gy = gyMin; gy <= gyMax; gy++) {
        const dy = (gy - agy) * cellSize
        const dy2 = dy * dy
        if (dy2 > radiusSq) continue
        for (let gx = gxMin; gx <= gxMax; gx++) {
          const dx = (gx - agx) * cellSize
          const distSq = dx * dx + dy2
          if (distSq > radiusSq) continue

          // Gaussian weight: exp(-3 * d²/R²) — smooth falloff
          const w = Math.exp(-3 * distSq * invR2)
          const idx = gy * res + gx
          valueSum[idx] += val * w
          weightSum[idx] += w
        }
      }
    }

    // Write RGBA pixels
    for (let i = 0; i < res * res; i++) {
      const w = weightSum[i]
      if (w < 0.001) {
        data[i * 4] = 0
        data[i * 4 + 1] = 0
        data[i * 4 + 2] = 0
        data[i * 4 + 3] = 0
      } else {
        const v = Math.max(0, Math.min(1, valueSum[i] / w))
        const [r, g, b] = AgentScene.heatColor(v)
        // Alpha: proportional to weight density, clamped
        const alpha = Math.min(180, w * 120)
        data[i * 4] = r
        data[i * 4 + 1] = g
        data[i * 4 + 2] = b
        data[i * 4 + 3] = alpha
      }
    }

    this.heatmapTexture.needsUpdate = true
  }

  // ============================================================
  // Update agent sprites
  // ============================================================
  private updateAgents(agents: Agent[]): void {
    const count = Math.min(agents.length, this.maxAgents)
    this.agentCount = count

    // --- Tick timing: estimate interval between sim ticks for smooth interpolation ---
    const now = performance.now()
    if (this.lastTickTime > 0) {
      const elapsed = now - this.lastTickTime
      // Only update interval if reasonable (20ms–5000ms), ignore outliers
      if (elapsed > 20 && elapsed < 5000) {
        // Smooth the estimate (90% old + 10% new) to avoid jitter
        this.tickIntervalMs = this.tickIntervalMs * 0.7 + elapsed * 0.3
      }
    }
    this.lastTickTime = now

    // Save old render state keyed by agent ID before remapping indices
    const oldRenderPos = new Map<string, { x: number; y: number; z: number; s: number }>()
    for (const [id, oldIdx] of this.agentIdToIndex) {
      const o3 = oldIdx * 3
      if (o3 + 2 < this.renderPos.length) {
        oldRenderPos.set(id, {
          x: this.renderPos[o3],
          y: this.renderPos[o3 + 1],
          z: this.renderPos[o3 + 2],
          s: this.renderScales[oldIdx] ?? 0,
        })
      }
    }

    // Resize buffers if needed
    const needed3 = count * 3
    if (this.targetPos.length < needed3) {
      this.prevPos = new Float32Array(needed3)
      this.targetPos = new Float32Array(needed3)
      this.renderPos = new Float32Array(needed3)
      this.prevScales = new Float32Array(count)
      this.targetScales = new Float32Array(count)
      this.renderScales = new Float32Array(count)
    }

    // Track which agent IDs are current
    const currentIds = new Set<string>()

    // Rebuild ID → index mapping
    this.agentIdToIndex.clear()

    for (let i = 0; i < count; i++) {
      const agent = agents[i]
      this.agentIdToIndex.set(agent.id, i)
      currentIds.add(agent.id)

      // Size based on wealth (subtle, log scale)
      const wealthScale = 1.6 + Math.min(0.8, Math.log(Math.max(1, agent.wealth)) / 12)
      const isSelected = agent.id === this.selectedAgentId
      const scale = isSelected ? wealthScale * 1.4 : wealthScale

      const i3 = i * 3
      // New tick: current renderPos becomes prevPos, new sim position becomes targetPos
      const old = oldRenderPos.get(agent.id)
      if (old && old.s > 0) {
        // Existing agent: prev = where they currently are visually
        this.prevPos[i3] = old.x
        this.prevPos[i3 + 1] = old.y
        this.prevPos[i3 + 2] = old.z
        this.prevScales[i] = old.s
        // renderPos stays at prev until lerpAgents moves it
        this.renderPos[i3] = old.x
        this.renderPos[i3 + 1] = old.y
        this.renderPos[i3 + 2] = old.z
        this.renderScales[i] = old.s
      } else {
        // Brand-new agent: snap everything to target immediately
        this.prevPos[i3] = agent.position.x
        this.prevPos[i3 + 1] = 1.0
        this.prevPos[i3 + 2] = agent.position.y
        this.prevScales[i] = scale
        this.renderPos[i3] = agent.position.x
        this.renderPos[i3 + 1] = 1.0
        this.renderPos[i3 + 2] = agent.position.y
        this.renderScales[i] = scale
      }

      // Set TARGET positions (where agent should be at end of this tick's interpolation)
      this.targetPos[i3] = agent.position.x
      this.targetPos[i3 + 1] = 1.0
      this.targetPos[i3 + 2] = agent.position.y
      this.targetScales[i] = scale

      // Determine emoji for this agent (gendered)
      const emoji = agentEmoji(agent.state, agent.currentAction, agent.gender)
      const texture = this.getAgentEmojiTexture(emoji)

      // Get or create sprite
      let sprite = this.agentSprites.get(agent.id)
      if (!sprite) {
        const mat = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: false,
          sizeAttenuation: true,
        })
        sprite = new THREE.Sprite(mat)
        this.agentSpriteGroup.add(sprite)
        this.agentSprites.set(agent.id, sprite)
      } else {
        // Update texture if emoji changed
        const mat = sprite.material as THREE.SpriteMaterial
        if (mat.map !== texture) {
          mat.map = texture
          mat.needsUpdate = true
        }
      }

      // Scale and selection highlight
      sprite.scale.set(scale * 1.2, scale * 1.2, 1)
      if (isSelected) {
        ;(sprite.material as THREE.SpriteMaterial).opacity = 1.0
      } else {
        ;(sprite.material as THREE.SpriteMaterial).opacity = 0.9
      }
    }

    // Remove sprites for agents that no longer exist
    for (const [id, sprite] of this.agentSprites) {
      if (!currentIds.has(id)) {
        this.agentSpriteGroup.remove(sprite)
        sprite.material.dispose()
        this.agentSprites.delete(id)
      }
    }
  }

  // ============================================================
  // Lerp agent sprite positions each frame for smooth movement
  // ============================================================
  private lerpAgents(): void {
    const count = this.agentCount
    if (count === 0 || this.lastTickTime === 0) return

    // Compute interpolation factor: how far through the current tick interval are we?
    const now = performance.now()
    const elapsed = now - this.lastTickTime
    // Clamp t to [0, 1] — at t=0 we're at prevPos, at t=1 we've reached targetPos
    // Use 1.05x interval to slightly overshoot timing (avoids snapping at tick boundary)
    const t = Math.min(1, elapsed / (this.tickIntervalMs * 1.05))

    for (let i = 0; i < count; i++) {
      const i3 = i * 3

      // Linear interpolation: renderPos = prevPos + (targetPos - prevPos) * t
      this.renderPos[i3] = this.prevPos[i3] + (this.targetPos[i3] - this.prevPos[i3]) * t
      this.renderPos[i3 + 1] = this.prevPos[i3 + 1] + (this.targetPos[i3 + 1] - this.prevPos[i3 + 1]) * t
      this.renderPos[i3 + 2] = this.prevPos[i3 + 2] + (this.targetPos[i3 + 2] - this.prevPos[i3 + 2]) * t
      this.renderScales[i] = this.prevScales[i] + (this.targetScales[i] - this.prevScales[i]) * t
    }

    // Apply interpolated positions to sprites
    for (const [id, sprite] of this.agentSprites) {
      const idx = this.agentIdToIndex.get(id)
      if (idx == null) continue
      const i3 = idx * 3
      sprite.position.set(this.renderPos[i3], this.renderPos[i3 + 1], this.renderPos[i3 + 2])
      const s = this.renderScales[idx]
      sprite.scale.set(s * 1.2, s * 1.2, 1)
    }
  }

  // ============================================================
  // Update trail lines
  // ============================================================
  private updateTrails(agents: Agent[]): void {
    // Only show trails for selected agent or first 50 agents
    const trailAgents = this.selectedAgentId
      ? agents.filter((a) => a.id === this.selectedAgentId)
      : agents.slice(0, 30)

    const activeIds = new Set(trailAgents.map((a) => a.id))

    // Remove old trails
    for (const [id, line] of this.trailLines) {
      if (!activeIds.has(id)) {
        this.trailGroup.remove(line)
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
        this.trailLines.delete(id)
      }
    }

    // Update/create trails
    for (const agent of trailAgents) {
      if (agent.trail.length < 2) continue

      const points = agent.trail.map((p) => new THREE.Vector3(p.x, 0.05, p.y))

      let line = this.trailLines.get(agent.id)
      if (line) {
        // Update geometry
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        line.geometry.dispose()
        line.geometry = geo
      } else {
        // Create new
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const stateColor = COLORS[agent.state] ?? COLORS.employed
        const mat = new THREE.LineBasicMaterial({
          color: stateColor,
          transparent: true,
          opacity: agent.id === this.selectedAgentId ? 0.6 : 0.15,
        })
        line = new THREE.Line(geo, mat)
        this.trailGroup.add(line)
        this.trailLines.set(agent.id, line)
      }
    }
  }

  // ============================================================
  // Spawn money floater sprites from MoneyEvents
  // ============================================================
  private spawnMoneyFloaters(events: MoneyEvent[]): void {
    // Limit visible floaters for performance
    const MAX_FLOATERS = 20
    for (const evt of events) {
      if (this.moneyFloaters.length >= MAX_FLOATERS) break

      const text = evt.amount >= 0 ? `+${evt.amount}` : `${evt.amount}`
      const isGain = evt.amount >= 0

      // Create canvas texture for money text
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 48
      const ctx = canvas.getContext('2d')!
      ctx.font = 'bold 28px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = isGain ? '#81B29A' : '#E07A5F'
      ctx.fillText((isGain ? '💰' : '💸') + text, 64, 24)

      const texture = new THREE.CanvasTexture(canvas)
      const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        opacity: 1.0,
      })
      const sprite = new THREE.Sprite(mat)
      sprite.scale.set(3, 1.2, 1)
      const startY = 2.0
      sprite.position.set(evt.position.x, startY, evt.position.y)
      this.moneyGroup.add(sprite)
      this.moneyFloaters.push({ sprite, startY, life: 0, maxLife: 60 })
    }
  }

  // ============================================================
  // Animate money floaters (called in render loop)
  // ============================================================
  private animateMoneyFloaters(): void {
    for (let i = this.moneyFloaters.length - 1; i >= 0; i--) {
      const f = this.moneyFloaters[i]
      f.life++
      const t = f.life / f.maxLife
      f.sprite.position.y = f.startY + t * 4
      ;(f.sprite.material as THREE.SpriteMaterial).opacity = 1 - t

      if (f.life >= f.maxLife) {
        this.moneyGroup.remove(f.sprite)
        ;(f.sprite.material as THREE.SpriteMaterial).map?.dispose()
        f.sprite.material.dispose()
        this.moneyFloaters.splice(i, 1)
      }
    }
  }

  // ============================================================
  // Camera follow
  // ============================================================
  private updateCameraFollow(): void {
    if (!this.followingAgent || !this.selectedAgentId || !this.currentState) return
    const agent = this.currentState.agents.find((a) => a.id === this.selectedAgentId)
    if (!agent) return

    const targetPos = new THREE.Vector3(agent.position.x, 0, agent.position.y)
    this.controls.target.lerp(targetPos, 0.05)
  }

  // ============================================================
  // Mouse interaction
  // ============================================================
  private onClick(event: MouseEvent): void {
    this.updateMouse(event)
    this.raycaster.setFromCamera(this.mouse, this.camera)

    // 1. Check agent sprite clicks first
    const agentSpriteArr = Array.from(this.agentSprites.values())
    const agentHits = this.raycaster.intersectObjects(agentSpriteArr)
    if (agentHits.length > 0) {
      const hitSprite = agentHits[0].object
      // Find agent ID from sprite
      for (const [agentId, sprite] of this.agentSprites) {
        if (sprite === hitSprite && this.currentState) {
          const agent = this.currentState.agents.find((a) => a.id === agentId)
          if (agent) {
            this.selectedAgentId = agent.id
            this.followingAgent = true
            eventBus.emit('cell:selected', agent as never)
            eventBus.emit('location:dismissed')
            return
          }
        }
      }
    }

    // 2. Check location mesh clicks
    const locMeshes = Array.from(this.locationMeshes.values())
    const locHits = this.raycaster.intersectObjects(locMeshes)
    if (locHits.length > 0) {
      const hitMesh = locHits[0].object
      // Find the location ID from our map
      for (const [locId, mesh] of this.locationMeshes) {
        if (mesh === hitMesh) {
          eventBus.emit('location:clicked', {
            locationId: locId,
            screenX: event.clientX,
            screenY: event.clientY,
          } as never)
          // Deselect agent when clicking location
          this.selectedAgentId = null
          this.followingAgent = false
          return
        }
      }
    }

    // 3. Clicked empty space — deselect all
    this.selectedAgentId = null
    this.followingAgent = false
    eventBus.emit('cell:deselected')
    eventBus.emit('location:dismissed')
  }

  private onMouseMove(event: MouseEvent): void {
    this.updateMouse(event)
    this.raycaster.setFromCamera(this.mouse, this.camera)

    // Check agent sprites
    const agentSpriteArr = Array.from(this.agentSprites.values())
    const intersects = this.raycaster.intersectObjects(agentSpriteArr)
    if (intersects.length > 0) {
      const hitSprite = intersects[0].object
      for (const [agentId, sprite] of this.agentSprites) {
        if (sprite === hitSprite && this.currentState) {
          const agent = this.currentState.agents.find((a) => a.id === agentId)
          if (agent && this.hoveredAgentId !== agent.id) {
            this.hoveredAgentId = agent.id
            eventBus.emit('cell:hovered', agent as never)
          }
          this.renderer.domElement.style.cursor = 'pointer'
          return
        }
      }
    }

    // Check locations
    const locMeshes = Array.from(this.locationMeshes.values())
    const locHits = this.raycaster.intersectObjects(locMeshes)
    if (locHits.length > 0) {
      this.renderer.domElement.style.cursor = 'pointer'
      this.hoveredAgentId = null
      return
    }

    this.hoveredAgentId = null
    this.renderer.domElement.style.cursor = 'default'
  }

  private updateMouse(event: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  // ============================================================
  // Render loop
  // ============================================================
  private startRenderLoop(): void {
    const animate = () => {
      if (this.disposed) return
      this.animationId = requestAnimationFrame(animate)
      this.controls.update()
      this.lerpAgents()
      this.updateCameraFollow()
      this.animateMoneyFloaters()
      this.renderer.render(this.scene, this.camera)
    }
    animate()
  }

  // ============================================================
  // Public API
  // ============================================================
  setShowTrails(show: boolean): void {
    this.showTrails = show
    this.trailGroup.visible = show
  }

  getSelectedAgentId(): string | null {
    return this.selectedAgentId
  }

  deselectAgent(): void {
    this.selectedAgentId = null
    this.followingAgent = false
  }

  // ============================================================
  // Dispose
  // ============================================================
  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.animationId)
    this.controls.dispose()

    // Dispose agent sprites
    for (const [, sprite] of this.agentSprites) {
      sprite.material.dispose()
    }
    for (const [, tex] of this.agentEmojiCache) {
      tex.dispose()
    }

    for (const [, mesh] of this.locationMeshes) {
      const sprite = mesh.userData._sprite as THREE.Sprite | undefined
      if (sprite) {
        ;(sprite.material as THREE.Material).dispose()
      }
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    for (const [, tex] of this.locationTextureCache) {
      tex.dispose()
    }

    for (const [, line] of this.trailLines) {
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    }


    // Dispose money floaters
    for (const f of this.moneyFloaters) {
      ;(f.sprite.material as THREE.SpriteMaterial).map?.dispose()
      f.sprite.material.dispose()
    }

    // Dispose heatmap
    if (this.heatmapMesh) {
      this.heatmapMesh.geometry.dispose()
      ;(this.heatmapMesh.material as THREE.Material).dispose()
    }
    if (this.heatmapTexture) {
      this.heatmapTexture.dispose()
    }

    this.groundMesh.geometry.dispose()
    ;(this.groundMesh.material as THREE.Material).dispose()

    this.renderer.dispose()
    this.container.removeChild(this.renderer.domElement)
  }
}
