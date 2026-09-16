<template>
  <transition name="fade">
    <div
      v-if="open"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-[2px]"
      @mousedown.self="onCancel"
    >
      <transition name="pop" appear>
        <div class="w-[380px] bg-[var(--c-surface)] rounded-xl shadow-[0_12px_48px_rgba(0,0,0,0.16)] p-6">
          <h3 class="text-[15px] font-medium text-[var(--c-ink)] mb-2">{{ title }}</h3>
          <p v-if="message" class="text-[12.5px] leading-relaxed text-[var(--c-sub)] mb-4">
            {{ message }}
          </p>

          <input
            v-if="mode === 'prompt'"
            ref="inputEl"
            v-model="draft"
            class="w-full h-9 px-3 mb-4 rounded-lg bg-[var(--c-field)] outline-none text-[13px] text-[var(--c-ink)] focus:ring-1 focus:ring-[var(--color-ds)]/50"
            :placeholder="placeholder"
            @keydown.enter.prevent="onConfirm"
            @keydown.esc.prevent="onCancel"
          />

          <p v-if="hint" class="text-[11.5px] text-[#c0392b] mb-4 -mt-2">{{ hint }}</p>

          <div class="flex justify-end gap-2">
            <button class="btn-text" @click="onCancel">取消</button>
            <button v-if="altText" class="btn-text" @click="emit('alt')">{{ altText }}</button>
            <button
              class="px-3.5 h-7 rounded-md text-[12.5px] text-white transition-colors"
              :class="danger ? 'bg-[#d9534f] hover:bg-[#c9302c]' : 'bg-ds hover:bg-ds-dark'"
              :disabled="mode === 'prompt' && !draft.trim()"
              @click="onConfirm"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

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

function onConfirm() {
  if (props.mode === 'prompt' && !draft.value.trim()) return
  emit('confirm', draft.value.trim())
}
function onCancel() {
  emit('cancel')
}
</script>
