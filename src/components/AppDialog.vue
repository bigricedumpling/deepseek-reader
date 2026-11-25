<template>
  <transition name="overlay">
    <div
      v-if="open"
      class="app-backdrop fixed inset-0 z-[100] flex items-center justify-center"
      @mousedown.self="onCancel"
    >
      <div ref="dialogEl" tabindex="-1" role="dialog" aria-modal="true" :aria-label="title" class="app-dialog w-[380px] bg-[var(--c-surface)] ui-round-dialog p-6">
        <h3 class="text-[15px] font-normal text-[var(--c-ink)] mb-2">{{ title }}</h3>
        <p v-if="message" class="text-[12.5px] leading-relaxed text-[var(--c-sub)] mb-4">
          <template v-for="(part, index) in message.split('/')" :key="index"><template v-if="index">/<wbr /></template>{{ part }}</template>
        </p>

        <input
          v-if="mode === 'prompt'"
          ref="inputEl"
          v-model="draft"
          class="w-full h-9 px-3 mb-4 ui-round-control bg-[var(--c-field)] outline-none text-[13px] text-[var(--c-ink)]"
          :placeholder="placeholder"
          @keydown.enter="confirmPrompt"
        />

        <p v-if="hint" role="alert" class="dialog-hint text-[11.5px] mb-4 -mt-2">{{ hint }}</p>

        <div class="dialog-actions">
          <button class="btn-text" @click="onCancel">取消</button>
          <button v-if="altText" class="btn-text" @click="emit('alt')">{{ altText }}</button>
          <button
            class="app-confirm px-3.5 h-7 ui-round-control text-[12.5px] transition-colors"
            :class="{ 'is-danger': danger }"
            :disabled="mode === 'prompt' && !draft.trim()"
            @click="onConfirm"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useDialogFocus } from '../composables/useDialogFocus'

const props = defineProps({
  open: { type: Boolean, default: false },
  mode: { type: String, default: 'confirm' },   // confirm | prompt
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  initial: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  altText: { type: String, default: '' },
  danger: { type: Boolean, default: false },
  hint: { type: String, default: '' }
})
const emit = defineEmits(['confirm', 'cancel', 'alt'])

const dialogEl = ref(null)
useDialogFocus(() => props.open, dialogEl, onCancel)
const draft = ref('')
const inputEl = ref(null)

watch(
  () => props.open,
  async (v) => {
    if (!v) return
    draft.value = props.initial
    if (props.mode === 'prompt') {
      await nextTick()
      inputEl.value?.focus()
      inputEl.value?.select()
    }
  }
)

function confirmPrompt(event) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  onConfirm()
}
function onConfirm() {
  if (props.mode === 'prompt' && !draft.value.trim()) return
  emit('confirm', draft.value.trim())
}
function onCancel() {
  emit('cancel')
}
</script>

<style scoped>
.app-backdrop { padding:12px; }
.app-dialog { min-width:0; max-width:100%; max-height:calc(100dvh - 24px); overflow:auto; overflow-wrap:anywhere; }
.app-dialog p { white-space:pre-line; }
.dialog-hint { color:var(--c-danger, #b33e39); }
.dialog-actions { display:flex; justify-content:flex-end; align-items:center; flex-wrap:wrap; gap:8px; }
.dialog-actions button { min-height:32px; height:auto; white-space:normal; }
.app-dialog button:focus-visible { outline:2px solid var(--c-focus); outline-offset:2px; }
@media (pointer:coarse) { .dialog-actions button { min-height:44px; } }

.app-confirm{background:var(--c-accent);color:var(--c-on-accent)}
.app-confirm:hover{background:var(--c-accent-hover)}
.app-confirm.is-danger{background:#c8403b;color:#fff}
.app-confirm.is-danger:hover{background:#ac302c}
.app-confirm:disabled{opacity:.38;cursor:default}
.app-dialog input:focus{outline:1.5px solid var(--c-focus);outline-offset:2px;box-shadow:none}
</style>
