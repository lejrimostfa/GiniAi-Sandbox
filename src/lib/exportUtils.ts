// --- Export Utilities ---
// Helper functions for exporting simulation data as downloadable JSON files
// Supports single-file download and multi-file ZIP bundle

/**
 * Trigger a browser file download with the given JSON data.
 */
export function downloadJSON(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  triggerDownload(blob, filename)
}

/**
 * Download multiple JSON files bundled together.
 * Each entry is { filename, data } — downloads them sequentially.
 * Falls back to sequential downloads since ZIP requires a library.
 */
export function downloadMultipleJSON(files: { filename: string; data: unknown }[]): void {
  // Small delay between downloads so browser doesn't block them
  files.forEach((f, i) => {
    setTimeout(() => {
      downloadJSON(f.data, f.filename)
    }, i * 300)
  })
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Generate a timestamped filename.
 * Example: "giniai_snapshot_initial_2026-03-13T20-37-00.json"
 */
export function buildFilename(prefix: string): string {
  const now = new Date()
  const ts = now.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '')
  return `${prefix}_${ts}.json`
}

/**
 * Generate a batch prefix for related files.
 * Example: "giniai_2026-03-13T20-37-00"
 */
export function buildBatchPrefix(): string {
  const now = new Date()
  const ts = now.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '')
  return `giniai_${ts}`
}

/**
 * Strip rendering-only fields from an Agent for a cleaner export.
 * Keeps ALL analytical data: identity, state, economics, life events, wealth history.
 */
export function sanitizeAgentForExport(agent: Record<string, unknown>): Record<string, unknown> {
  const { trail, velocity, target, targetLocationId, needsConsumption, ticksSinceConsumption, ...rest } = agent
  return rest
}

/**
 * Full agent export: keeps everything including wealth history and life events.
 * Only strips rendering data (trail, velocity, target).
 */
export function fullAgentExport(agent: Record<string, unknown>): Record<string, unknown> {
  const { trail, velocity, target, ...rest } = agent
  return rest
}

/**
 * Strip transient rendering fields from a WorldState snapshot for export.
 */
export function sanitizeWorldStateForExport(state: Record<string, unknown>): Record<string, unknown> {
  const { moneyEvents, ...rest } = state
  const agents = (rest.agents as Record<string, unknown>[]).map(sanitizeAgentForExport)
  return { ...rest, agents }
}
