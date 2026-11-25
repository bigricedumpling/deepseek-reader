<template>
  <aside
    id="document-outline"
    ref="panel"
    aria-label="目录"
    :inert="collapsed"
    @keydown.esc.stop="closePanel(true)"
    class="toc-panel flex-shrink-0 flex relative overflow-hidden"
    :class="{ 'is-collapsed': collapsed, 'is-dragging': dragging }"
    :style="{ width: (collapsed ? 0 : width) + 'px' }"
  >
    <div class="flex-1 min-w-0 flex flex-col" :style="{ width: width + 'px' }">
      <!-- 顶栏悬浮在面板上方；Aa/… 通过 Teleport 落到左侧槽位，右上角只留目录收起。 -->
      <div class="toc-header h-10 flex-shrink-0"><span class="ui-font">目录</span></div>
      <button class="toc-collapse-chip" :class="{ 'is-open': !collapsed, 'is-flat': shellFlat, 'is-entering': chipEnter }" :style="{ pointerEvents: chipHot ? 'auto' : 'none' }" title="收起目录" aria-label="收起目录" @click="closePanel(true)"><PhCaretRight :size="16" /></button>

      <!-- 目录项 -->
      <nav ref="navEl" class="toc-scroll flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 pb-4">
        <div
          v-for="r in rows"
          :key="r.key"
          class="toc-row"
          :style="{ paddingLeft: r.depth * 11 + 'px' }"
        >
          <!-- 小三角：只给有子节的标题，收起/展开目录里的这一枝 -->
          <button
            v-if="r.children.length && isFoldable(r.key)"
            class="toc-fold"
            :class="{ 'is-folded': isFolded(r.key) }"
            :title="isFolded(r.key) ? '展开这一节' : '收起这一节'"
            :aria-label="r.title"
            :aria-expanded="!isFolded(r.key)"
            @click.stop="onToggle(r)"
          >
            <PhCaretDown :size="10" weight="bold" />
          </button>
          <span v-else class="toc-fold is-empty" />
          <button
            class="toc-item ui-font flex-1 min-w-0 text-left ui-round-control text-pretty"
            :class="[
              r.level === 3 ? 'px-2 py-1 text-[12.5px]' : 'px-2 py-1.5 text-[13.5px]',
              activeIndex === r.index ? 'is-active' : ''
            ]"
            :aria-current="activeIndex === r.index ? 'location' : undefined"
            @click="scrollTo(r.index)"
          >
            {{ r.title }}
          </button>
        </div>
        <p
          v-if="!toc.length"
          class="ui-font text-[12px] px-3 py-2 leading-relaxed"
          :class="tocError ? 'text-[#c0392b]' : 'text-[var(--c-faint)]'"
        >
          {{ tocError || (pdf ? '这篇 pdf 没有书签，正文里也没认出标题' : '这篇没有小节') }}
        </p>
      </nav>

      <!-- 阅读进度：pdf 的滚动在 iframe 里，量不到，就不显示 -->
      <div v-if="!pdf" class="px-5 pb-5 flex-shrink-0">
        <div class="flex items-center gap-2">
          <div class="toc-progress flex-1 overflow-hidden">
            <div class="toc-progress-fill h-full" :style="{ width: progress + '%' }" />
          </div>
          <span class="toc-percent ui-font text-[10.5px] text-[var(--c-faint)] tabular-nums">
            {{ progress }}%
          </span>

        </div>
      </div>
    </div>

    <!-- 拖拽条：调整目录宽度 -->
    <div
      v-show="!collapsed"
      class="toc-resize absolute inset-y-0 -left-1.5 w-3 cursor-col-resize group z-10"
      title="拖动调整目录宽度"
      @pointerdown="startResize"
    >
      <div
        class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-transparent group-hover:bg-[var(--c-line)] transition-colors"
      />
    </div>
  </aside>
</template>

<script setup>
import { createOutlinePosition } from '../utils/outline-position.js'
import { resizePanel } from '../utils/panel-resize'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { PhCaretDown, PhCaretRight } from '../icons/remix'
import { foldKey, foldDoc, isFolded, isFoldable, toggleFold, unfoldKeys } from '../utils/toc-fold'
import { scrollBehavior, scrollToTarget } from '../utils/scroll-target'

