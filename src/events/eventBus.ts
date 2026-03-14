// --- Central Event Bus ---
// All UI <-> Scene communication goes through this bus
// Uses mitt for lightweight typed event emission

import mitt, { type Emitter } from 'mitt'
import type { AppEvents } from '../types/events'

/** Singleton event bus for the entire application */
const eventBus: Emitter<AppEvents> = mitt<AppEvents>()

export default eventBus
