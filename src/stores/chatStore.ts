// ============================================================
// Chat Store — Pinia store for agent & bloc conversations
// Manages chat state, message history, and LLM interactions
// Two modes: 'agent' (single agent) or 'bloc' (voting group)
// ============================================================

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSimStore } from './v2SimulationStore'
import { useCivicStore } from './civicStore'
import type { Agent } from '../simulation/types'
import type { ChatMessage } from '../simulation/chat/AgentChatBridge'
import {
  buildAgentSystemPrompt,
  buildBlocSystemPrompt,
  sendChat,
  checkOllamaAvailable,
} from '../simulation/chat/AgentChatBridge'

export type ChatMode = 'agent' | 'bloc' | null
export type BlocType = 'YES' | 'NO' | 'UNDECIDED'

export interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export const useChatStore = defineStore('chat', () => {
  // --- State ---
  const mode = ref<ChatMode>(null)
  const targetAgentId = ref<string | null>(null)
  const targetBloc = ref<BlocType | null>(null)
  const messages = ref<DisplayMessage[]>([])
  const isLoading = ref(false)
  const streamingText = ref('')
  const error = ref<string | null>(null)
  const ollamaAvailable = ref<boolean | null>(null)

  // --- Computed ---
  const isOpen = computed(() => mode.value !== null)

  const chatTitle = computed(() => {
    if (mode.value === 'agent' && targetAgentId.value) {
      const sim = useSimStore()
      const agent = sim.agents.find((a: Agent) => a.id === targetAgentId.value)
      if (agent) {
        const gLabel = agent.gender === 'male' ? '♂' : '♀'
        const relLabel = agent.religion ? ` · ${agent.religion.affiliation}` : ''
        return `${gLabel} Agent ${agent.id.slice(0, 6)} · ${agent.age}y · ${agent.state}${relLabel}`
      }
      return 'Agent Chat'
    }
    if (mode.value === 'bloc' && targetBloc.value) {
      const civic = useCivicStore()
      const blocAgents = getBlocAgents()
      const label = targetBloc.value === 'YES' ? '✅ YES Voters' : targetBloc.value === 'NO' ? '❌ NO Voters' : '🤷 Undecided'
      const q = civic.currentReferendum?.question?.slice(0, 40) || 'Referendum'
      return `${label} (${blocAgents.length}) · ${q}...`
    }
    return 'Chat'
  })

  // --- Helpers ---
  function getTargetAgent(): Agent | null {
    if (!targetAgentId.value) return null
    const sim = useSimStore()
    return sim.agents.find((a: Agent) => a.id === targetAgentId.value) ?? null
  }

  function getBlocAgents(): Agent[] {
    if (!targetBloc.value) return []
    const sim = useSimStore()
    const civic = useCivicStore()
    if (!civic.currentReferendum) return []

    const refId = civic.currentReferendum.id
    return sim.agents.filter((a: Agent) => {
      if (!a.opinionState || a.opinionState.referendumId !== refId) return false
      if (!a.opinionState.voted) return false
      if (targetBloc.value === 'YES') return a.opinionState.vote === 'YES'
      if (targetBloc.value === 'NO') return a.opinionState.vote === 'NO'
      return a.opinionState.vote === 'ABSTAIN' || a.opinionState.label === 'UNDECIDED'
    })
  }

  function buildConversationMessages(): ChatMessage[] {
    let systemPrompt = ''

    if (mode.value === 'agent') {
      const agent = getTargetAgent()
      if (!agent) return []
      systemPrompt = buildAgentSystemPrompt(agent)
    } else if (mode.value === 'bloc') {
      const blocAgents = getBlocAgents()
      const civic = useCivicStore()
      if (blocAgents.length === 0 || !civic.currentReferendum) return []
      systemPrompt = buildBlocSystemPrompt(blocAgents, targetBloc.value!, civic.currentReferendum)
    }

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ]

    for (const msg of messages.value) {
      chatMessages.push({
        role: msg.role,
        content: msg.content,
      })
    }

    return chatMessages
  }

  // --- Actions ---
  async function openAgentChat(agentId: string) {
    mode.value = 'agent'
    targetAgentId.value = agentId
    targetBloc.value = null
    messages.value = []
    error.value = null
    streamingText.value = ''

    // Check Ollama
    ollamaAvailable.value = await checkOllamaAvailable()
    if (!ollamaAvailable.value) {
      error.value = 'Ollama is not running. Start it with: ollama serve'
    }
  }

  async function openBlocChat(bloc: BlocType) {
    mode.value = 'bloc'
    targetBloc.value = bloc
    targetAgentId.value = null
    messages.value = []
    error.value = null
    streamingText.value = ''

    ollamaAvailable.value = await checkOllamaAvailable()
    if (!ollamaAvailable.value) {
      error.value = 'Ollama is not running. Start it with: ollama serve'
    }
  }

  function closeChat() {
    mode.value = null
    targetAgentId.value = null
    targetBloc.value = null
    messages.value = []
    isLoading.value = false
    streamingText.value = ''
    error.value = null
  }

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading.value) return
    error.value = null

    // Add user message
    messages.value.push({
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    })

    // Build full conversation
    const conversation = buildConversationMessages()
    if (conversation.length === 0) {
      error.value = 'No valid target for chat.'
      return
    }

    isLoading.value = true
    streamingText.value = ''

    try {
      const fullResponse = await sendChat(conversation, (token: string) => {
        streamingText.value += token
      })

      // Add assistant message
      messages.value.push({
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: fullResponse || streamingText.value,
        timestamp: Date.now(),
      })
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Chat failed'
    } finally {
      isLoading.value = false
      streamingText.value = ''
    }
  }

  return {
    // State
    mode,
    targetAgentId,
    targetBloc,
    messages,
    isLoading,
    streamingText,
    error,
    ollamaAvailable,
    // Computed
    isOpen,
    chatTitle,
    // Actions
    openAgentChat,
    openBlocChat,
    closeChat,
    sendMessage,
  }
})
