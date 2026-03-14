// --- Visualization Types ---
// Visual modes, camera config, and display toggles

/** Available visual modes for the sandbox */
export type VisualMode =
  | 'default'
  | 'state'
  | 'resource'
  | 'stress'
  | 'redistribution'
  | 'capital'
  | 'regime'

/** Labels for visual modes (for UI display) */
export const VISUAL_MODE_LABELS: Record<VisualMode, string> = {
  default: 'Default',
  state: 'State',
  resource: 'Resource',
  stress: 'Stress',
  redistribution: 'Redistribution',
  capital: 'Capital',
  regime: 'Regime',
}

/** Display toggle keys for layer visibility */
export interface DisplayToggles {
  resourceSpheres: boolean
  redistributionRings: boolean
  infrastructure: boolean
  stressOverlay: boolean
  agents: boolean
  tiles: boolean
}

/** Default display toggles */
export const DEFAULT_DISPLAY_TOGGLES: DisplayToggles = {
  resourceSpheres: true,
  redistributionRings: true,
  infrastructure: true,
  stressOverlay: true,
  agents: true,
  tiles: true,
}

/** Camera configuration */
export interface CameraConfig {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
  near: number
  far: number
  minDistance: number
  maxDistance: number
  minPolarAngle: number
  maxPolarAngle: number
}

/** Playback state */
export type PlaybackState = 'playing' | 'paused' | 'stopped'

/** Playback speed presets */
export const PLAYBACK_SPEEDS = [0.5, 1, 2, 5, 10] as const

/** Color palettes for agent states */
export const STATE_COLORS = {
  W: 0x5B8FB9, // Worker: steel blue
  P: 0xE07A5F, // Precarious: warm orange
  O: 0x3D405B, // Owner: anthracite
} as const

/** Extended color palette */
export const PALETTE = {
  redistribution: 0x81B29A,  // Soft cyan
  stress: 0xC44536,          // Muted red
  background: 0x1A1A2E,      // Deep grey
  ground: 0x2A2A3E,          // Ground base
  groundStress: 0x4A2A2A,    // Stressed ground
  accent: 0xD4A574,          // Pale gold
  uiPanel: 'rgba(30, 30, 50, 0.85)',
  text: '#E8E8E8',
  textSecondary: '#A0A0B0',
} as const
