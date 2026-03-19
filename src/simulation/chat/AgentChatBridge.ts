// ============================================================
// AgentChatBridge — Ollama client for agent & bloc conversations
// Two modes:
//   1. Individual agent chat — user interviews a single agent in-character
//   2. Bloc chat — user interviews a voting bloc (YES/NO/UNDECIDED)
// Uses the same Ollama instance as LocalLLMBridge
// ============================================================

import type { Agent } from '../types'
import type { Referendum } from '../civic/types'

// --- Configuration ---
const OLLAMA_BASE_URL = 'http://localhost:11434'
const OLLAMA_MODEL_CANDIDATES = [
  'qwen2.5:7b',
  'qwen2.5:14b',
  'qwen3.5:9b',
]
let resolvedModel: string | null = null
const REQUEST_TIMEOUT_MS = 120_000

// --- Chat message type ---
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ============================================================
// Model resolution (shared with LocalLLMBridge pattern)
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
        console.log(`[AgentChatBridge] Using model: ${candidate}`)
        return candidate
      }
    }
    if (available.size > 0) {
      resolvedModel = [...available][0]
      console.log(`[AgentChatBridge] No preferred model, using: ${resolvedModel}`)
      return resolvedModel
    }
    return null
  } catch {
    return null
  }
}

// ============================================================
// Build system prompt for individual agent chat
// ============================================================
export function buildAgentSystemPrompt(agent: Agent): string {
  const genderLabel = agent.gender === 'male' ? 'man' : 'woman'
  const eduLabel = { low: 'basic education', medium: 'secondary education', high: 'university degree' }[agent.education] ?? agent.education

  // Life events summary (last 15 events)
  const recentEvents = agent.lifeEvents.slice(-15).map(e => `- ${e.description}`).join('\n')

  // Religion section
  let religionSection = ''
  if (agent.religion) {
    const r = agent.religion
    religionSection = `
Religion: ${r.affiliation} (religiosity: ${(r.religiosity * 100).toFixed(0)}%, practice: ${(r.practiceLevel * 100).toFixed(0)}%, community ties: ${(r.communityEmbeddedness * 100).toFixed(0)}%, discrimination felt: ${(r.discriminationExposure * 100).toFixed(0)}%)`
  }

  // Civic profile
  const cp = agent.civicProfile
  const civicSection = `
Civic traits: economic insecurity ${(cp.economicInsecurity * 100).toFixed(0)}%, institutional trust ${(cp.institutionalTrust * 100).toFixed(0)}%, automation shock ${(cp.automationShock * 100).toFixed(0)}%, authoritarian tendency ${(cp.authoritarianTendency * 100).toFixed(0)}%, conformity ${(cp.conformity * 100).toFixed(0)}%, political attention ${(cp.politicalAttention * 100).toFixed(0)}%`

  // Opinion state (if referendum active)
  let opinionSection = ''
  if (agent.opinionState) {
    const os = agent.opinionState
    opinionSection = `
Current referendum opinion: ${os.label} (score: ${os.score.toFixed(2)}, voted: ${os.voted ? os.vote : 'not yet'})`
  }

  // Family
  const familySection = agent.partnerId
    ? `Married with ${agent.children} child${agent.children !== 1 ? 'ren' : ''}.`
    : `Single${agent.children > 0 ? `, with ${agent.children} child${agent.children !== 1 ? 'ren' : ''}` : ''}.`

  return `You are a citizen in a city simulation. You must stay in character at all times and speak from your own personal experience and perspective. Never break character. Never say you are an AI.

Your identity:
- ${genderLabel}, age ${agent.age}, with ${eduLabel}
- Current status: ${agent.state}
- Wealth: $${Math.round(agent.wealth).toLocaleString()}, income: $${Math.round(agent.income).toLocaleString()}/week
- Satisfaction with life: ${(agent.satisfaction * 100).toFixed(0)}%
- ${familySection}
- Home: ${agent.homeOwned ? 'homeowner (mortgage paid off)' : agent.homeDebt > 0 ? `homeowner (mortgage: $${Math.round(agent.homeDebt)})` : 'renter'}
- Health: ${agent.isSick ? `sick for ${agent.ticksSick} weeks` : 'healthy'}${religionSection}${civicSection}${opinionSection}

Recent life events:
${recentEvents || '(no major events yet)'}

Behavior rules:
- Match the energy and length of the user's message. If they say "hi" or "salut", just reply "salut" or "bonjour" — nothing more.
- ONLY answer what is asked. NEVER volunteer extra information. NEVER ask questions back.
- Do NOT dump your life story unprompted. Only share details when specifically asked about them.
- Ground answers in your actual data above: wealth, job, satisfaction, life events, religion, civic traits, health, family.
- If your satisfaction is low, express frustration when asked. If high, show contentment when asked.
- Speak naturally as a real person would. Be concise, direct, authentic.
- Keep responses SHORT: 1-3 sentences max for most questions. Only elaborate if the question demands it.
- Use first person. Refer to your actual circumstances, never invent facts.
- No filler phrases like "that's a great question" or "I have a lot to tell you". Just answer.
- This is the FIRST conversation — do not pretend you have spoken before.`
}

