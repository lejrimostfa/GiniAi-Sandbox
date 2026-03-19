// ============================================================
// LocalLLMBridge — Lightweight Ollama client for civic layer
// Single-purpose: generate weight vectors from custom questions
// Budget: 1 call per referendum, cached, with timeout + fallback
// ============================================================

import type { CivicWeightVector } from './types'
import { getWorldContextString } from './WorldContextProvider'

// --- Configuration ---
const OLLAMA_BASE_URL = 'http://localhost:11434'
// Preferred models — qwen2.5 first (no thinking mode, fast JSON output)
// Qwen3.5 models have a thinking mode that puts all output in a separate field
const OLLAMA_MODEL_CANDIDATES = [
  'qwen2.5:7b',
  'qwen2.5:14b',
  'qwen3.5:9b',
]
let resolvedModel: string | null = null
const REQUEST_TIMEOUT_MS = 180_000
const CIVIC_TRAIT_KEYS: (keyof CivicWeightVector)[] = [
  'economicInsecurity',
  'institutionalTrust',
  'automationShock',
  'authoritarianTendency',
  'conformity',
  'politicalAttention',
]

// --- In-memory cache (question → weights) ---
const weightCache = new Map<string, CivicWeightVector>()

// --- Neutral fallback weights (used if LLM fails) ---
const FALLBACK_WEIGHTS: CivicWeightVector = {
  economicInsecurity: 0.1,
  institutionalTrust: 0.1,
  automationShock: 0.0,
  authoritarianTendency: -0.1,
  conformity: 0.0,
  politicalAttention: 0.1,
}

// --- System prompt (used with /api/chat) ---
// World context is injected dynamically from WorldContextProvider
const BASE_SYSTEM_PROMPT = `You are a political analyst for a city simulation informed by REAL-WORLD events and data. Given a referendum question, determine how each citizen personality trait influences their vote. Use the world context provided below to ground your analysis in reality.

Assign a weight between -0.6 and +0.6 for each trait. Positive = pushes toward YES, negative = pushes toward NO, zero = irrelevant.

Traits:
1. economicInsecurity (0=secure, 1=very insecure)
2. institutionalTrust (0=distrust, 1=high trust)
3. automationShock (0=unaffected, 1=severely impacted by automation)
4. authoritarianTendency (0=libertarian, 1=authoritarian)
5. conformity (0=independent, 1=follows group)
6. politicalAttention (0=apathetic, 1=very engaged)

Respond with ONLY a JSON object, nothing else.`

function buildSystemPrompt(): string {
  const worldCtx = getWorldContextString()
  if (!worldCtx) return BASE_SYSTEM_PROMPT
  return `${BASE_SYSTEM_PROMPT}\n\n${worldCtx}`
}

// --- Build user message ---
function buildUserMessage(question: string): string {
  return `Referendum question: "${question}"

Use the real-world context above to inform your weight assignments.
Assign a weight between -0.6 and +0.6 for each trait based on this question.
Return ONLY the JSON object with your chosen weights.`
}

