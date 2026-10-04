<template>
  <Teleport to="body"><Transition name="overlay">
    <div v-if="open" class="reader-modal-shade" @mousedown.self="close">
      <section ref="dialog" tabindex="-1" class="reader-dialog version-history" role="dialog" aria-modal="true" aria-label="历史版本">
        <header><h2>历史版本</h2><button class="btn-icon" title="关闭" @click="close"><PhX :size="18" /></button></header>

        <p v-if="error" role="alert" class="reader-error">{{ error }}</p>
        <p v-if="loading" role="status">正在读取…</p>
        <p v-else-if="!items.length">这篇文档还没有历史版本。</p>
        <div v-else class="version-content">
          <nav aria-label="版本列表"><button v-for="item in items" :key="item.id" :aria-pressed="selected === item.id" @click="select(item.id)">{{ new Date(item.at).toLocaleString() }}</button></nav>
          <TextComparison v-if="content!==null" :before="content" :after="currentContent" /><p v-else class="version-hint">选择一个版本查看差异</p>
        </div>
        <footer><button :disabled="content === null || fetching || busy" class="reader-button" @click="restore">{{ busy ? '正在保存当前修改…' : '恢复此版本' }}</button></footer>
      </section>
    </div>
  </Transition></Teleport>
</template>
<script setup>
import { ref, watch } from 'vue'
import TextComparison from './TextComparison.vue'
import { PhX } from '@phosphor-icons/vue'
import { getHistory } from '../services/history'
import { useDialogFocus } from '../composables/useDialogFocus'
const props = defineProps({ open: Boolean, path: String, currentContent: String, preserveCurrent: Function })
const emit = defineEmits(['close', 'restore'])
const dialog = ref(null), items = ref([]), selected = ref(''), content = ref(null), loading = ref(false), fetching = ref(false), busy = ref(false), error = ref('')
let generation = 0, selection = 0
function close() { if (!busy.value) emit('close') }
useDialogFocus(() => props.open, dialog, close)
watch(() => [props.open, props.path], async () => {
  const current = ++generation; ++selection
  items.value = []; content.value = null; selected.value = ''; error.value = ''; fetching.value = false
  if (!props.open) return
  loading.value = true
  try { const result = await getHistory(props.path); if (current === generation) items.value = result.items }
  catch (e) { if (current === generation) error.value = e.message }
  finally { if (current === generation) loading.value = false }
})
async function select(id) {
  const current = ++selection, document = generation
  selected.value = id; content.value = null; fetching.value = true; error.value = ''
  try {
    const result = await getHistory(props.path,id)
    if (document === generation && current === selection) content.value = result.content
  } catch (e) { if (document === generation && current === selection) error.value = e.message }
  finally { if (document === generation && current === selection) fetching.value = false }
}
async function restore() {
  if (content.value === null || busy.value) return
  const originalPath = props.path, originalContent = content.value
  busy.value = true; error.value = ''
  try {
    if (props.preserveCurrent && !(await props.preserveCurrent())) throw Error('当前修改尚未保存，请先处理保存问题。')
    if (props.path !== originalPath || !props.open) return
    emit('restore', originalContent); emit('close')
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
</script>
<style scoped>
.version-history{width:min(780px,calc(100vw - 32px));max-height:calc(100dvh - 32px);display:flex;flex-direction:column;gap:16px;padding:24px;overflow:auto}
header,footer{display:flex;align-items:center;justify-content:space-between;gap:16px}h2{font-size:16px;margin:0}.version-hint,footer span{font-size:12px;color:var(--c-sub);margin:0}.version-content{display:grid;grid-template-columns:185px 1fr;gap:16px;min-height:0;height:360px}nav{overflow:auto;display:flex;flex-direction:column;gap:4px}nav button{text-align:left;padding:10px;border-radius:8px;font-size:12px}nav button[aria-pressed=true]{background:var(--c-field);color:var(--c-accent)}textarea{resize:none;width:100%;height:100%;padding:12px;border:0;border-radius:10px;background:var(--c-field);color:var(--c-ink);font:12px/1.7 monospace}button:disabled{opacity:.45;cursor:default}@media(max-width:560px){.version-history{padding:18px}.version-content{grid-template-columns:1fr;grid-template-rows:100px minmax(140px,1fr);height:50dvh}footer{align-items:flex-end}footer span{max-width:130px}}
</style>
