<template>
  <div class="library-results" aria-label="全部知识库正文搜索结果">
    <p v-if="!query.trim()">输入要查找的正文</p>
    <p v-else-if="busy && !items.length" role="status">正在查找…</p>
    <p v-else-if="error" role="alert">{{ error }} <button @click="read(items.length)">重试</button></p>
    <p v-else-if="!items.length" role="status">没有找到包含这段文字的文档</p>
    <button v-for="hit in items" :key="hit.file" type="button" class="library-hit" @click="emit('pick', { ...hit, keyword: query.trim() })">
      <strong>{{ hit.name }}</strong><small>{{ hit.file.slice(0,hit.file.lastIndexOf('/')) }}</small>
      <span v-html="highlight(hit.text, query.trim())" />
    </button>
    <button v-if="more && !error" class="load" :disabled="busy" @click="read(items.length)">{{ busy ? '正在查找…' : '显示更多' }}</button>
  </div>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { API_BASE } from '../utils/api'
import { highlight } from '../utils/markdown'
const props = defineProps({ query: { type: String, required: true } })
const emit = defineEmits(['pick'])
const items = ref([]), busy = ref(false), more = ref(false), error = ref('')
let controller, timer
async function read(offset) {
  controller?.abort()
  const request = new AbortController()
  controller = request
  error.value = ''
  busy.value = true
  try {
    const params = new URLSearchParams({ q: props.query.trim(), view: 'documents', offset })
    const response = await fetch(API_BASE + '/api/search?' + params, { signal: request.signal })
    const result = await response.json()
    if (request.signal.aborted) return
    if (!result.ok) throw Error(result.error)
    items.value = offset ? [...new Map([...items.value, ...result.data.hits].map(hit => [hit.file,hit])).values()] : result.data.hits
    more.value = result.data.truncated
  } catch (cause) {
    if (!request.signal.aborted) error.value = cause.message || '查找失败'
  } finally { if (!request.signal.aborted) busy.value = false }
}
watch(() => props.query.trim(), q => {
  clearTimeout(timer)
  controller?.abort()
  items.value = []
  error.value = ''
  more.value = false
  busy.value = !!q
  if (q) timer = setTimeout(() => read(0), 250)
}, { immediate: true })
onBeforeUnmount(() => { clearTimeout(timer); controller?.abort() })
</script>
<style scoped>
.library-results{flex:1;min-height:0;overflow:auto;padding:0 9px 12px;color:var(--c-sub)}
.library-results p,.load{padding:8px;font-size:12px}
.library-hit{width:100%;display:grid;gap:2px;text-align:left;padding:7px 9px;border-radius:var(--radius-item)}
.library-hit:hover,.library-hit:focus-visible,.load:hover{background:var(--c-hover)}
.library-hit strong{font-size:13px;font-weight:550;color:var(--c-ink)}
.library-hit small,.library-hit span{font-size:11px;overflow-wrap:anywhere}
.library-hit span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.library-hit :deep(mark){background:var(--c-field);color:var(--c-ink);font-weight:650}
</style>
