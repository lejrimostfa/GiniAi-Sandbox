// --- Data Provider ---
// Abstract interface for data sources (mock, JSON files, REST API, WebSocket)
// Swap implementation to connect to a Python backend later

import type { Snapshot, SimParams } from '../types/simulation'
import { generateTimeline } from './mockSnapshots'

/** Abstract data provider interface */
export interface DataProvider {
  getSnapshot(step: number): Promise<Snapshot>
  getTimeline(): Promise<Snapshot[]>
  configure(params: SimParams): Promise<void>
  onSnapshot?(callback: (s: Snapshot) => void): void
  disconnect?(): void
}

/** Mock data provider using local generator */
export class MockDataProvider implements DataProvider {
  private timeline: Snapshot[] = []
  private params: SimParams

  constructor(params: SimParams) {
    this.params = { ...params }
    this.timeline = generateTimeline(100, this.params)
  }

  async getSnapshot(step: number): Promise<Snapshot> {
    const idx = Math.max(0, Math.min(step, this.timeline.length - 1))
    return this.timeline[idx]
  }

  async getTimeline(): Promise<Snapshot[]> {
    return this.timeline
  }

  async configure(params: SimParams): Promise<void> {
    this.params = { ...params }
    this.timeline = generateTimeline(100, this.params)
  }
}

// --- Future implementations (stubs) ---

// /** REST API data provider for Python backend */
// export class RestDataProvider implements DataProvider {
//   private baseUrl: string
//   constructor(baseUrl: string) { this.baseUrl = baseUrl }
//   async getSnapshot(step: number) {
//     const res = await fetch(`${this.baseUrl}/api/snapshot/${step}`)
//     return res.json()
//   }
//   async getTimeline() {
//     const res = await fetch(`${this.baseUrl}/api/timeline`)
//     return res.json()
//   }
//   async configure(params: SimParams) {
//     await fetch(`${this.baseUrl}/api/configure`, {
//       method: 'POST', headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(params)
//     })
//   }
// }

// /** WebSocket streaming provider */
// export class WsDataProvider implements DataProvider {
//   private ws: WebSocket | null = null
//   private callback?: (s: Snapshot) => void
//   constructor(private wsUrl: string) {}
//   async getSnapshot() { throw new Error('Use onSnapshot for streaming') }
//   async getTimeline() { throw new Error('Use onSnapshot for streaming') }
//   async configure(params: SimParams) { this.ws?.send(JSON.stringify(params)) }
//   onSnapshot(callback: (s: Snapshot) => void) {
//     this.callback = callback
//     this.ws = new WebSocket(this.wsUrl)
//     this.ws.onmessage = (e) => this.callback?.(JSON.parse(e.data))
//   }
//   disconnect() { this.ws?.close() }
// }