// --- Parse LLM response into CivicWeightVector ---
// Strategy 1: Extract a JSON object from the text
function parseWeightsFromJSON(text: string): CivicWeightVector | null {
  try {
    // Strip Qwen3.5 thinking tags if present
    const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    // Try multi-line JSON match (Qwen3.5 may format with newlines)
    const jsonMatch = cleaned.match(/\{[\s\S]*?"politicalAttention"[\s\S]*?\}/)
      ?? cleaned.match(/\{[^}]+\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    return validateWeights(parsed)
  } catch {
    return null
  }
}

// Strategy 2: Extract weights from prose (Qwen3.5 thinking outputs "trait: +0.3")
function parseWeightsFromProse(text: string): CivicWeightVector | null {
  const weights: Partial<CivicWeightVector> = {}
  for (const key of CIVIC_TRAIT_KEYS) {
    // Match patterns like: economicInsecurity: -0.2, economicInsecurity: +0.3
    const pattern = new RegExp(key + '[:\\s]*([+-]?\\d+\\.?\\d*)', 'i')
    const m = text.match(pattern)
    if (m) {
      weights[key] = Math.max(-0.6, Math.min(0.6, parseFloat(m[1])))
    }
  }
  return validateWeights(weights)
}

// Validate that all 6 keys are present and numeric
function validateWeights(obj: Partial<CivicWeightVector> | Record<string, unknown>): CivicWeightVector | null {
  const weights: Partial<CivicWeightVector> = {}
  for (const key of CIVIC_TRAIT_KEYS) {
    const val = (obj as Record<string, unknown>)[key]
    if (typeof val !== 'number' || !isFinite(val)) return null
    weights[key] = Math.max(-0.6, Math.min(0.6, val))
  }
  return weights as CivicWeightVector
}

// Combined parser: try JSON first, then prose extraction
function parseWeights(raw: string): CivicWeightVector | null {
  return parseWeightsFromJSON(raw) ?? parseWeightsFromProse(raw)
}

// ============================================================
// Resolve which model to use (picks first available candidate)
// ============================================================
async function resolveModel(): Promise<string | null> {
  if (resolvedModel) return resolvedModel
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
    if (!res.ok) return null
    const data = await res.json()
    const available = new Set<string>(
      (data.models ?? []).map((m: { name: string }) => m.name)
    )
    for (const candidate of OLLAMA_MODEL_CANDIDATES) {
      if (available.has(candidate)) {
        resolvedModel = candidate
        console.log(`[LocalLLMBridge] Using model: ${candidate}`)
        return candidate
      }
    }
    // No candidate matched — use first available model as last resort
    if (available.size > 0) {
      resolvedModel = [...available][0]
      console.log(`[LocalLLMBridge] No preferred model found, using: ${resolvedModel}`)
      return resolvedModel
    }
    return null
  } catch {
    return null
  }
}

// ============================================================
// Main API: generate weight vector from a referendum question
// Returns cached result if available. Falls back to neutral on error.
// ============================================================
export async function generateWeightsFromQuestion(
  question: string,
): Promise<{ weights: CivicWeightVector; fromLLM: boolean }> {
  const cacheKey = question.trim().toLowerCase()

  // Check cache first
  const cached = weightCache.get(cacheKey)
  if (cached) return { weights: cached, fromLLM: false }

  // Resolve model
  const model = await resolveModel()
  if (!model) {
    console.warn('[LocalLLMBridge] No model available, using fallback')
    return { weights: { ...FALLBACK_WEIGHTS }, fromLLM: false }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    // Use /api/chat with /no_think to disable Qwen3.5 thinking mode
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserMessage(question) },
        ],
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 1024,
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      console.warn(`[LocalLLMBridge] Ollama returned ${response.status}, using fallback`)
      return { weights: { ...FALLBACK_WEIGHTS }, fromLLM: false }
    }

    const data = await response.json()
    // Qwen3.5 may put output in thinking field instead of content
    // Try content first, then thinking, then fallback to generate-style response
    const rawText: string =
      data.message?.content ||
      data.message?.thinking ||
      data.response ||
      data.thinking ||
      ''

    const weights = parseWeights(rawText)
    if (weights) {
      weightCache.set(cacheKey, weights)
      return { weights, fromLLM: true }
    }

    console.warn('[LocalLLMBridge] Failed to parse LLM response, using fallback:', rawText.slice(0, 200))
    return { weights: { ...FALLBACK_WEIGHTS }, fromLLM: false }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('abort')) {
      console.warn('[LocalLLMBridge] Request timed out, using fallback')
    } else {
      console.warn('[LocalLLMBridge] Ollama unavailable, using fallback:', msg)
    }
    return { weights: { ...FALLBACK_WEIGHTS }, fromLLM: false }
  }
}

// --- Check if Ollama is reachable ---
export async function checkOllamaStatus(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

// --- Clear cache (useful for testing) ---
export function clearWeightCache(): void {
  weightCache.clear()
}
