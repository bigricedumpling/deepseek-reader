<template>
  <!--
    打开的文档，像浏览器标签一样排在这里。

    只显示文件名（和侧栏、磁盘上的名字一致），太长就渐隐；
    有未保存改动时点一个小点；点标签切换，点 × 关掉。
    只有一篇时呈现为普通标题，保留容器以完成增减标签的过渡。
  -->
  <div
    ref="strip"
    v-bind="$attrs"
    class="doc-tabs"
    role="navigation"
    aria-label="打开的文档"
    :class="{ 'has-left': fadeLeft, 'has-right': fadeRight, 'single-document': items.length === 1 }"
    @wheel="onWheel"
    @scroll="updateFade"
  >
    <TransitionGroup name="tab" @before-leave="prepareClose" @after-enter="measure" @after-leave="measure">
      <div
        v-for="t in items"
        :key="t.file"
        :draggable="items.length > 1"
        @contextmenu="openContext($event,t.file)"
        @keydown.shift.f10="openContext($event,t.file)"
        @dragstart="onDragStart($event, t.file)"
        @dragover.prevent="onDragOver($event, t.file)"
        @dragleave="onDragLeave($event, t.file)"
        @drop.prevent="onDrop($event, t.file)"
        @dragend="onDragEnd"
        class="doc-tab"
        :class="{
          'is-active': t.file === active,
          'has-context': Boolean(t.context),
          'is-dragging': dragging === t.file,
          'is-first-tab': items[0]?.file === t.file,
          'is-last-tab': items[items.length - 1]?.file === t.file
        }"
      >
        <span v-if="items.length > 1 && (t.file === active || t.file === departingFile)"
          class="doc-tab-indicator" :class="{ 'is-departing': t.file === departingFile && t.file !== active }" aria-hidden="true" />
        <span
          class="doc-drop-line"
          :class="{ 'is-visible': dropTarget?.file === t.file, 'is-after': dropTarget?.file === t.file && dropTarget.after }"
          aria-hidden="true"
        />
        <button
          class="doc-tab-main"
          :title="t.file"
          :aria-current="t.file === active ? 'page' : undefined"
          :aria-label="[t.name, t.context, t.dirty ? '有未保存的更改' : ''].filter(Boolean).join('，')"
          @keydown="navigate($event, t.file)"
          :draggable="items.length > 1"
          @click="onTabClick(t.file)"
          @auxclick="onAux($event, t.file)"
        >
          <ContentIcon v-if="t.icon" :value="t.icon" :size="16" />
          <span class="doc-tab-name">{{ t.name }}</span>
          <small v-if="t.context" class="doc-tab-context">{{ t.context }}</small>
          <span class="doc-tab-dot" :class="{ 'is-pending': t.dirty }" aria-hidden="true" />
        </button>
        <button
          class="doc-tab-x"
          :disabled="items.length < 2"
          :aria-hidden="items.length < 2 || undefined"
          :aria-label="'关闭标签页，' + [t.name, t.context].filter(Boolean).join('，')"
          @click.stop="$emit('close', t.file)"
        >
          <PhX :size="11" />
        </button>
      </div>
    </TransitionGroup>
  </div>
  <Teleport to="body"><Transition name="pop"><div v-if="context" ref="contextPanel" class="tab-context side-menu" role="menu" aria-label="标签页操作" :style="{left:context.x+'px',top:context.y+'px'}" @keydown="menuKey">
    <button role="menuitem" :disabled="items.length<2" @click="closeGroup('current')">关闭标签页</button>
    <button role="menuitem" :disabled="items.length<2" @click="closeGroup('others')">关闭其他标签页</button>
    <button role="menuitem" :disabled="items.findIndex(t=>t.file===context.file)===items.length-1" @click="closeGroup('right')">关闭右侧标签页</button>
    <button role="menuitem" :disabled="!canMove(-1)" @click="moveTab(-1)">向左移动</button>
    <button role="menuitem" :disabled="!canMove(1)" @click="moveTab(1)">向右移动</button>
  </div></Transition></Teleport>
