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
  const { trail, velocity, target, targetLocationId, needsConsumption, ticksSinceConsumption, wealthArchive, ...rest } = agent
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
 * Compact agent export for snapshots: strips rendering + large archive data.
 * Use fullAgentExport() when you want the complete history.
 */
export function compactAgentExport(agent: Record<string, unknown>): Record<string, unknown> {
  const { trail, velocity, target, wealthArchive, stateHistory, wealthHistory, ...rest } = agent
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

// ============================================================
// Sampling options — reduce CSV size for large datasets
// ============================================================
export interface SampleOptions {
  /** Keep every Nth row (time-series downsampling). Default: 1 (no skip). */
  every?: number
  /** Maximum number of rows to export. Default: Infinity. */
  maxRows?: number
  /** Maximum number of agents to export (random subset). Default: Infinity. */
  maxAgents?: number
  /** Always include the first and last row even when sampling. Default: true. */
  keepEnds?: boolean
}

/**
 * Apply sampling to an array: keep every Nth item, optionally cap total,
 * and optionally always include first + last.
 */
function applySample<T>(data: T[], opts?: SampleOptions): T[] {
  if (!opts || data.length === 0) return data
  const every = opts.every ?? 1
  const maxRows = opts.maxRows ?? Infinity
  const keepEnds = opts.keepEnds ?? true

  let sampled: T[]
  if (every <= 1) {
    sampled = data
  } else {
    sampled = data.filter((_, i) => i % every === 0)
    // Always include last row for time-series continuity
    if (keepEnds && data.length > 1) {
      const last = data[data.length - 1]
      if (sampled[sampled.length - 1] !== last) sampled.push(last)
    }
  }

  if (sampled.length > maxRows) {
    const head = sampled.slice(0, maxRows - (keepEnds ? 1 : 0))
    if (keepEnds) head.push(sampled[sampled.length - 1])
    sampled = head
  }

  return sampled
}

/**
 * Download a string as a CSV file.
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename)
}

/**
 * Convert an array of metrics snapshots to CSV string.
 * Each row = one tick snapshot with all SimMetrics fields.
 *
 * @param opts.every  — keep every Nth tick (e.g., 4 = monthly with ticksPerYear=52)
 * @param opts.maxRows — hard cap on total rows
 */
export function metricsToCSV(metrics: Record<string, unknown>[], opts?: SampleOptions): string {
  if (metrics.length === 0) return ''
  const sampled = applySample(metrics, opts)
  const keys = Object.keys(sampled[0]).filter(k => typeof sampled[0][k] === 'number' || typeof sampled[0][k] === 'string')
  const header = keys.join(',')
  const rows = sampled.map(m =>
    keys.map(k => {
      const v = m[k]
      return typeof v === 'number' ? (Number.isInteger(v) ? v : (v as number).toFixed(6)) : String(v ?? '')
    }).join(',')
  )
  return [header, ...rows].join('\n')
}

/**
 * Convert agent array to CSV for cross-sectional analysis.
 *
 * @param opts.maxAgents — export only a random subset of agents
 * @param opts.maxRows   — alias for maxAgents in this context
 */
export function agentsToCSV(agents: Record<string, unknown>[], opts?: SampleOptions): string {
  if (agents.length === 0) return ''
  const maxAgents = opts?.maxAgents ?? opts?.maxRows ?? Infinity
  let subset = agents
  if (maxAgents < agents.length) {
    // Deterministic sampling: evenly spaced indices
    const step = agents.length / maxAgents
    subset = Array.from({ length: maxAgents }, (_, i) => agents[Math.floor(i * step)])
  }
  const keys = ['id', 'age', 'gender', 'education', 'state', 'wealth', 'income', 'satisfaction',
    'isSick', 'partnerId', 'children', 'creditScore', 'homeOwned', 'ownedBusinessId']
  const header = keys.join(',')
  const rows = subset.map(a =>
    keys.map(k => {
      const v = a[k]
      if (v === null || v === undefined) return ''
      if (typeof v === 'number') return Number.isInteger(v) ? v : (v as number).toFixed(4)
      if (typeof v === 'boolean') return v ? '1' : '0'
      return String(v)
    }).join(',')
  )
  return [header, ...rows].join('\n')
}

/**
 * Estimate CSV size in KB before generating.
 * Useful for showing a warning in the UI.
 */
export function estimateCSVSize(rowCount: number, colCount: number, avgCellBytes = 8): number {
  return Math.round((rowCount * colCount * avgCellBytes) / 1024)
}
