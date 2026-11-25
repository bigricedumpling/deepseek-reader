<template>
  <nav v-if="items.length && !reader.tocOpen" class="rail-toc" aria-label="章节快捷导航" @pointerleave="clearHint" @keydown.esc="clearHint">
    <button type="button" class="rail-toc-handle" aria-label="展开文档目录" aria-expanded="false" aria-controls="document-outline"
      @pointerenter="hoverHint" @pointerleave="clearHint" @focus="focusHint" @blur="clearHint" @click.stop="emit('open')">
      <PhCaretLeft class="rail-caret" :size="16" />
      <PhListDashes class="rail-list-icon" :size="17" />
    </button>
    <div ref="stops" class="rail-toc-stops no-scrollbar" @scroll="onMarkerScroll">
      <button v-for="(item,i) in items" :key="i" class="rail-toc-stop" :class="{active:i===active}"
        :tabindex="i===active ? 0 : -1" :aria-label="item.title" :aria-current="i===active ? 'location' : undefined"
        @pointerenter="hoverHint" @focus="focusHint" @blur="clearHint" @keydown="moveFocus(i,$event)" @click.stop="go(i)">
        <span :style="{width:(item.level > 2 ? 9 : item.level === 2 ? 12 : 16)+'px'}" />
      </button>
    </div>
    <Teleport to="body"><Transition name="toc-hint"><div v-if="hint" class="rail-toc-hint ui-font" role="tooltip" :style="{top:hint.y+'px',right:hint.right+'px'}">{{ hint.title }}</div></Transition></Teleport>
  </nav>