</template>

<script setup>
import { navigateMenu } from '../utils/navigate-menu'
import { scrollBehavior } from '../utils/scroll-target.js'
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import ContentIcon from './ContentIcon.vue'
import { PhX } from '../icons/remix'

defineOptions({inheritAttrs:false})
const props = defineProps({
  /** Open documents with optional icon, disambiguating context and save state. */
  items: { type: Array, default: () => [] },
  active: { type: String, default: '' }
})

const emit = defineEmits(['select', 'close', 'close-many', 'reorder'])

const dragging = ref(''), dropTarget = ref(null)
let suppressClickUntil = 0

/** 拖拽排序：只提交同一批标签的新顺序。 */
function onDragStart(event, file) {
  if (event.target.closest?.('.doc-tab-x')) { event.preventDefault(); return }
  dragging.value = file
  dropTarget.value = null
  suppressClickUntil = 0
  event.dataTransfer.effectAllowed = 'move'
  try { event.dataTransfer.setData('application/x-typocket-tab', '1') } catch {}
}
function onDragOver(event, file) {
  if (!dragging.value || dragging.value === file) { dropTarget.value = null; return }
  event.dataTransfer.dropEffect = 'move'
  const rect = event.currentTarget.getBoundingClientRect()
  dropTarget.value = { file, after: event.clientX >= rect.left + rect.width / 2 }
}
function onDragLeave(event, file) {
  if (dropTarget.value?.file === file && !event.currentTarget.contains(event.relatedTarget)) dropTarget.value = null
}
function onDrop(event, file) {
  const from = props.items.findIndex(item => item.file === dragging.value)
  const target = props.items.findIndex(item => item.file === file)
  if (from < 0 || target < 0 || from === target) { onDragEnd(); return }
  const order = props.items.filter(item => item.file !== dragging.value).map(item => item.file)
  const targetIndex = order.indexOf(file)
  if (targetIndex < 0) { onDragEnd(); return }
  const insertAt = dropTarget.value?.after ? targetIndex + 1 : targetIndex
  order.splice(insertAt, 0, dragging.value)
  emit('reorder', order)
  dragging.value = ''
  dropTarget.value = null
  suppressClickUntil = Date.now() + 180
}
function onDragEnd() {
  dragging.value = ''
  dropTarget.value = null
  suppressClickUntil = Date.now() + 180
}
function onTabClick(file) {
  if (dragging.value || Date.now() < suppressClickUntil) return
  emit('select', file)
}

function navigate(event, file) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const index = props.items.findIndex(tab => tab.file === file)
  const last = props.items.length - 1
  let next
  switch (event.key) {
    case 'ArrowLeft': next = Math.max(0, index - 1); break
    case 'ArrowRight': next = Math.min(last, index + 1); break
    case 'Home': next = 0; break
    case 'End': next = last; break
    default: return
  }
  event.preventDefault()
  if (next === index) return
  strip.value?.querySelectorAll('.doc-tab:not(.tab-leave-active) .doc-tab-main')[next]?.focus({ preventScroll: true })
  emit('select', props.items[next].file)
}

