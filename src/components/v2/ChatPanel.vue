<script setup lang="ts">
// --- Chat Panel ---
// Unified chat UI for individual agent or voting bloc conversations
// Connected to chatStore for state management
// Uses Ollama via AgentChatBridge for LLM responses

import { ref, nextTick, watch } from 'vue'
import { useChatStore } from '../../stores/chatStore'

const chat = useChatStore()
const inputText = ref('')
const messagesContainer = ref<HTMLDivElement | null>(null)

// Auto-scroll to bottom when new messages arrive
watch(
  () => chat.messages.length,
  async () => {
    await nextTick()
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  },
)

// Also scroll during streaming
watch(
  () => chat.streamingText,
  async () => {
    await nextTick()
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  },
)

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chat.isLoading) return
  inputText.value = ''
  await chat.sendMessage(text)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <Transition name="chat-slide">
    <div v-if="chat.isOpen" class="chat-panel">
      <!-- Header -->
      <div class="chat-header">
        <span class="chat-header__title">{{ chat.chatTitle }}</span>
        <button class="chat-header__close" @click="chat.closeChat()" title="Close chat">✕</button>
      </div>

      <!-- Error banner -->
      <div v-if="chat.error" class="chat-error">
        {{ chat.error }}
      </div>

      <!-- Messages -->
      <div ref="messagesContainer" class="chat-messages">
        <!-- Welcome message -->
        <div v-if="chat.messages.length === 0 && !chat.isLoading" class="chat-welcome">
          <template v-if="chat.mode === 'agent'">
            Ask this citizen anything about their life, work, opinions, or experiences.
          </template>
          <template v-else>
            Ask this voting group why they voted the way they did, what concerns them, or what they want.
          </template>
        </div>

        <!-- Message bubbles -->
        <div
          v-for="msg in chat.messages"
          :key="msg.id"
          class="chat-bubble"
          :class="msg.role === 'user' ? 'chat-bubble--user' : 'chat-bubble--assistant'"
        >
          <div class="chat-bubble__content">{{ msg.content }}</div>
        </div>

        <!-- Streaming response -->
        <div v-if="chat.isLoading && chat.streamingText" class="chat-bubble chat-bubble--assistant">
          <div class="chat-bubble__content">{{ chat.streamingText }}<span class="chat-cursor">|</span></div>
        </div>

        <!-- Loading indicator -->
        <div v-if="chat.isLoading && !chat.streamingText" class="chat-loading">
          <span class="chat-loading__dot"></span>
          <span class="chat-loading__dot"></span>
          <span class="chat-loading__dot"></span>
        </div>
      </div>

      <!-- Input -->
      <div class="chat-input">
        <textarea
          v-model="inputText"
          class="chat-input__field"
          :placeholder="chat.mode === 'agent' ? 'Ask the citizen...' : 'Ask the group...'"
          :disabled="chat.isLoading || !chat.ollamaAvailable"
          rows="1"
          @keydown="handleKeydown"
        ></textarea>
        <button
          class="chat-input__send"
          :disabled="!inputText.trim() || chat.isLoading || !chat.ollamaAvailable"
          @click="handleSend"
          title="Send message"
        >
          ➤
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.chat-panel {
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 40px;
  right: 260px;
  width: 320px;
  bottom: 56px;
  z-index: 30;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-right: 2px solid rgba(91, 143, 185, 0.5);
  overflow: hidden;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.4);
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $space-sm $space-md;
  background: rgba(40, 40, 65, 0.95);
  border-bottom: 1px solid $border-color;
  min-height: 36px;

  &__title {
    font-size: 0.7rem;
    font-weight: 600;
    color: $text-secondary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    margin-right: $space-sm;
  }

  &__close {
    background: none;
    border: none;
    color: $text-muted;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: $radius-sm;
    &:hover { color: $text-primary; background: rgba(255,255,255,0.05); }
  }
}

.chat-error {
  padding: $space-xs $space-md;
  background: rgba(239, 83, 80, 0.15);
  color: #ef5350;
  font-size: 0.65rem;
  border-bottom: 1px solid rgba(239, 83, 80, 0.2);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: $space-sm;
  display: flex;
  flex-direction: column;
  gap: $space-sm;
}

.chat-welcome {
  text-align: center;
  color: $text-muted;
  font-size: 0.7rem;
  padding: $space-lg $space-md;
  line-height: 1.4;
}

.chat-bubble {
  max-width: 85%;
  padding: $space-sm $space-md;
  border-radius: $radius-md;
  font-size: 0.75rem;
  line-height: 1.45;
  word-wrap: break-word;

  &--user {
    align-self: flex-end;
    background: rgba(91, 143, 185, 0.25);
    color: $text-primary;
    border-bottom-right-radius: 2px;
  }

  &--assistant {
    align-self: flex-start;
    background: rgba(60, 60, 85, 0.6);
    color: $text-primary;
    border-bottom-left-radius: 2px;
  }

  &__content {
    white-space: pre-wrap;
  }
}

.chat-cursor {
  animation: blink 0.8s infinite;
  color: $color-accent;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.chat-loading {
  align-self: flex-start;
  display: flex;
  gap: 4px;
  padding: $space-sm $space-md;

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $text-muted;
    animation: bounce 1.2s infinite;

    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
  }
}

@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-6px); opacity: 1; }
}

.chat-input {
  display: flex;
  gap: $space-xs;
  padding: $space-sm;
  border-top: 1px solid $border-color;
  background: rgba(25, 25, 45, 0.8);

  &__field {
    flex: 1;
    background: $bg-input;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    color: $text-primary;
    font-size: 0.75rem;
    padding: $space-xs $space-sm;
    resize: none;
    outline: none;
    font-family: inherit;
    min-height: 28px;
    max-height: 80px;

    &:focus { border-color: $border-active; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
    &::placeholder { color: $text-muted; }
  }

  &__send {
    background: rgba(91, 143, 185, 0.3);
    border: 1px solid rgba(91, 143, 185, 0.4);
    border-radius: $radius-sm;
    color: $text-primary;
    font-size: 0.85rem;
    cursor: pointer;
    padding: $space-xs $space-sm;
    min-width: 32px;

    &:hover:not(:disabled) { background: rgba(91, 143, 185, 0.5); }
    &:disabled { opacity: 0.3; cursor: not-allowed; }
  }
}

// Slide transition
.chat-slide-enter-active,
.chat-slide-leave-active {
  transition: all 0.25s ease;
}
.chat-slide-enter-from,
.chat-slide-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
