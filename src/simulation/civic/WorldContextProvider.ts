// ============================================================
// WorldContextProvider — Real-world context for LLM-powered referendums
// Two-layer approach:
//   1. LLM-generated base context (geopolitics, economy, tech, society)
//   2. Live news headlines from mediastack API (optional, needs API key)
// Cached per session — refreshed once on app start
// ============================================================

// --- Configuration ---
const OLLAMA_BASE_URL = 'http://localhost:11434'
// Use Vite proxy to bypass CORS: /api/mediastack → http://api.mediastack.com/v1
const MEDIASTACK_API_URL = '/api/mediastack'

// Mediastack API key — set via env variable VITE_MEDIASTACK_API_KEY
// Free tier: 100 requests/month
const MEDIASTACK_API_KEY = import.meta.env.VITE_MEDIASTACK_API_KEY as string | undefined

// --- Types ---
export interface WorldContext {
  baseContext: string       // LLM-generated world summary
  headlines: NewsHeadline[] // Recent news headlines
  generatedAt: number       // timestamp
  stale: boolean            // true if older than 6 hours
}

export interface NewsHeadline {
  title: string
  description: string
  source: string
  publishedAt: string
  category?: string
}

// --- Session cache ---
let cachedContext: WorldContext | null = null
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6 hours

// --- Status tracking ---
let _isLoading = false
let _lastError: string | null = null

export function isWorldContextLoading(): boolean { return _isLoading }
export function getWorldContextError(): string | null { return _lastError }

// ============================================================
// 1. Generate base world context via Ollama
//    Asks the LLM for a structured summary of current world events
// ============================================================
const WORLD_CONTEXT_PROMPT = `You are a world affairs analyst. Provide a concise, structured summary of the current state of the world as of your latest knowledge. Cover these categories:

1. ECONOMY: Global economic conditions, inflation, recession risks, major market trends (stocks, crypto, commodities)
2. GEOPOLITICS: Major conflicts, tensions, alliances, sanctions, diplomatic developments
3. TECHNOLOGY: AI regulation, tech industry trends, automation impact, crypto/blockchain
4. SOCIETY: Major social movements, elections, policy changes, public health
5. MARKETS: Key stock indices (S&P500, NASDAQ, etc.), Bitcoin/crypto prices, oil, gold

Format as a compact briefing, max 300 words. Use bullet points. Be factual and specific with numbers when possible.`

async function generateBaseContext(model: string): Promise<string> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)

    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a concise world affairs analyst. Respond with factual information only.' },
          { role: 'user', content: WORLD_CONTEXT_PROMPT },
        ],
        stream: false,
        options: { temperature: 0.2, num_predict: 1024 },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)
    if (!res.ok) return ''

    const data = await res.json()
    const content: string =
      data.message?.content ||
      data.message?.thinking ||
      data.response ||
      ''

    return content.trim()
  } catch (err) {
    console.warn('[WorldContext] Failed to generate base context:', err instanceof Error ? err.message : err)
    return ''
  }
}

// ============================================================
// 2. Fetch live headlines from mediastack API (free tier)
//    Categories: general, business, technology, science
//    API docs: https://mediastack.com/documentation
// ============================================================
async function fetchMediastackHeadlines(): Promise<NewsHeadline[]> {
  if (!MEDIASTACK_API_KEY) {
    console.info('[WorldContext] No MEDIASTACK_API_KEY configured — skipping live headlines')
    return []
  }

  const categories = ['general', 'business', 'technology', 'science'] as const
  const headlines: NewsHeadline[] = []

  for (const category of categories) {
    try {
      // mediastack uses access_key, categories, languages, limit params
      const url = `${MEDIASTACK_API_URL}/news?access_key=${MEDIASTACK_API_KEY}&categories=${category}&languages=en&limit=5&sort=published_desc`
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })

      if (!res.ok) {
        console.warn(`[WorldContext] mediastack ${category} returned ${res.status}`)
        continue
      }

      const data = await res.json()

      // mediastack returns { data: [...articles] } on success
      // or { error: { code, message } } on failure
      if (data.error) {
        console.warn(`[WorldContext] mediastack ${category} error:`, data.error.message ?? data.error.code)
        continue
      }

      const articles = data.data ?? []

      for (const a of articles) {
        headlines.push({
          title: a.title ?? '',
          description: (a.description ?? '').slice(0, 200),
          source: a.source ?? 'unknown',
          publishedAt: a.published_at ?? '',
          category,
        })
      }
    } catch (err) {
      console.warn(`[WorldContext] mediastack ${category} fetch failed:`, err instanceof Error ? err.message : err)
    }
  }

  return headlines
}