const context=ref(null),contextPanel=ref(null)
let contextTrigger=null
async function openContext(event, file) {
  if (props.items.length < 2) return
  event.preventDefault()
  event.stopPropagation()
  const rect = event.currentTarget.getBoundingClientRect()
  contextTrigger = event.currentTarget.querySelector('button')
  const pointer = event.type === 'contextmenu' && (event.clientX || event.clientY)
  const x = pointer ? event.clientX : rect.left
  const y = pointer ? event.clientY : rect.bottom
  context.value = { file, x:8, y:8 }
  await nextTick()
  const panel = contextPanel.value
  if (!panel || !context.value) return
  context.value.x = Math.max(8, Math.min(x, innerWidth - panel.offsetWidth - 8))
  context.value.y = Math.max(8, Math.min(y, innerHeight - panel.offsetHeight - 8))
  panel.querySelector('button:not(:disabled)')?.focus({ preventScroll:true })
}
function dismissContext(focus=false){context.value=null;if(focus)contextTrigger?.focus()}
function contextOutside(e){if(!contextPanel.value?.contains(e.target))dismissContext()}
function menuKey(event) {
  if (event.key === 'Escape') event.preventDefault()
  if (event.key === 'Escape' || event.key === 'Tab') dismissContext(true)
  else navigateMenu(event)
}
function closeGroup(kind){const file=context.value.file,index=props.items.findIndex(t=>t.file===file);const files=props.items.filter((t,i)=>kind==='current'?t.file===file:kind==='others'?t.file!==file:i>index).map(t=>t.file);dismissContext(true);emit('close-many',files)}
/** 键盘路径：右键菜单里左右移动，和拖拽共用同一个 reorder 事件。 */
function canMove(delta){if(!context.value)return false;const i=props.items.findIndex(t=>t.file===context.value.file);return i>=0&&i+delta>=0&&i+delta<props.items.length}
function moveTab(delta){const file=context.value?.file;const from=props.items.findIndex(t=>t.file===file);const to=from+delta;if(from<0||to<0||to>=props.items.length)return;const order=props.items.map(t=>t.file);[order[from],order[to]]=[order[to],order[from]];dismissContext(true);emit('reorder',order)}
onMounted(()=>{document.addEventListener('pointerdown',contextOutside);window.addEventListener('resize',contextOutside)})
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',contextOutside);window.removeEventListener('resize',contextOutside)})

const strip = ref(null)
// The pill is attached to the selected tab so scrolling, closing a neighbor and
// reordering carry it with its label. A selection change animates just this fill.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let previousPill = null
let sourceTab = null
let indicatorAnimation = null
const departingFile = ref(null)
let departureAnimation = null
function activePill() {
  return strip.value?.querySelector('.doc-tab.is-active:not(.tab-leave-active) .doc-tab-indicator')
}
function clearDeparture() {
  departureAnimation?.cancel()
  departureAnimation = null
  departingFile.value = null
}
function stopIndicator() {
  indicatorAnimation?.effect.target.classList.remove('is-stretching')
  indicatorAnimation?.cancel()
  indicatorAnimation = null
  clearDeparture()
  sourceTab = null
}
function onMotionPreference() {
  if (reducedMotion.matches) stopIndicator()
}

function readPill(pill) {
  if (!pill) return null
  const style = getComputedStyle(pill)
  return {
    rect: pill.getBoundingClientRect(),
    waist: parseFloat(style.getPropertyValue('--tab-waist')) || 0,
    opacity: Number(style.opacity)
  }
}

watch(() => props.active, (next, previous) => {
  const pill = activePill()
  previousPill = readPill(pill)
  // Capture both visible ends before Vue changes their roles on a quick return.
  if (previousPill && departingFile.value === next) {
    previousPill.returning = readPill(strip.value.querySelector('.doc-tab-indicator.is-departing'))
  }
  stopIndicator()
  sourceTab = pill?.parentElement
  if (pill && !reducedMotion.matches) departingFile.value = previous
}, { flush: 'pre' })

function fadeIndicator(pill) {
  stopIndicator()
  indicatorAnimation = pill.animate([{ opacity: 0 }, {}], { duration: 130, easing: 'ease-out' })
}

// A distant selection changes at its two endpoints. Keep each fill attached
// to its own tab so neither scrolling nor closing moves a ghost across labels.
function fadeAtEndpoints(pill, source, sourceVisible, direction) {
  const old = sourceTab?.querySelector('.doc-tab-indicator.is-departing')
  if (old && sourceVisible) {
    const start = presentedFrame(old, source)
    departureAnimation = old.animate([start, { ...start, opacity: 0 }],
      { duration: 135, easing: 'ease-out', fill: 'forwards' })
    const exit = departureAnimation
    exit.onfinish = () => { if (departureAnimation === exit) clearDeparture() }
  } else {
    clearDeparture()
  }
  const start = source.returning ? presentedFrame(pill, source.returning)
    : { opacity: 0, transform: `translateX(${-direction * 4}px) scale(.98, .96)` }
  indicatorAnimation = pill.animate([start, { transform: 'none' }], { duration: 180, easing: 'ease-out' })
}