const props = defineProps({
  toc: { type: Array, default: () => [] },
  collapsed: { type: Boolean, default: false },
  width: { type: Number, default: 244 },
  /** 当前是 pdf：目录来自它的书签，点击是跳页不是滚动 */
  pdf: { type: Boolean, default: false },
  /** 目录标题旁边的一句小字，交代目录是哪来的 */
  note: { type: String, default: '' },
  /** 目录读不出来时的原因 */
  tocError: { type: String, default: '' },
  /** 当前文档路径：折叠状态是按文档记的 */
  docKey: { type: String, default: '' }
})
const panel = ref(null)
const compact = () => matchMedia('(max-width:720px)').matches
async function closePanel(returnFocus) {
  emit('update:collapsed', true)
  if (returnFocus) {
    await nextTick()
    const trigger = compact() ? '.doc-more > button' : '.rail-toc-handle'
    document.querySelector(trigger)?.focus({preventScroll:true})
  }
}
function outsidePanel(event) {
  if (!props.collapsed && compact() && !panel.value?.contains(event.target)) closePanel(false)
}
onMounted(() => document.addEventListener('pointerdown', outsidePanel, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outsidePanel, true))

const emit = defineEmits(['update:collapsed', 'update:width', 'update:dragging', 'go-page'])

/*
 * 目录树：把扁平的标题列表按层级挂成树，只影响**目录的显示**，正文一个字不动。
 * 长文目录一下拉得老长，找一个小节要在几十条里扫，所以给有子节的标题配一个收起的小三角。
 */
const tree = computed(() => {
  const seen = {}
  const flat = (props.toc || []).map((t, i) => {
    const foldTitle = t.foldTitle || t.title
    const k = t.level + '|' + foldTitle
    seen[k] = (seen[k] || 0) + 1
    return { ...t, index: i, key: foldKey(t.level, foldTitle, seen[k] - 1), children: [] }
  })
  const roots = []
  const stack = []
  for (const row of flat) {
    while (stack.length && stack[stack.length - 1].level >= row.level) stack.pop()
    if (stack.length) stack[stack.length - 1].children.push(row)
    else roots.push(row)
    stack.push(row)
  }
  return roots
})

/** 实际渲染出来的行：收起来的那一枝直接不渲染 */
const rows = computed(() => {
  const out = []
  const walk = (list, depth) => {
    for (const r of list) {
      out.push({ ...r, depth })
      if (r.children.length && (!isFoldable(r.key) || !isFolded(r.key))) walk(r.children, depth + 1)
    }
  }
  walk(tree.value, 0)
  return out
})

function onToggle(r) {
  toggleFold(r.key)
}

/** 当前读到的那一节如果被收在某个折叠标题下面，把它露出来（否则目录里找不到自己在哪） */
function revealIndex(index) {
  const path = []
  const find = (list, trail) => {
    for (const r of list) {
      if (r.index === index) {
        path.push(...trail)
        return true
      }
      if (r.children.length && find(r.children, [...trail, r.key])) return true
    }
    return false
  }
  find(tree.value, [])
  if (path.length) unfoldKeys(path)
}

/** 把当前那一行滚进目录的可视区：目录长的时候，靠它"快速找到自己在哪" */
function scrollActiveRow() {
  const nav = navEl.value
  if (!nav) return
  const el = nav.querySelector('.toc-item.is-active')
  if (!el) return
  const top = el.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop
  const h = el.offsetHeight
  let target
  if (top < nav.scrollTop + 10) target = Math.max(0, top - 10)
  else if (top + h > nav.scrollTop + nav.clientHeight - 10) target = top + h - nav.clientHeight + 10
  if (target !== undefined) {
    nav.scrollTo({ top: target, behavior: scrollBehavior(Math.abs(target - nav.scrollTop) < nav.clientHeight) })
  }
}

const activeIndex = ref(-1)
/** 目录滚动容器：把当前行滚进可视区要用它 */
const navEl = ref(null)
const progress = ref(0)
const dragging = ref(false)

/*
 * 收起按钮入场时仍带玻璃壳（此刻它还浮在文档上）；
 * 面板铺到它下面后再把壳溶掉，形成"交接"。关闭时先保持无壳滑出，落位后再恢复。
 */
const shellFlat = ref(!props.collapsed)
const chipEnter = ref(false)
const chipHot = ref(!props.collapsed)
let shellTimer = 0
let chipTimer = 0
function syncShell(open) {
  clearTimeout(shellTimer)
  clearTimeout(chipTimer)
  if (compact() || matchMedia('(prefers-reduced-motion:reduce)').matches) {
    chipHot.value = open
    shellFlat.value = open
    chipEnter.value = false
    return
  }
  if (open) {
    shellFlat.value = false
    // 首帧不播放入场动画：TOC 本来就是打开状态时（例如刷新页面）不要凭空滑一下。
    if (!chipEnter.value) chipEnter.value = true
    chipHot.value = false
    chipTimer = setTimeout(() => { chipHot.value = true }, 150)
    shellTimer = setTimeout(() => { shellFlat.value = true }, 240)
  } else {
    chipHot.value = false
    shellTimer = setTimeout(() => { shellFlat.value = false }, 380)
  }
}
watch(() => props.collapsed, v => syncShell(!v))
let scroller = null
let scrollFrame = 0
const outline = createOutlinePosition(onScroll)