// ============================================================
// 3. Format world context into a compact string for LLM injection
// ============================================================
export function formatWorldContext(ctx: WorldContext): string {
  const parts: string[] = []

  if (ctx.baseContext) {
    parts.push('=== WORLD SITUATION (from AI knowledge base) ===')
    parts.push(ctx.baseContext)
  }

  if (ctx.headlines.length > 0) {
    parts.push('')
    parts.push('=== RECENT NEWS HEADLINES ===')

    // Group by category
    const grouped = new Map<string, NewsHeadline[]>()
    for (const h of ctx.headlines) {
      const cat = h.category ?? 'general'
      if (!grouped.has(cat)) grouped.set(cat, [])
      grouped.get(cat)!.push(h)
    }

    for (const [cat, items] of grouped) {
      parts.push(`[${cat.toUpperCase()}]`)
      for (const item of items.slice(0, 5)) {
        const date = item.publishedAt ? ` (${item.publishedAt.split('T')[0]})` : ''
        parts.push(`- ${item.title}${date}`)
      }
    }
  }

  if (ctx.stale) {
    parts.push('')
    parts.push('Note: This context may be outdated. Use your best judgment.')
  }

  return parts.join('\n')
}

// ============================================================
// 4. Main API: refresh and get world context
// ============================================================

/** Resolve the Ollama model (reuses LocalLLMBridge logic) */
async function resolveModelForContext(): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
    if (!res.ok) return null
    const data = await res.json()
    const models = (data.models ?? []).map((m: { name: string }) => m.name) as string[]
    // Prefer qwen2.5 for fast context generation
    const preferred = ['qwen2.5:7b', 'qwen2.5:14b', 'qwen3.5:9b']
    for (const p of preferred) {
      if (models.includes(p)) return p
    }
    return models[0] ?? null
  } catch {
    return null
  }
}

/** Refresh world context — call once per session on app start.
 *  Generates LLM base context + fetches live headlines in parallel. */
export async function refreshWorldContext(): Promise<WorldContext> {
  // Return cached if fresh
  if (cachedContext && (Date.now() - cachedContext.generatedAt) < SESSION_MAX_AGE_MS) {
    return cachedContext
  }

  _isLoading = true
  _lastError = null

  try {
    const model = await resolveModelForContext()

    // Run LLM context generation and news fetch in parallel
    const [baseContext, headlines] = await Promise.all([
      model ? generateBaseContext(model) : Promise.resolve(''),
      fetchMediastackHeadlines(),
    ])

    if (!baseContext && headlines.length === 0) {
      _lastError = 'No world context available (Ollama offline, no API key)'
    }

    cachedContext = {
      baseContext,
      headlines,
      generatedAt: Date.now(),
      stale: false,
    }

    console.log(
      `[WorldContext] Refreshed: ${baseContext.length} chars base context, ${headlines.length} headlines`
    )

    return cachedContext
  } catch (err) {
    _lastError = err instanceof Error ? err.message : 'Unknown error'
    console.warn('[WorldContext] Refresh failed:', _lastError)

    // Return empty context on failure
    cachedContext = {
      baseContext: '',
      headlines: [],
      generatedAt: Date.now(),
      stale: true,
    }
    return cachedContext
  } finally {
    _isLoading = false
  }
}

/** Get current cached context (or empty if not yet refreshed) */
export function getWorldContext(): WorldContext | null {
  return cachedContext
}

/** Get formatted context string ready for LLM prompt injection */
export function getWorldContextString(): string {
  if (!cachedContext) return ''
  return formatWorldContext(cachedContext)
}

/** Force clear cache (useful for testing) */
export function clearWorldContextCache(): void {
  cachedContext = null
}