function presentedFrame(pill, pose) {
  const base = pill.getBoundingClientRect()
  if (!base.width || !base.height) return { opacity: pose.opacity }
  const rect = pose.rect
  return {
    opacity: pose.opacity, transformOrigin: '0 0',
    transform: `translate(${rect.left - base.left}px, ${rect.top - base.top}px) scale(${rect.width / base.width}, ${rect.height / base.height})`
  }
}

// Closing a tab can select its successor in the same frame. Its slot is already
// moving toward the closing tab. Let the new highlight arrive with that slot.
function followClosingSlot() {
  const pill = activePill()
  if (!sourceTab || !pill || reducedMotion.matches) return false
  const closing = [...strip.value.querySelectorAll('.tab-leave-active')]
  const sourceLeaving = closing.includes(sourceTab)
  if (!sourceLeaving && !closing.some(tab => tab.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING)) return false
  if (sourceLeaving) sourceTab.classList.add('is-departing-selection')
  fadeIndicator(pill)
  return true
}

function moveIndicator() {
  const source = previousPill
  previousPill = null
  const from = source?.rect
  const startWaist = source?.waist || 0
  const host = strip.value
  const pill = activePill()
  if (!from?.width || !pill || reducedMotion.matches || !pill.animate) return clearDeparture()
  const to = pill.getBoundingClientRect()
  if (!to.width || !to.height) return clearDeparture()
  if (followClosingSlot()) return
  const viewport = host.getBoundingClientRect()
  const inView = rect => rect.right > viewport.left + 1 && rect.left < viewport.right - 1
  const leftTravel = to.left - from.left
  const rightTravel = to.right - from.right
  const centerY = (from.top + from.bottom - to.top - to.bottom) / 2
  const travel = Math.max(Math.abs(leftTravel), Math.abs(rightTravel))
  const nearLimit = Math.min(228, host.clientWidth * .7)
  if (source.returning || !inView(from) || !inView(to) || travel > nearLimit || !tabReveal(host, pill.parentElement).near) {
    fadeAtEndpoints(pill, source, inView(from), Math.sign(leftTravel + rightTravel))
    return
  }
  clearDeparture()
  if (travel + Math.abs(centerY) + Math.abs(from.height - to.height) < 0.5 && !startWaist) return

  // The front extends early; the rear holds on longer. Bound each by the
  // shortest edge journey so a reversal never sends an edge past its target.
  const movingRight = leftTravel > 0
  const stretch = leftTravel * rightTravel > 0
    ? Math.min(20, Math.min(Math.abs(leftTravel), Math.abs(rightTravel)) * 0.23, Math.min(from.width, to.width) * 0.27)
    : 0
  const startScale = from.height / to.height
  const frames = [0, .125, .25, .375, .5, .625, .75, .875, 1].map(progress => {
    const remaining = 1 - progress
    const tension = 4 * progress * remaining * stretch
    const front = tension * remaining
    const rear = tension * progress
    const x = -leftTravel * remaining - (movingRight ? rear : front)
    const width = from.width * remaining + to.width * progress + tension
    const scaleY = 1 + (startScale - 1) * remaining - tension * 0.0017
    return {
      offset: progress,
      transform: `translate(${x}px, ${centerY * remaining}px) scaleY(${scaleY})`,
      width: progress === 1 ? 'calc(100% - 4px)' : width + 'px',
      '--tab-waist': (startWaist * remaining + tension * 0.11) + 'px'
    }
  })
  frames[0].opacity = source.opacity
  pill.classList.add('is-stretching')
  indicatorAnimation = pill.animate(frames, {
    duration: Math.min(350, 220 + travel * 0.35),
    easing: getComputedStyle(host).getPropertyValue('--tab-motion-ease').trim()
  })
  indicatorAnimation.onfinish = () => pill.classList.remove('is-stretching')
}