// ============================================================
// Build system prompt for voting bloc chat
// ============================================================
export function buildBlocSystemPrompt(
  agents: Agent[],
  bloc: 'YES' | 'NO' | 'UNDECIDED',
  referendum: Referendum,
): string {
  const count = agents.length

  // Aggregate demographics
  const avgAge = agents.reduce((s, a) => s + a.age, 0) / count
  const avgWealth = agents.reduce((s, a) => s + a.wealth, 0) / count
  const avgSatisfaction = agents.reduce((s, a) => s + a.satisfaction, 0) / count
  const avgIncome = agents.reduce((s, a) => s + a.income, 0) / count

  // Education breakdown
  const eduCounts = { low: 0, medium: 0, high: 0 }
  agents.forEach(a => { eduCounts[a.education]++ })

  // Employment breakdown
  const stateCounts: Record<string, number> = {}
  agents.forEach(a => { stateCounts[a.state] = (stateCounts[a.state] || 0) + 1 })
  const stateStr = Object.entries(stateCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')

  // Religion breakdown (if any have religion)
  let religionStr = ''
  const relCounts: Record<string, number> = {}
  let totalReligiosity = 0
  let relCount = 0
  agents.forEach(a => {
    if (a.religion) {
      relCounts[a.religion.affiliation] = (relCounts[a.religion.affiliation] || 0) + 1
      totalReligiosity += a.religion.religiosity
      relCount++
    }
  })
  if (relCount > 0) {
    const relStr = Object.entries(relCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    religionStr = `
Religious affiliations: ${relStr}
Average religiosity: ${((totalReligiosity / relCount) * 100).toFixed(0)}%`
  }

  // Civic profile averages
  const avgCivic = {
    economicInsecurity: agents.reduce((s, a) => s + a.civicProfile.economicInsecurity, 0) / count,
    institutionalTrust: agents.reduce((s, a) => s + a.civicProfile.institutionalTrust, 0) / count,
    automationShock: agents.reduce((s, a) => s + a.civicProfile.automationShock, 0) / count,
    authoritarianTendency: agents.reduce((s, a) => s + a.civicProfile.authoritarianTendency, 0) / count,
    conformity: agents.reduce((s, a) => s + a.civicProfile.conformity, 0) / count,
    politicalAttention: agents.reduce((s, a) => s + a.civicProfile.politicalAttention, 0) / count,
  }

  // Sick count
  const sickCount = agents.filter(a => a.isSick).length

  // Homeowner ratio
  const ownerCount = agents.filter(a => a.homeOwned).length

  const blocLabel = bloc === 'YES' ? 'voted YES' : bloc === 'NO' ? 'voted NO' : 'were UNDECIDED'

  return `You represent a collective voice of ${count} citizens who ${blocLabel} on the referendum: "${referendum.question}".

You must speak as "we" — a unified group expressing your shared perspective. Never break character. Never say you are an AI.

Your group's demographics:
- ${count} citizens, average age ${avgAge.toFixed(0)}
- Average wealth: $${Math.round(avgWealth).toLocaleString()}, average income: $${Math.round(avgIncome).toLocaleString()}/week
- Average life satisfaction: ${(avgSatisfaction * 100).toFixed(0)}%
- Education: low ${eduCounts.low}, medium ${eduCounts.medium}, high ${eduCounts.high}
- Employment: ${stateStr}
- Health: ${sickCount} currently sick
- Housing: ${ownerCount} homeowners, ${count - ownerCount} renters${religionStr}

Average civic traits:
- Economic insecurity: ${(avgCivic.economicInsecurity * 100).toFixed(0)}%
- Institutional trust: ${(avgCivic.institutionalTrust * 100).toFixed(0)}%
- Automation shock: ${(avgCivic.automationShock * 100).toFixed(0)}%
- Authoritarian tendency: ${(avgCivic.authoritarianTendency * 100).toFixed(0)}%
- Conformity: ${(avgCivic.conformity * 100).toFixed(0)}%
- Political attention: ${(avgCivic.politicalAttention * 100).toFixed(0)}%

Behavior rules:
- Match the energy and length of the user's message. If they say "hi", just reply "salut" — nothing more.
- ONLY answer what is asked. NEVER volunteer extra information. NEVER ask questions back.
- Use "we" and "us" — you are a collective voice.
- Only explain your vote when specifically asked about it. Do NOT dump all your data unprompted.
- Ground answers in the group's actual data above: demographics, wealth, employment, satisfaction, religion, civic traits.
- Keep responses SHORT: 1-3 sentences max. Only elaborate if the question demands it.
- No filler phrases. Just answer directly.
- Never invent facts. Only reference the data provided about your group.
- This is the FIRST conversation — do not pretend you have spoken before.`
}

// ============================================================
// Send chat to Ollama (streaming via callback)
// ============================================================
export async function sendChat(
  messages: ChatMessage[],
  onToken?: (token: string) => void,
): Promise<string> {
  const model = await resolveModel()
  if (!model) {
    throw new Error('No Ollama model available. Make sure Ollama is running on localhost:11434.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: !!onToken,
        options: {
          temperature: 0.7,
          num_predict: 512,
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`)
    }

    // Streaming mode
    if (onToken && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        // Ollama streams JSON lines
        for (const line of chunk.split('\n')) {
          if (!line.trim()) continue
          try {
            const parsed = JSON.parse(line)
            const token = parsed.message?.content || ''
            if (token) {
              fullText += token
              onToken(token)
            }
          } catch {
            // skip malformed lines
          }
        }
      }
      return fullText
    }

    // Non-streaming mode
    const data = await response.json()
    const content: string =
      data.message?.content ||
      data.message?.thinking ||
      data.response ||
      ''

    // Strip Qwen3.5 thinking tags if present
    return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  } catch (err: unknown) {
    clearTimeout(timeout)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('abort')) {
      throw new Error('Chat request timed out. The model may be overloaded.')
    }
    throw new Error(`Ollama unavailable: ${msg}`)
  }
}

// ============================================================
// Check Ollama availability
// ============================================================
export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}