/* ---------- 拖拽调宽 ---------- */

function startResize(e) {
  dragging.value = true
  emit('update:dragging', true)
  const startX=e.clientX, startW=props.width
  resizePanel(e, ev => emit('update:width', Math.max(180,Math.min(420,startW - (ev.clientX-startX)))), () => { dragging.value = false; emit('update:dragging', false) })
}

/* ---------- 当前位置跟随 ---------- */

/* 读到哪，目录就跟着露出来、滚过去 */
watch(activeIndex, (i) => {
  if (i < 0 || props.collapsed) return
  revealIndex(i)
  nextTick(scrollActiveRow)
})

/* 折叠状态按文档分开记 */
watch(
  () => props.docKey,
  (k) => {
    foldDoc.value = k || ''
    activeIndex.value = -1
    progress.value = 0
  },
  { immediate: true }
)

function onScroll() {
  if (!scroller || scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    if (!scroller) return
    const max = scroller.scrollHeight - scroller.clientHeight
    progress.value = max > 0 ? Math.min(100, Math.round(scroller.scrollTop / max * 100)) : 0
    activeIndex.value = outline.atViewport()
  })
}

function scrollTo(i) {
  // pdf：没有 DOM 标题可滚，交给 DocView 跳页
  if (props.pdf) {
    const page = props.toc[i] && props.toc[i].page
    activeIndex.value = i
    if (page) emit('go-page', page)
    if (compact()) closePanel(true)
    return
  }
  const el = outline.list()[i]
  if (!el || !scroller) return
  scrollToTarget(scroller, el)
  activeIndex.value = i
  if (compact()) closePanel(true)
}

/* ---------- 装配 ---------- */

function bindScroller(next) {
  if (next === scroller) return
  scroller?.removeEventListener('scroll', onScroll)
  cancelAnimationFrame(scrollFrame)
  scrollFrame = 0
  scroller = next
  outline.bind(next)
  scroller?.addEventListener('scroll', onScroll, { passive: true })
}
function setup() {
  bindScroller(props.collapsed || props.pdf ? null : document.getElementById('main-scroll-container'))
  onScroll()
}
onMounted(setup)
onBeforeUnmount(() => {
  bindScroller(null)
  clearTimeout(shellTimer)
  clearTimeout(chipTimer)
})
watch(() => [props.toc, props.collapsed, props.pdf, props.docKey], setup, { flush: 'post' })
watch(() => props.collapsed, collapsed => {
  if (collapsed && dragging.value) { dragging.value = false; emit('update:dragging', false) }
  if (!collapsed) nextTick(scrollActiveRow)
})
</script>

<style scoped>
.toc-header span { display: none; }
.toc-percent { width: 4ch; flex: none; text-align: right; }
.toc-panel {
  border-left: 1px solid var(--c-line-soft);
  transition: width 0.26s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.26s ease;
}
.toc-panel:not(.is-collapsed) { transition-delay: 140ms; }
.toc-panel.is-collapsed {
  border-left-width: 0;
}
/* 拖拽时不能有过渡，否则跟手会飘 */
.toc-panel.is-dragging {
  transition: none;
}
.toc-collapse-chip{position:fixed;top:4px;right:4px;z-index:35;display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:18px;corner-shape:var(--corner-ui);color:var(--c-sub);visibility:hidden;pointer-events:none;transform:translateX(40px) scale(.96);transition:transform 340ms var(--motion-pop),background 140ms ease,color 140ms ease,visibility 0s linear 340ms}
.toc-collapse-chip::before{content:'';position:absolute;inset:0;z-index:0;border-radius:inherit;corner-shape:inherit;background-color:var(--topbar-chip-bg);-webkit-backdrop-filter:var(--topbar-glass-filter);backdrop-filter:var(--topbar-glass-filter);box-shadow:var(--topbar-glass-shadow);pointer-events:none;transition:background-color 160ms ease,box-shadow 160ms ease}
.toc-collapse-chip svg{position:relative;z-index:1}
.toc-collapse-chip.is-open{visibility:visible;pointer-events:auto;transform:translateX(0) scale(1);transition-delay:0s,0s,0s,0s}
.toc-collapse-chip.is-open.is-entering{animation:toc-chip-in 340ms var(--motion-pop) 150ms backwards}
.toc-collapse-chip.is-open:hover{background:transparent;color:var(--c-ink);transform:translateY(-1px)}
.toc-collapse-chip.is-open:hover::before{background-color:var(--topbar-chip-bg-hover)}
/* 落进面板后，壳同样只淡颜色，不切 opacity。 */
.toc-collapse-chip.is-open.is-flat::before{background-color:transparent;box-shadow:0 2px 8px rgb(0 0 0 / 0),0 1px 2px rgb(0 0 0 / 0),inset 0 1px 0 rgb(255 255 255 / 0),inset 0 -1px 0 rgb(0 0 0 / 0);-webkit-backdrop-filter:blur(0) saturate(1);backdrop-filter:blur(0) saturate(1);transition:background-color 200ms cubic-bezier(.4,0,.2,1),box-shadow 200ms cubic-bezier(.4,0,.2,1),-webkit-backdrop-filter 0s,backdrop-filter 0s}
.toc-collapse-chip.is-open.is-flat:hover{background:color-mix(in srgb,var(--c-ink) 5%,transparent)}
@keyframes toc-chip-in{0%{opacity:0;transform:translateX(-32px) scale(.96)}14%{opacity:1}100%{opacity:1;transform:translateX(0) scale(1)}}