onMounted(() => reducedMotion.addEventListener('change', onMotionPreference))
onBeforeUnmount(() => {
  reducedMotion.removeEventListener('change', onMotionPreference)
  stopIndicator()
})

/** 两侧还有没有看不见的标签：有就画一小段渐变，提示"这儿还能滚" */
const fadeLeft = ref(false)
const fadeRight = ref(false)

function prepareClose(tab) {
  // Keep the closing slot in the row so its siblings and the strip's right
  // edge travel together, including when only a single document remains.
  tab.style.setProperty('--closing-width', tab.offsetWidth + 'px')
  tab.style.setProperty('--closing-label-width', tab.querySelector('.doc-tab-main').offsetWidth + 'px')
  tab.inert = true
  nextTick(() => {
    if (indicatorAnimation?.playState === 'running') followClosingSlot()
  })
}
function measure() {
  updateFade()
  for(const el of strip.value?.querySelectorAll('.doc-tab-name')||[])el.classList.toggle('is-clipped',el.scrollWidth > el.clientWidth + 1)
}
function updateFade() {
  const el = strip.value
  if (!el) return
  // Ignore the closing slot when deciding whether more documents are hidden.
  // The 2px tolerance absorbs fractional width rounding.
  const tabs = [...el.querySelectorAll('.doc-tab:not(.tab-leave-active)')]
  const contentRight = tabs.reduce((right, tab) => Math.max(right, tab.offsetLeft + tab.offsetWidth), 0)
  const scrollable = contentRight > el.clientWidth + 2
  fadeLeft.value = scrollable && el.scrollLeft > 1
  fadeRight.value = scrollable && el.scrollLeft + el.clientWidth < contentRight - 2
}

// Track only a reveal we started, so changing selection can stop it while
// ordinary wheel and touch scrolling remain under the user's control.
let revealWatch = null
onBeforeUnmount(() => revealWatch?.abort())

function tabReveal(el, tab) {
  const left = tab.offsetLeft
  const right = left + tab.offsetWidth
  const pad = Math.max(0, Math.min(10, (el.clientWidth - tab.offsetWidth) / 2))
  let target = el.scrollLeft
  if (left - pad < target) target = Math.max(0, left - pad)
  else if (right + pad > target + el.clientWidth) target = right + pad - el.clientWidth
  target = Math.min(target, Math.max(0, el.scrollWidth - el.clientWidth))
  const distance = Math.abs(target - el.scrollLeft)
  return { target, distance, near: distance <= Math.min(96, el.clientWidth / 3) }
}
function scrollActiveIntoView(smooth = true) {
  const el = strip.value
  const tab = el?.querySelector('.doc-tab.is-active:not(.tab-leave-active)')
  if (!tab) return
  const { target, distance, near } = tabReveal(el, tab)
  if (distance < .5 && !(smooth && revealWatch)) return

  revealWatch?.abort()
  revealWatch = null
  const behavior = scrollBehavior(smooth && distance >= .5 && near)
  if (behavior === 'smooth') {
    const controller = new AbortController()
    revealWatch = controller
    const release = () => {
      controller.abort()
      if (revealWatch === controller) revealWatch = null
    }
    const options = { signal: controller.signal, passive: true }
    el.addEventListener('scrollend', () => {
      if (Math.abs(target - el.scrollLeft) < 1) release()
    }, options)
    el.addEventListener('wheel', release, options)
    el.addEventListener('touchmove', release, options)
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) {
        el.scrollTo({ left: target, behavior: 'instant' })
        release()
      }
    }, options)
  }
  // An instant request at the current position also interrupts an old native
  // smooth scroll when the newly selected tab is already in view.
  el.scrollTo({ left: target, behavior })
}

// Let TransitionGroup finish measuring tab positions before moving its scrollport.
// Otherwise a scroll can look like a reorder and animate every label a second time.
function revealAfterLayout(smooth) {
  const file = props.active
  nextTick(() => {
    if (file === props.active) scrollActiveIntoView(smooth)
  })
}
watch(() => props.active, () => {
  moveIndicator()
  revealAfterLayout(true)
}, { flush: 'post' })

