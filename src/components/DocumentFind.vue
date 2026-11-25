<template>
  <div class="doc-search-panel ui-font" role="search" aria-label="查找当前文档" @keydown.esc.stop.prevent="emit('close')">
    <div class="find-controls">
      <PhMagnifyingGlass :size="14" />
      <input ref="input" v-model="query" placeholder="查找当前文档" aria-label="查找当前文档" @keydown.enter.prevent="step($event.shiftKey ? -1 : 1)" />
      <small v-if="query.trim()" role="status">{{ active < 0 ? hits.length + ' 处' : (active + 1) + ' / ' + hits.length }}</small>
      <button aria-label="上一处" :disabled="!hits.length" @click="step(-1)"><PhCaretLeft :size="14" /></button>
      <button aria-label="下一处" :disabled="!hits.length" @click="step(1)"><PhCaretRight :size="14" /></button>
      <button aria-label="关闭查找" @click="emit('close')"><PhX :size="14" /></button>
    </div>
    <div v-if="query.trim()" ref="list" class="find-results" @scroll="extend">
      <p v-if="!hits.length">没有匹配</p>
      <button v-for="(hit, index) in hits.slice(start, end)" :key="index + start" class="search-hit" :aria-current="active === start + index || undefined" @click="choose(start + index, true)">
        <span>{{ hit.group.text.slice(Math.max(0, hit.start - 32), hit.start) }}<mark>{{ hit.group.text.slice(hit.start, hit.end) }}</mark>{{ hit.group.text.slice(hit.end, hit.end + 48) }}</span>
      </button>
    </div>
  </div>
</template>
<script setup>
import { ref, shallowRef, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { PhMagnifyingGlass, PhCaretLeft, PhCaretRight, PhX } from '../icons/remix'
import { findText, clearFindHighlight } from '../utils/find-text'
const props = defineProps({ scroller: Object })
const emit = defineEmits(['pick', 'close'])
const query = ref(''), hits = shallowRef([]), active = ref(-1)
const input = ref(null), list = ref(null), start = ref(0), end = ref(24)
let observer, scheduled, lastArticle
function refresh(reset = true) {
  cancelAnimationFrame(scheduled)
  const root = props.scroller
  const article = root?.querySelector('.source-reading .ProseMirror') || root?.querySelector('.editor-shell .ProseMirror')
  lastArticle = article
  const previous = hits.value[active.value]
  const matches = findText(article, query.value)
  hits.value = matches
  if (!reset && previous) {
    const retained = matches.findIndex(hit => hit.group.element === previous.group.element && hit.start === previous.start && hit.group.text === previous.group.text)
    if (retained >= 0) {
      active.value = retained
      if (!article.contains(previous.group.parts[0].node)) emit('pick', matches[retained], false)
      return
    }
  }
  active.value = -1
  start.value = 0
  end.value = 24
  if (list.value) list.value.scrollTop = 0
  clearFindHighlight()
}
watch(query, () => refresh(true))
onMounted(() => {
  input.value.focus()
  refresh()
  if (props.scroller) {
    observer = new MutationObserver(records => {
      if (!query.value || (lastArticle?.isConnected && !records.some(record => lastArticle.contains(record.target)))) return
      cancelAnimationFrame(scheduled)
      scheduled = requestAnimationFrame(() => refresh(false))
    })
    observer.observe(props.scroller, { subtree: true, childList: true, characterData: true })
  }
})
onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(scheduled) })
function extend() {
  const node = list.value
  if (node && node.scrollHeight - node.clientHeight - node.scrollTop < 50) end.value = Math.min(hits.value.length, end.value + 24)
}
async function choose(index, close) {
  const hit = hits.value[index]
  if (!hit) return
  active.value = index
  emit('pick', hit, close)
  if (close) return
  if (index < start.value || index >= end.value) {
    start.value = Math.max(0, index - 12)
    end.value = Math.min(hits.value.length, start.value + 24)
  }
  await nextTick()
  list.value?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
}
function step(direction) {
  const count = hits.value.length
  if (count) choose(active.value < 0 ? (direction < 0 ? count - 1 : 0) : (active.value + direction + count) % count, false)
}
</script>
<style scoped>
.find-controls{display:flex;align-items:center;gap:4px;min-height:32px;color:var(--c-sub)}
.find-controls input{flex:1;min-width:0;padding:5px 0;outline:none;font-size:12px}
.find-controls small{font-size:10px;font-variant-numeric:tabular-nums;white-space:nowrap}
.find-controls button{display:grid;place-items:center;width:26px;height:28px;border-radius:var(--radius-control)}
.find-controls button:hover,.search-hit:hover,.search-hit[aria-current=true]{background:var(--c-hover)}
.find-controls button:disabled{opacity:.35}
.find-results{max-height:min(40dvh,300px);overflow:auto;overscroll-behavior:contain}
.find-results p,.search-hit{font-size:12px;padding:6px;line-height:1.6}
.search-hit{display:block;width:100%;text-align:left;border-radius:var(--radius-control);overflow-wrap:anywhere}
mark{background:var(--c-field);color:var(--c-ink);font-weight:650}
@media(pointer:coarse){.find-controls button,.search-hit{min-height:40px}.find-controls button{min-width:35px}}
</style>
