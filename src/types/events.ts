// --- Event Types ---
// All event definitions for the event-driven architecture

import type { Snapshot, SimParams, Cell } from './simulation'
import type { VisualMode, DisplayToggles, PlaybackState } from './visualization'

/** Map of all application events and their payloads */
export type AppEvents = {
  // Simulation data events
  'snapshot:updated': Snapshot
  'snapshot:loaded': Snapshot[]
  'params:changed': SimParams

  // Playback events
  'playback:play': void
  'playback:pause': void
  'playback:stop': void
  'playback:step-forward': void
  'playback:step-backward': void
  'playback:seek': number
  'playback:speed-changed': number
  'playback:state-changed': PlaybackState

  // Visual mode events
  'mode:changed': VisualMode
  'toggle:layer': { key: keyof DisplayToggles; value: boolean }
  'toggles:changed': DisplayToggles

  // Inspector events
  'cell:hovered': Cell | null
  'cell:selected': Cell | null
  'cell:deselected': void

  // Location info bubble
  'location:clicked': { locationId: string; screenX: number; screenY: number }
  'location:dismissed': void

  // Camera events
  'camera:reset': void
  'camera:zoom-to': { x: number; y: number }

  // Scene lifecycle events
  'scene:ready': void
  'scene:resize': { width: number; height: number }
  'scene:frame': number // delta time

  // Heatmap overlay
  'heatmap:mode': string

  // Scenario events
  'scenario:selected': string
}