let observer
function observeLayout() {
  if (!observer || !strip.value) return
  observer.disconnect()
  observer.observe(strip.value)
  strip.value.querySelectorAll('.doc-tab:not(.tab-leave-active)').forEach(el => observer.observe(el))
}
watch(() => props.items, (items, previous) => {
  const sameLayout = items.length === previous.length && items.every((tab, index) => {
    const old = previous[index]
    return old.file === tab.file && old.name === tab.name && old.context === tab.context && old.icon === tab.icon
  })
  if (sameLayout) return
  observeLayout()
  measure()
  if (items.length > previous.length && previous.some(tab => tab.file === props.active)) revealAfterLayout(false)
}, { flush: 'post' })

let previousStripWidth = 0
function onStripResize() {
  const host = strip.value
  if (!host) return
  const width = host.clientWidth
  if (width > 0 && (previousStripWidth === 0 || width < previousStripWidth)) {
    const active = host.querySelector('.doc-tab.is-active:not(.tab-leave-active)')
    if (active && !host.querySelector('.tab-leave-active')) {
      const left = active.offsetLeft - host.scrollLeft
      // A mobile file list hides the strip entirely. On desktop, keep a
      // visible tab in view without overriding a user's horizontal browsing.
      if (!previousStripWidth || (left >= -1 && left + active.offsetWidth <= previousStripWidth + 1)) {
        scrollActiveIntoView(false)
      }
    }
  }
  previousStripWidth = width
  measure()
}

onMounted(() => {
  observer = new ResizeObserver(onStripResize)
  observeLayout()
  scrollActiveIntoView(false)
})
onBeforeUnmount(() => observer?.disconnect())

/** 鼠标滚轮横着滚标签条：标签多了之后不用去够下面的滚动条 */
function onWheel(e) {
  const el = strip.value
  if (!el) return
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
  // 已经滚到头了就别拦这一次滚动：不然鼠标停在标签上时，正文/页面反而滚不动
  const atStart = el.scrollLeft <= 0
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
  if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return
  el.scrollLeft += e.deltaY
  e.preventDefault()
}

/** 中键点一下就关掉，跟浏览器一致 */
function onAux(e, file) {
  if (e.button === 1) {
    e.preventDefault()
    emit('close', file)
  }
}
</script>

<style scoped>
/*
 * 标签条本体。
 *
 * 两侧的渐变不是装饰：标签多了会横向滚，被遮住的那一边用一小段渐隐提示"还有"，
 * 只在真的溢出了才显示（靠 --fade-l / --fade-r 两个变量开关）。
 */
.doc-tabs {
  --fade-l: 0px;
  --fade-r: 0px;
  --tab-gap: 4px;
  --tab-motion-ease: cubic-bezier(.38,.08,.22,1);
  isolation: isolate;
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--tab-gap);
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 var(--fade-l), #000 calc(100% - var(--fade-r)), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 var(--fade-l), #000 calc(100% - var(--fade-r)), transparent 100%);
}
.doc-tabs::-webkit-scrollbar {
  display: none;
}
.doc-tabs.has-left {
  --fade-l: min(18px, 5%);
}
.doc-tabs.has-right {
  --fade-r: min(18px, 5%);
}