</template>
<script setup>
import {ref, computed, watch, onMounted, onBeforeUnmount, nextTick} from 'vue'
import {PhCaretLeft,PhListDashes} from '../icons/remix'
import {useDocsStore} from '../stores/docs'
import {useReaderStore} from '../stores/reader'
import {unfoldKeys, foldKey} from '../utils/toc-fold'
import {createOutlinePosition} from '../utils/outline-position.js'
import {scrollToTarget} from '../utils/scroll-target'
const emit = defineEmits(['open'])
const store=useDocsStore(), reader=useReaderStore()
const hint=ref(null), active=ref(0), stops=ref(null)
const pdf=computed(()=>store.currentNode?.type==='pdf')
const items=computed(()=>pdf.value ? store.pdfToc : store.currentToc)
let scroller=null, frame=0
const outline = createOutlinePosition(onScroll)
let hintTimer
function clearHint() {
  clearTimeout(hintTimer)
  hint.value = null
}
function showHint(button) {
  if (!button.isConnected) return
  const rect = button.getBoundingClientRect()
  hint.value = {title:button.getAttribute('aria-label'), right:innerWidth - rect.left + 6, y:rect.top + rect.height / 2}
}
function hoverHint(event) {
  if (event.pointerType !== 'mouse') return
  clearHint()
  const button = event.currentTarget
  hintTimer = setTimeout(() => showHint(button), 220)
}
function focusHint(event) {
  if (event.currentTarget.matches(':focus-visible')) showHint(event.currentTarget)
}
function onMarkerScroll() {
  clearHint()
  const button = document.activeElement
  if (button?.parentElement !== stops.value || !button.matches(':focus-visible')) return
  const item = button.getBoundingClientRect(), list = stops.value.getBoundingClientRect()
  if (item.top >= list.top - 1 && item.bottom <= list.bottom + 1) showHint(button)
}
function moveFocus(index, event) {
  const keys = {ArrowDown:index + 1, ArrowUp:index - 1, Home:0, End:items.value.length - 1}
  if (!(event.key in keys)) return
  event.preventDefault()
  const next = Math.max(0, Math.min(items.value.length - 1, keys[event.key]))
  stops.value.children[next]?.focus()
}
function followActive() {
  const list = stops.value
  if (!list?.clientHeight || list.matches(':focus-within, :hover')) return
  const marker = list.children[active.value]
  if (!marker) return
  const top = marker.offsetTop
  if (top < list.scrollTop) list.scrollTop = top
  else if (top + marker.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + marker.offsetHeight - list.clientHeight
}

function sync() {
  frame = 0
  if (!stops.value?.clientHeight) return
  active.value = Math.max(0, pdf.value ? items.value.findLastIndex(t => t.page <= store.pdfPage) : outline.atViewport())
}
function onScroll() {
  if (!frame) frame = requestAnimationFrame(sync)
}
async function bind() {
  await nextTick()
  const next = stops.value?.clientHeight && !pdf.value ? document.getElementById('main-scroll-container') : null
  if (next !== scroller) {
    scroller?.removeEventListener('scroll', onScroll)
    scroller = next
    outline.bind(next)
    scroller?.addEventListener('scroll', onScroll, { passive: true })
  }
  cancelAnimationFrame(frame)
  sync()
  followActive()
}
async function go(i){
  await bind()
  if(pdf.value)store.pdfPage=items.value[i].page
  else {
    const seen={}, ancestors=[]
    for(const t of items.value.slice(0,i+1)){
      const label=t.foldTitle||t.title, k=t.level+'|'+label
      while(ancestors.length&&ancestors.at(-1).level>=t.level)ancestors.pop()
      ancestors.push({level:t.level,key:foldKey(t.level,label,seen[k]||0)})
      seen[k]=(seen[k]||0)+1
    }
    unfoldKeys(ancestors.map(t=>t.key))
    await nextTick()
    const h=outline.list()[i]
    scrollToTarget(scroller,h)
  }
  active.value=i
}
// Input capability can change while the viewport stays the same size. Only a
// visible marker list needs a document scroll listener and heading measurements.
const markerSize = new ResizeObserver(bind)
watch(stops, (list, previous) => {
  if (previous) markerSize.unobserve(previous)
  if (list) markerSize.observe(list)
}, { flush: 'post' })
watch(active, () => nextTick(followActive))
watch(()=>[store.currentPath,store.currentRaw,store.currentLoaded,store.pdfPage,reader.tocOpen],()=>{clearHint();bind()},{flush:'post'})
onMounted(() => { bind(); window.addEventListener('resize', bind) })
onBeforeUnmount(() => {
  clearHint()
  window.removeEventListener('resize', bind)
  markerSize.disconnect()
  scroller?.removeEventListener('scroll', onScroll)
  outline.bind(null)
  cancelAnimationFrame(frame)
})
</script>
<style scoped>
.rail-toc{display:flex;flex-direction:column;position:absolute;top:50%;right:6px;z-index:5;transform:translateY(-50%);width:32px;max-height:60vh;padding:4px 0}
.rail-toc-stops{position:relative;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.rail-list-icon{display:none}
.rail-toc-handle{flex:none;display:grid;place-items:center;width:32px;height:26px;margin-bottom:2px;border-radius:var(--radius-control);color:var(--c-sub);opacity:.78;transition:opacity 150ms ease,background-color 150ms ease,color 150ms ease}
.rail-toc-handle:is(:hover,:focus-visible){opacity:1;background:var(--c-hover);color:var(--c-ink)}
.rail-toc-stop{display:flex;justify-content:center;align-items:center;width:32px;height:15px;outline-offset:-2px}
.rail-toc-stop span{height:1.5px;flex-shrink:0;border-radius:2px;background:var(--c-faint);opacity:.36;transition:opacity .15s,background .15s}
.rail-toc-stop.active span{opacity:.85;background:var(--c-ink)}
.rail-toc-stop:hover span,.rail-toc-stop:focus-visible span{opacity:1;background:var(--c-accent)}
.rail-toc-hint{position:fixed;transform:translateY(-50%);max-width:min(280px,calc(100vw - 64px));padding:5px 10px;border-radius:8px;font-size:11.5px;line-height:1.5;pointer-events:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toc-hint-enter-active,.toc-hint-leave-active{transition:opacity 120ms ease}
.toc-hint-enter-from,.toc-hint-leave-to{opacity:0}
@media (max-width:720px), (hover:none), (pointer:coarse) {
  .rail-toc{right:0;width:44px;padding:0}
  .rail-toc-stops,.rail-caret{display:none}
  .rail-list-icon{display:block}
  .rail-toc .rail-toc-handle{width:44px;height:44px;margin:0;color:var(--c-sub);opacity:1}
  .rail-toc-handle::before{content:'';position:absolute;width:28px;height:32px;background:var(--c-panel);border-radius:8px;z-index:-1}
}
@media (max-width:720px) { .rail-toc{display:none} }
@media (prefers-reduced-motion:reduce) {
  .rail-toc-handle,.rail-toc-stop span,.toc-hint-enter-active,.toc-hint-leave-active{transition:none}
}
</style>
