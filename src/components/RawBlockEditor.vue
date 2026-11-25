<template>
  <Teleport to="body">
    <Transition name="overlay" appear @after-leave="afterLeave">
      <div v-if="visible" class="reader-modal-shade" @mousedown.self="close">
        <section ref="dialog" tabindex="-1" class="reader-dialog raw-editor" role="dialog" aria-modal="true" :aria-label="title">
          <header>
            <h2>{{ title }}</h2>
            <button type="button" class="btn-icon" aria-label="关闭" @click="close"><PhX :size="16" /></button>
          </header>
          <textarea v-model="draft" autofocus :aria-label="title" spellcheck="false" @keydown.ctrl.enter.prevent="save" @keydown.meta.enter.prevent="save" />
          <footer>
            <button type="button" @click="close">取消</button>
            <button type="button" class="reader-button" @click="save">保存</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref } from 'vue'
import { PhX } from '../icons/remix'
import { useDialogFocus } from '../composables/useDialogFocus'

const props = defineProps({ value: String })
const emit = defineEmits(['save', 'close'])
const draft = ref(props.value || '')
const title = computed(() => /^(---|\+\+\+)\r?\n/.test(props.value || '') ? '文档属性源码' : '内容块源码')
const dialog = ref(null)
const visible = ref(true)
let pendingSave = false

function close() { visible.value = false }
function save() {
  pendingSave = true
  close()
}
function afterLeave() {
  if (pendingSave) emit('save', draft.value)
  else emit('close')
}
useDialogFocus(() => visible.value, dialog, close)
</script>

<style scoped>
.reader-dialog.raw-editor {
  width: min(620px, 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.reader-dialog.raw-editor > header,
.reader-dialog.raw-editor > footer,
.reader-dialog.raw-editor textarea { margin: 0; }
.reader-dialog.raw-editor textarea {
  min-height: min(120px, 25dvh);
  height: clamp(120px, 40dvh, 360px);
  max-height: 60dvh;
  padding: 12px;
  color: var(--c-ink);
  font: 13px/1.65 var(--font-mono);
}
.reader-dialog.raw-editor textarea:focus-visible { outline: 2px solid var(--c-focus); outline-offset: 1px; }
.raw-editor footer { justify-content: flex-end; }
.raw-editor footer button { min-height: 32px; padding-inline: 12px; }
@media (pointer: coarse) { .raw-editor footer button { min-height: 44px; } }
</style>