/* Reordering moves existing tabs. Closing a tab releases its space in flow. */
.doc-tab.tab-move { transition: transform 210ms var(--tab-motion-ease); }
.doc-tab.tab-enter-active { transition: opacity 140ms ease; }
.doc-tab.tab-enter-from { opacity: 0; }
.doc-tab.tab-leave-active {
  width: var(--closing-width);
  min-width: 0;
  max-width: none;
  overflow: hidden;
  pointer-events: none;
  transition: width 210ms var(--tab-motion-ease), margin-inline-end 210ms var(--tab-motion-ease), opacity 95ms ease-out;
}
.doc-tab.tab-leave-active .doc-tab-main { flex: 0 0 var(--closing-label-width); }
.doc-tab.tab-leave-to { width: 0; margin-inline-end: calc(-1 * var(--tab-gap)); opacity: 0; }
@property --tab-waist {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}
.doc-tab-indicator {
  position: absolute;
  inset: 1px 2px;
  z-index: -1;
  border-radius: var(--radius-row);
  corner-shape: var(--corner-ui);
  background: var(--tab-marker-color, var(--c-ink));
  opacity: var(--tab-marker-opacity, .14);
  pointer-events: none;
}
/* Resolve the curve from the animated length on each paint, including in WebKit. */
.doc-tab-indicator.is-stretching {
  clip-path: shape(from 0 0, hline to 12%,
    curve to 50% var(--tab-waist) with 28% 0 / 33% var(--tab-waist),
    curve to 88% 0 with 67% var(--tab-waist) / 72% 0,
    hline to 100%, vline to 100%, hline to 88%,
    curve to 50% calc(100% - var(--tab-waist)) with 72% 100% / 67% calc(100% - var(--tab-waist)),
    curve to 12% 100% with 33% calc(100% - var(--tab-waist)) / 28% 100%,
    hline to 0, close);
}
.tab-leave-active .doc-tab-indicator { visibility: hidden; }
.doc-tab {
  isolation: auto;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 32px;
  max-width: min(220px, 100%);
  position: relative;
  border-radius: 16px;
  transition: background 0.15s, max-width 180ms var(--motion-ease);
  cursor: grab;
}
.doc-tab.is-dragging { cursor: grabbing; opacity: .45; }
.doc-drop-line {
  position: absolute;
  left: -7px;
  top: 50%;
  width: 2px;
  height: 16px;
  margin-top: -8px;
  border-radius: 2px;
  background: var(--c-accent);
  opacity: 0;
  transform: scaleY(1);
  transform-origin: center;
  pointer-events: none;
  z-index: 2;
}
.doc-drop-line.is-visible { opacity: 1; }
.doc-drop-line.is-after { left: auto; right: -7px; }
/* 横向滚动容器会裁掉首尾标签外侧的线，首尾两端往内收 1px。 */
.doc-tab.is-first-tab .doc-drop-line { left: 1px; }
.doc-tab.is-last-tab .doc-drop-line.is-after { right: 1px; }
.doc-tab:hover {
  background: var(--c-hover);
}
.doc-tab.is-active {
  --smooth-fill: transparent;
  background: transparent !important;
  box-shadow: none;
}
/* The selection pill belongs to the active document in a multi-tab strip. */
.doc-tabs.is-topbar-tabs { height: 28px; min-height: 0; }
.doc-tabs.is-topbar-tabs .doc-tab {
  height: 28px;
  border-radius: 14px !important;
}
/* Hover belongs to the pointed tab. Selection is painted by the pill alone. */
.doc-tabs .doc-tab::before {
  inset: 1px 2px;
  background: var(--tab-marker-color, var(--c-ink)) !important;
  border-radius: var(--radius-row) !important;
  corner-shape: var(--corner-ui);
  filter: none;
  opacity: 0;
  transition: opacity 120ms ease;
}
@supports not (corner-shape: superellipse(2)) {
  .doc-tab-indicator, .doc-tabs .doc-tab::before { filter: url(#reader-superellipse); }
}
.doc-tabs .doc-tab.is-active::before { opacity: 0; transition: none; }
.doc-tabs .tab-leave-active.is-departing-selection::before {
  opacity: var(--tab-marker-opacity, .14);
  transition: none;
}
.doc-tabs .doc-tab:not(.is-active):hover::before {
  opacity: var(--tab-hover-opacity, .06);
}
.doc-tabs.is-topbar-tabs .doc-tab:hover {
  background: transparent;
}
.doc-tabs.is-topbar-tabs .doc-tab.is-active {
  background: transparent !important;
}
.doc-tab-main {
  position: relative;
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  height: 100%;
  padding: 0 12px 0 10px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--c-sub);
  cursor: pointer;
}
.doc-tab.is-active .doc-tab-main {
  color: var(--c-ink);
}
.doc-tab-name {
  /* The label keeps its advance when the selection moves, including Latin filenames. */
  font-weight: 500;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
}
.doc-tab-context {
  min-width: 0;
  flex-shrink: 0;
  max-width: min(7em, 45%);
  font-size: 10.5px;
  color: var(--c-sub);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.has-context .doc-tab-name { min-width: min(4em, 45%); }
.doc-tab-dot {
  position: absolute;
  inset-inline-end: 3px;
  top: calc(50% - 2px);
  pointer-events: none;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--c-sub);
  opacity: 0;
  transition: opacity 120ms ease;
}
.doc-tab-dot.is-pending {
  opacity: 1;
  transition-delay: 1200ms;
}
.doc-tab-main:focus-visible, .doc-tab-x:focus-visible {
  outline: 2px solid var(--c-focus);
  outline-offset: -2px;
}
.doc-tab-main { border-radius: inherit; }
@media (max-width:480px) {
  .doc-tabs.is-topbar-tabs .doc-tab-main { padding-inline:6px; }
  .doc-tabs.is-topbar-tabs .doc-tab-x { margin-inline-end:4px; }
}

.doc-tab:focus-within .doc-tab-x { opacity: 1; }
.doc-tab-x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 7px;
  border-radius: var(--radius-item);
  color: color-mix(in srgb, var(--c-ink) 83%, transparent);
  opacity: 0;
  overflow: hidden;
  transition: opacity 120ms ease, width 180ms var(--motion-ease), margin-inline-end 180ms var(--motion-ease);
}
.doc-tab-x svg { flex: none; }
.single-document .doc-tab .doc-tab-x:disabled { opacity: 0; pointer-events: none; }
/* Once the left slot has finished closing, release the final close-button
   space. Removing both ends at once can clamp scrollLeft in the wrong direction. */
