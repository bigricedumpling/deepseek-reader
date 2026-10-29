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
    :class="{ 'has-left': fadeLeft, 'has-right': fadeRight, 'single-document': items.length === 1, 'is-gooing': gooMoving }"
    @wheel="onWheel"
    @scroll="updateFade"
  >
    <div v-if="items.length > 1" class="doc-tab-goo" :class="{ 'is-moving': gooMoving }" aria-hidden="true">
      <span class="doc-tab-goo-trail" :style="trailStyle" />
      <span class="doc-tab-goo-main" :style="blobStyle" />
    </div>
    <svg class="doc-tab-goo-defs" aria-hidden="true"><defs><filter id="doc-tab-goo" x="-30%" y="-70%" width="160%" height="240%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" /><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" result="goo" /><feComposite in="SourceGraphic" in2="goo" operator="atop" /></filter></defs></svg>
    <TransitionGroup name="tab" @before-leave="freezeLeaving" @after-enter="measure" @after-leave="measure">
      <div
        v-for="t in items"
        :key="t.file"
        :draggable="items.length > 1"
        @contextmenu.prevent.stop="openContext($event,t.file)"
        @keydown.shift.f10.prevent="openContext($event,t.file)"
        @dragstart="onDragStart($event, t.file)"
        @dragover.prevent="onDragOver($event, t.file)"
        @dragleave="onDragLeave($event, t.file)"
        @drop.prevent="onDrop($event, t.file)"
        @dragend="onDragEnd"
        class="doc-tab"
        :class="{
          'is-active': t.file === active,
          'is-dragging': dragging === t.file,
          'is-first-tab': items[0]?.file === t.file,
          'is-last-tab': items[items.length - 1]?.file === t.file
        }"
      >
        <span
          class="doc-drop-line"
          :class="{ 'is-visible': dropTarget?.file === t.file, 'is-after': dropTarget?.file === t.file && dropTarget.after }"
          aria-hidden="true"
        />
        <button
          class="doc-tab-main"
          :title="t.file"
          :draggable="items.length > 1"
          @click="onTabClick(t.file)"
          @auxclick="onAux($event, t.file)"
        >
          <ContentIcon v-if="t.icon" :value="t.icon" :size="16" />
          <span class="doc-tab-name">{{ t.name }}</span>
          <span v-if="t.dirty" class="doc-tab-dot" aria-hidden="true" />
        </button>
        <button
          v-if="items.length > 1"
          class="doc-tab-x"
          aria-label="关闭标签页"
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
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import ContentIcon from './ContentIcon.vue'
import { PhX } from '../icons/remix'

