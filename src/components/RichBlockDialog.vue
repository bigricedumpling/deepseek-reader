<template>
  <Teleport to="body">
    <Transition name="overlay" appear @after-leave="emit('close')">
      <div v-if="visible" class="reader-modal-shade" @mousedown.self="close">
        <section ref="dialog" tabindex="-1" class="reader-dialog rich-editor" role="dialog" aria-modal="true" :aria-label="heading">
          <header>
            <h2>{{ heading }}</h2>
            <button type="button" class="btn-icon" aria-label="关闭" @click="close"><PhX :size="16" /></button>
          </header>
          <form class="rich-form" @submit.prevent="save">
            <div class="rich-fields">
              <label>内容形式
                <select v-model="value.type" :disabled="busy" @change="error = ''">
                  <option v-for="(label, type) in TYPES" :key="type" :value="type">{{ label }}</option>
                </select>
              </label>
              <template v-if="value.type === 'callout'">
                <label>符号<input v-model="value.icon" maxlength="8" class="icon-field" /></label>
                <label>内容<textarea v-model="value.content" autofocus /></label>
              </template>
              <template v-else-if="value.type === 'columns'">
                <label>左栏<textarea v-model="value.left" autofocus /></label>
                <label>右栏<textarea v-model="value.right" /></label>
              </template>
              <template v-else-if="value.type === 'figure'">
                <label class="file-field">
                  {{ busy ? '正在上传' : value.src ? '更换图片' : '选择图片' }}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" :disabled="busy" @change="upload" />
                </label>
                <label>图片说明<input v-model="value.caption" autofocus /></label>
                <label>替代文字<input v-model="value.alt" /></label>
                <label><span class="range-label">宽度 <span>{{ value.width }}%</span></span><input v-model.number="value.width" type="range" min="20" max="100" /></label>
                <label>对齐<select v-model="value.align"><option value="left">左</option><option value="center">中</option><option value="right">右</option></select></label>
              </template>
              <template v-else-if="value.type === 'card'">
                <label>文档
                  <select v-model="value.id" @change="pickDoc">
                    <option disabled value="">选择文档</option>
                    <option v-if="value.id && !store.allFiles.some(doc => doc.id === value.id)" :value="value.id">{{ value.title || value.id }}</option>
                    <option v-for="doc in store.allFiles" :key="doc.file" :value="doc.id">{{ doc.name }}</option>
                  </select>
                </label>
                <label>显示名称<input v-model="value.title" autofocus /></label>
                <label>说明<textarea v-model="value.description" /></label>
              </template>
              <p v-if="error" role="alert" class="reader-error">{{ error }}</p>
            </div>
            <footer>
              <button type="button" @click="close">取消</button>
              <button type="submit" class="reader-button" :disabled="busy">{{ initial ? '保存' : '插入' }}</button>
            </footer>
          </form>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { PhX } from '../icons/remix'
import { useDocsStore } from '../stores/docs'
import { useDialogFocus } from '../composables/useDialogFocus'
import { API_BASE } from '../utils/api'

const TYPES = { callout: '提示块', columns: '双栏内容', figure: '图片与说明', card: '文档卡片' }
const props = defineProps({ initial: Object })
const emit = defineEmits(['close'])
const store = useDocsStore()
const path = store.currentPath
const value = ref({
  version: 1, type: 'callout', icon: '💡', content: '', left: '', right: '', src: '',
  alt: '', caption: '', align: 'center', width: 100, id: '', title: '', description: '',
  ...props.initial?.value
})
const heading = computed(() => props.initial ? '编辑内容块' : '插入内容块')
const dialog = ref(null), visible = ref(true), busy = ref(false), error = ref('')
const controller = new AbortController()
function close() {
  controller.abort()
  visible.value = false
}
onBeforeUnmount(() => controller.abort())
useDialogFocus(() => visible.value, dialog, close)

function pickDoc() {
  value.value.title = store.allFiles.find(doc => doc.id === value.value.id)?.name || ''
  error.value = ''
}
function save() {
  if (busy.value) return
  if (value.value.type === 'figure' && !value.value.src) { error.value = '请先选择图片'; return }
  if (value.value.type === 'card' && !value.value.id) { error.value = '请选择文档'; return }
  window.dispatchEvent(new CustomEvent('reader-insert-block', {
    detail: { path, value: value.value, pos: props.initial?.pos, previous: props.initial?.raw }
  }))
  close()
}
async function upload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  event.target.value = ''
  busy.value = true
  error.value = ''
  try {
    if (file.size > 10 * 1024 * 1024) throw Error('图片不能超过 10 MB')
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(Error('无法读取图片'))
      reader.readAsDataURL(file)
    })
    const response = await fetch(API_BASE + '/api/asset', {
      method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, mime: file.type, base64: String(data).split(',')[1] })
    })
    const result = await response.json()
    if (!result.ok) throw Error(result.error || '图片上传失败')
    value.value.src = result.data.url
    value.value.alt = file.name
  } catch (err) {
    if (!controller.signal.aborted) error.value = err.message
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.reader-dialog.rich-editor {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}
.reader-dialog.rich-editor > header,
.rich-editor .rich-form footer,
.rich-editor .rich-fields :is(label, input, select, textarea, .reader-error) { margin: 0; }
.rich-form, .rich-fields { display: flex; flex-direction: column; min-height: 0; gap: 14px; }
.rich-fields { overflow-y: auto; overscroll-behavior: contain; padding: 3px; margin: -3px; min-width: 0; }
.rich-fields label { display: grid; gap: 5px; color: var(--c-sub); font-size: 12px; }
.rich-fields :is(input, select, textarea) { font: inherit; color: var(--c-ink); min-width: 0; }
.rich-fields :is(input, textarea, select):focus-visible,
.rich-fields .file-field:has(:focus-visible) { outline: 2px solid var(--c-focus); outline-offset: 1px; }
.rich-fields select { text-overflow: ellipsis; }
.rich-fields textarea { min-height: 72px; max-height: 38dvh; }
.rich-fields input.icon-field { width: 5em; }
.rich-fields .file-field {
  position: relative; align-self: flex-start; place-items: center; padding: 0 12px; min-height: 32px;
  color: var(--c-ink); background: var(--c-field); border-radius: var(--radius-control); cursor: pointer;
}
.file-field input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.range-label { display: flex; justify-content: space-between; }
.range-label > span { color: var(--c-faint); font-variant-numeric: tabular-nums; }
.rich-fields input[type=range] { width: 100%; accent-color: var(--c-accent); }
.rich-form footer { justify-content: flex-end; flex: none; }
.rich-form footer button { min-height: 32px; padding-inline: 12px; }
@media (pointer: coarse) {
  .rich-fields select, .rich-fields .file-field, .rich-form footer button { min-height: 44px; }
}
</style>