.single-document:not(:has(.tab-leave-active)) .doc-tab-x:disabled {
  width: 0;
  margin-inline-end: 0;
}
.doc-tab:hover .doc-tab-x,
.doc-tab.is-active .doc-tab-x {
  opacity: 1;
}
.doc-tab-x:is(:hover, :focus-visible) {
  background: color-mix(in srgb, var(--c-ink) 9%, transparent);
  color: var(--c-ink);
}
</style>

<style scoped>
.doc-tab-name.is-clipped{mask-image:linear-gradient(to right,#000 calc(100% - min(14px,12%)),transparent)}.doc-tab-main .content-icon{width:16px;height:16px}.doc-tab-x{flex-shrink:0}.doc-tabs:not(.has-left):not(.has-right){mask-image:none;-webkit-mask-image:none}
</style>
<style scoped>
.doc-tabs { min-height: 36px; }
.single-document .doc-tab:not(.tab-leave-active) { max-width: 100%; }
@media (prefers-reduced-motion: reduce) {
  .doc-tab.tab-move, .doc-tab.tab-enter-active, .doc-tab.tab-leave-active,
  .doc-tab, .doc-tab .doc-tab-x { transition: none; }
  .doc-tab.tab-leave-active { display: none; }
  .single-document .doc-tab-x:disabled { width: 0; margin-inline-end: 0; }
}
</style>

<style scoped>.tab-context{position:fixed;z-index:180;width:min(188px,calc(100vw - 16px));max-height:calc(100dvh - 16px);overflow-y:auto;padding:5px;border-radius:12px}.tab-context button{display:block;width:100%;text-align:left;padding:8px 10px;font:12px var(--font-sans);color:var(--c-ink);border-radius:7px}.tab-context button:hover,.tab-context button:focus-visible{background:var(--c-hover);outline:0}.tab-context button:disabled{opacity:.35;background:none;cursor:default}</style>

<style scoped>
@media (forced-colors: active) {
  .doc-tabs:not(.single-document) .doc-tab.is-active {
    outline: 1px solid Highlight;
    outline-offset: -2px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .doc-tab-dot { transition-duration: 0s; }
  .doc-tabs .doc-tab::before { transition: none; }
}
</style>