.toc-top {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-control);
  color: var(--c-faint);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, color 0.15s ease, background 0.15s ease;
}
.toc-top.is-shown {
  opacity: 1;
  pointer-events: auto;
}
.toc-top:hover {
  color: var(--c-ink);
  background: var(--c-hover);
}

.toc-row {
  display: flex;
  align-items: flex-start;
  gap: 1px;
}
/* 折叠小三角：收起时转 -90°，空位保留，标题才对得齐 */
.toc-fold {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 5px;
  border-radius: var(--radius-control);
  color: var(--c-faint);
  transition: transform 0.15s ease, color 0.15s ease;
}
.toc-fold:hover {
  color: var(--c-ink);
  background: var(--c-hover);
}
.toc-fold.is-folded {
  transform: rotate(-90deg);
}
.toc-fold.is-empty {
  pointer-events: none;
}
.toc-item {
  overflow-wrap:anywhere;
  color: var(--c-sub);
  transition: color 0.16s ease, background 0.16s ease;
  position: relative;
}
.toc-item:hover {
  color: var(--c-ink);
  background: var(--c-hover);
}
.toc-item.is-active {
  color: var(--c-accent);
}
.toc-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 12px;
  border-radius: 1px;
  background: var(--c-accent);
}
.toc-progress { height: 2px; border-radius: 999px; background: color-mix(in srgb, var(--c-line) 55%, transparent); }
.toc-progress-fill { border-radius: 999px; background: color-mix(in srgb, var(--c-accent) 28%, transparent); transition: width 180ms ease-out; }
@media (max-width:720px) {
  .toc-panel {
    position: fixed;
    z-index: var(--layer-popover);
    top: 50%;
    right: max(8px, env(safe-area-inset-right));
    width: min(288px, calc(100vw - 32px)) !important;
    max-height: min(70dvh, calc(100dvh - 112px));
    background: var(--c-pop);
    border: 1px solid var(--surface-menu-border);
    border-radius: var(--radius-surface);
    box-shadow: var(--surface-menu-shadow);
    transform: translateY(-50%);
    transition: opacity 140ms ease, visibility 0s;
  }
  .toc-panel.is-collapsed { opacity: 0; visibility: hidden; pointer-events: none; transition-delay: 0s, 140ms; }
  .toc-panel:not(.is-collapsed) { transition-delay: 0s; }
  .toc-panel > div:first-child { max-height: inherit; }
  .toc-header { display: flex; align-items: center; height: 48px; padding: 0 16px; }
  .toc-header span { display: inline; font-size: 13px; color: var(--c-sub); }
  .toc-panel .toc-collapse-chip { position: absolute; top: 2px; right: 4px; width: 44px; height: 44px; animation: none; transition: none; transform: none; }
  .toc-collapse-chip::before, .toc-resize { display: none; }
  .toc-scroll { flex: 0 1 auto; overscroll-behavior: contain; }
}
@media (max-width:720px), (hover:none), (pointer:coarse) {
  .toc-item, .toc-collapse-chip { min-height: 44px; }
  .toc-collapse-chip { min-width: 44px; }
  .toc-fold { width: 44px; height: 44px; margin: 0; }
  .toc-scroll:not(:has(button.toc-fold)) .toc-fold.is-empty { display: none; }
}
</style>

<style scoped>.toc-scroll{padding-bottom:28px;mask-image:linear-gradient(to bottom,#000 0,#000 calc(100% - 24px),transparent);-webkit-mask-image:linear-gradient(to bottom,#000 0,#000 calc(100% - 24px),transparent)}</style>