defineOptions({inheritAttrs:false})
const props = defineProps({
  /** [{ file, name, dirty }] */
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
  try { event.dataTransfer.setData('text/plain', file) } catch {}
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

const context=ref(null),contextPanel=ref(null)
let contextTrigger=null
async function openContext(event,file){
 const rect=event.currentTarget.getBoundingClientRect();contextTrigger=event.currentTarget.querySelector('button')
 const menuHeight=190
 context.value={file,x:Math.max(8,Math.min(event.type==='contextmenu'?event.clientX:rect.left,innerWidth-196)),y:Math.max(8,Math.min(event.type==='contextmenu'?event.clientY:rect.bottom,innerHeight-menuHeight))}
 await nextTick();contextPanel.value?.querySelector('button:not(:disabled)')?.focus()
}
function dismissContext(focus=false){context.value=null;if(focus)contextTrigger?.focus()}
function contextOutside(e){if(!contextPanel.value?.contains(e.target))dismissContext()}
function menuKey(e){if(e.key==='Escape'){e.preventDefault();dismissContext(true)}else if(e.key==='Tab')dismissContext();else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...contextPanel.value.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()}}
function closeGroup(kind){const file=context.value.file,index=props.items.findIndex(t=>t.file===file);const files=props.items.filter((t,i)=>kind==='current'?t.file===file:kind==='others'?t.file!==file:i>index).map(t=>t.file);dismissContext(true);emit('close-many',files)}
/** 键盘路径：右键菜单里左右移动，和拖拽共用同一个 reorder 事件。 */
function canMove(delta){if(!context.value)return false;const i=props.items.findIndex(t=>t.file===context.value.file);return i>=0&&i+delta>=0&&i+delta<props.items.length}
function moveTab(delta){const file=context.value?.file;const from=props.items.findIndex(t=>t.file===file);const to=from+delta;if(from<0||to<0||to>=props.items.length)return;const order=props.items.map(t=>t.file);[order[from],order[to]]=[order[to],order[from]];dismissContext(true);emit('reorder',order)}
onMounted(()=>{document.addEventListener('pointerdown',contextOutside);window.addEventListener('resize',contextOutside)})
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',contextOutside);window.removeEventListener('resize',contextOutside)})

const strip = ref(null)
const blobStyle = ref({ opacity: 0 })
const trailStyle = ref({ opacity: 0 })
const gooMoving = ref(false)
let gooTimer = 0
async function measureBlob() {
  await nextTick()
  const host = strip.value
  if (!host) return
  const activeEl = host.querySelector('.doc-tab.is-active:not(.tab-leave-active)')
  if (!activeEl || props.items.length < 2) { blobStyle.value = { opacity: 0 }; trailStyle.value = { opacity: 0 }; return }
  const next = {
    left: (activeEl.offsetLeft + 4) + 'px',
    top: (activeEl.offsetTop + 1) + 'px',
    width: (activeEl.offsetWidth - 8) + 'px',
    height: (activeEl.offsetHeight - 2) + 'px',
    opacity: 1
  }
  const prev = blobStyle.value
  const moved = prev.left !== undefined && (prev.left !== next.left || prev.top !== next.top || prev.width !== next.width)
  if (moved) {
    // 主块先走，尾块从旧位置慢半拍追上来；两个形状被 SVG goo 连在一起，
    // 中途就是 shwn 那种被拉长、再回弹的液滴，而不是一块灰底平移。
    gooMoving.value = true
    clearTimeout(gooTimer)
    gooTimer = setTimeout(() => { gooMoving.value = false }, 560)
    trailStyle.value = { ...prev, opacity: 1 }
    // 尾块不主动消失：它追到目标后正好压在主块下面，形状并集不变；
    // 下一次切换时它再从当前位置慢半拍出发。
    requestAnimationFrame(() => { trailStyle.value = { ...next, opacity: 1 } })
  }
  blobStyle.value = next
}
watch(() => [props.active, props.items.map(t => t.file + ':' + t.name + ':' + Boolean(t.dirty)).join('|')], measureBlob, { flush: 'post' })
onMounted(measureBlob)
onBeforeUnmount(() => clearTimeout(gooTimer))

/** 两侧还有没有看不见的标签：有就画一小段渐变，提示"这儿还能滚" */
const fadeLeft = ref(false)
const fadeRight = ref(false)

function freezeLeaving(el){el.style.width=el.offsetWidth+'px';el.style.left=el.offsetLeft+'px';el.style.top=el.offsetTop+'px'}
function measure() {
  updateFade()
  for(const el of strip.value?.querySelectorAll('.doc-tab-name')||[])el.classList.toggle('is-clipped',el.scrollWidth > el.clientWidth + 1)
}
function updateFade() {
  const el = strip.value
  if (!el) return
  // Measure the visible tabs' layout edge, not scrollWidth: a leaving tab is
  // absolute-positioned and would otherwise create a phantom overflow. The
  // 2px tolerance also absorbs fractional/Retina width rounding.
  const tabs = [...el.querySelectorAll('.doc-tab:not(.tab-leave-active)')]
  const contentRight = tabs.reduce((right, tab) => Math.max(right, tab.offsetLeft + tab.offsetWidth), 0)
  const scrollable = contentRight > el.clientWidth + 2
  fadeLeft.value = scrollable && el.scrollLeft > 1
  fadeRight.value = scrollable && el.scrollLeft + el.clientWidth < contentRight - 2
}

/** 把当前这篇滚进可视区：标签开多了之后，切过去要能看见自己在哪 */
function scrollActiveIntoView(smooth = true) {
  const el = strip.value
  if (!el) return
  const tab = el.querySelector('.doc-tab.is-active:not(.tab-leave-active)')
  if (!tab) return
  const left = tab.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft
  const right = left + tab.offsetWidth
  const pad = 10
  if (left - pad < el.scrollLeft) {
    el.scrollTo({ left: Math.max(0, left - pad), behavior: smooth ? 'smooth' : 'auto' })
  } else if (right + pad > el.scrollLeft + el.clientWidth) {
    el.scrollTo({ left: right + pad - el.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
  }
}

watch(() => props.active, () => nextTick(() => scrollActiveIntoView()))
watch(
  () => props.items,
  () => nextTick(measure)
)

let observer = null

onMounted(() => {
  nextTick(() => {
    scrollActiveIntoView(false)
    measure()
  })
  // 窗口或侧栏变宽变窄时，遮罩要不要显示可能就变了；goo 底块也要重新对位
  observer = new ResizeObserver(() => { measure(); measureBlob() })
  if (strip.value) observer.observe(strip.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

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
  /* 关标签时那个要淡出的标签是绝对定位的，得有定位基准，不然会跳 */
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
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
  --fade-l: 18px;
}
.doc-tabs.has-right {
  --fade-r: 18px;
}

/* 开关标签、切换顺序时的过渡：位置变化靠 tab-move 平滑滑过去 */
.tab-enter-active,
.tab-leave-active,
.tab-move {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.tab-enter-from,
.tab-leave-to {
  opacity: 0;
  transform: translateX(6px) scale(0.96);
}
.doc-tab.tab-leave-active {
  /* Must beat .doc-tab position:relative: leaving tabs stop reserving space
     before TransitionGroup measures the remaining tabs for its FLIP move. */
  position: absolute;
}
.doc-tab-goo {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: .14;
  /* 静止时也保留 goo：动效结束后形状不跳回普通圆角矩形。 */
  filter: url(#doc-tab-goo);
}
.doc-tab-goo.is-moving {
  opacity: .14;
  filter: url(#doc-tab-goo);
}
.doc-tab-goo span {
  position: absolute;
  display: block;
  border-radius: 10px;
  background: var(--c-ink);
  will-change: left, top, width, height;
}
.doc-tab-goo-main {
  transition: left 340ms var(--motion-pop), top 280ms var(--motion-pop), width 300ms var(--motion-pop), height 280ms var(--motion-pop), opacity 180ms ease;
}
.doc-tab-goo-trail {
  transition: left 460ms var(--motion-snap), top 400ms var(--motion-snap), width 440ms var(--motion-snap), height 400ms var(--motion-snap), opacity 220ms ease;
}
.doc-tab-goo-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
.doc-tab {
  z-index: 1;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 32px;
  max-width: 220px;
  position: relative;
  border-radius: 16px;
  transition: background 0.15s;
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
  --smooth-fill: color-mix(in srgb, var(--c-ink) 10%, var(--c-surface));
  background: transparent !important;
  box-shadow: none;
}
.doc-tabs:not(.single-document) .doc-tab.is-active { --smooth-fill: transparent; }
.single-document .doc-tab.is-active {
  background: color-mix(in srgb, var(--c-ink) 14%, transparent);
}
/* 浮在封面上的顶栏里，标签条整体是一块玻璃；内部仍只给当前项画选框。 */
.doc-tabs.is-topbar-tabs { height: 28px; min-height: 0; }
.doc-tabs.is-topbar-tabs .doc-tab {
  height: 28px;
  border-radius: 14px !important;
}
/* hover 与选中共用同一个 goo 形状，只差透明度；这样圆角和液态边缘完全一致。 */
.doc-tabs.is-topbar-tabs .doc-tab::before {
  background: var(--c-ink) !important;
  border-radius: 10px !important;
  filter: url(#doc-tab-goo) !important;
  corner-shape: superellipse(2);
  opacity: 0;
  transition: opacity 140ms ease;
}
.doc-tabs.is-topbar-tabs .doc-tab:not(.is-active):hover::before {
  opacity: .06;
}
.doc-tabs.is-topbar-tabs .doc-tab:hover {
  background: transparent;
}
.doc-tabs.is-topbar-tabs .doc-tab.is-active {
  background: transparent !important;
}
.doc-tab-main {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  height: 100%;
  padding: 0 6px 0 10px;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--c-sub);
  cursor: pointer;
}
.doc-tab.is-active .doc-tab-main {
  color: var(--c-ink);
}
.doc-tab-name {
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
}
.doc-tab-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--c-accent);
  flex-shrink: 0;
}
.doc-tab-x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 7px;
  border-radius: var(--radius-control);
  color: var(--c-faint);
  opacity: 0;
  transition: opacity 0.15s;
}
.doc-tab:hover .doc-tab-x,
.doc-tab.is-active .doc-tab-x {
  opacity: 1;
}
.doc-tab-x:hover {
  background: color-mix(in srgb, var(--c-ink) 9%, transparent);
  color: var(--c-ink);
}
</style>

<style scoped>
.doc-tab:not(:last-child)::after{content:'';position:absolute;right:-1px;top:9px;bottom:9px;width:1px;background:color-mix(in srgb,var(--c-ink) 14%,transparent)}.doc-tab-name.is-clipped{mask-image:linear-gradient(to right,#000 calc(100% - 18px),transparent)}.doc-tab-main .content-icon{width:16px;height:16px}.doc-tab-x{flex-shrink:0}.doc-tabs:not(.has-left):not(.has-right){mask-image:none;-webkit-mask-image:none}
</style>
<style scoped>
.doc-tabs{min-height:36px}.doc-tab.tab-move{transition:transform 240ms cubic-bezier(.22,1,.36,1)!important}.doc-tab.tab-enter-active,.doc-tab.tab-leave-active{transition:opacity 180ms ease,transform 240ms cubic-bezier(.22,1,.36,1)!important}.doc-tab.tab-enter-from,.doc-tab.tab-leave-to{opacity:0;transform:translateY(5px) scale(.94)}.single-document .doc-tab{--smooth-fill:transparent!important;max-width:100%}
@media(prefers-reduced-motion:reduce){.doc-tab.tab-move,.doc-tab.tab-enter-active,.doc-tab.tab-leave-active{transition:none!important}}
</style>

<style scoped>.tab-context{position:fixed;z-index:180;width:188px;padding:5px;border-radius:12px}.tab-context button{display:block;width:100%;text-align:left;padding:8px 10px;font:12px var(--font-sans);color:var(--c-ink);border-radius:7px}.tab-context button:hover,.tab-context button:focus-visible{background:var(--c-hover);outline:0}.tab-context button:disabled{opacity:.35;background:none;cursor:default}</style>

<style scoped>
/* Keep the original switchbar, but give the active pill room to breathe. */
.doc-tabs{gap:12px}
.doc-tabs .doc-tab::before{inset:1px 4px;border-radius:10px!important;corner-shape:superellipse(2)}
.doc-tab-goo span{border-radius:10px}
.doc-tab:not(:last-child)::after{right:-7px}
</style>
