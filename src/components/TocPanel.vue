<template>
  <aside
    class="toc-panel flex-shrink-0 flex relative overflow-hidden"
    :class="{ 'is-collapsed': collapsed, 'is-dragging': dragging }"
    :style="{ width: (collapsed ? 0 : width) + 'px' }"
  >
    <div class="flex-1 min-w-0 flex flex-col" :style="{ width: width + 'px' }">
      <!-- 头部 -->
      <div class="h-[56px] px-5 flex items-center flex-shrink-0">
        <span class="ui-font text-[12px] text-[var(--c-faint)] tracking-wide">目录</span>
        <span v-if="note" class="ui-font text-[10.5px] text-[var(--c-faint)] ml-2 opacity-70">{{ note }}</span>
        <button class="btn-icon ml-auto" title="收起目录" @click="emit('update:collapsed', true)">
          <PhSidebarSimple :size="15" weight="regular" />
        </button>
      </div>

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
          <div class="flex-1 h-px bg-[var(--c-line)] overflow-hidden">
            <div
              class="h-full bg-ds/50 transition-[width] duration-150 ease-out"
              :style="{ width: progress + '%' }"
            />
          </div>
          <span class="ui-font text-[10.5px] text-[var(--c-faint)] tabular-nums">
            {{ progress }}%
          </span>

        </div>
      </div>
    </div>

    <!-- 拖拽条：调整目录宽度 -->
    <div
      v-show="!collapsed"
      class="absolute inset-y-0 -left-1.5 w-3 cursor-col-resize group z-10"
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
import { resizePanel } from '../utils/panel-resize'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { PhSidebarSimple, PhArrowUp, PhCaretDown } from '@phosphor-icons/vue'
import { foldKey, foldDoc, isFolded, isFoldable, toggleFold, unfoldKeys } from '../utils/toc-fold'
import { scrollToTarget } from '../utils/scroll-target'

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
const emit = defineEmits(['update:collapsed', 'update:width', 'to-top', 'go-page'])

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
  const top = el.offsetTop
  const h = el.offsetHeight
  if (top < nav.scrollTop + 10) nav.scrollTo({ top: Math.max(0, top - 10), behavior: 'smooth' })
  else if (top + h > nav.scrollTop + nav.clientHeight - 10) {
    nav.scrollTo({ top: top + h - nav.clientHeight + 10, behavior: 'smooth' })
  }
}

const activeIndex = ref(-1)
/** 目录滚动容器：把当前行滚进可视区要用它 */
const navEl = ref(null)
const progress = ref(0)
const dragging = ref(false)
let scroller = null
let heads = []
let ticking = false

/* ---------- 拖拽调宽 ---------- */

function startResize(e) {
  dragging.value = true
  const startX=e.clientX, startW=props.width
  resizePanel(e, ev => emit('update:width', Math.max(180,Math.min(420,startW - (ev.clientX-startX)))), () => { dragging.value = false })
}

/* ---------- 当前位置跟随 ---------- */

/**
 * 正文现在由 ProseMirror 渲染，标题上没有 id，所以按 DOM 顺序跟目录一一对应。
 * 两者都来自同一篇文档，顺序必然一致。
 */
function collect() {
  if (!scroller) {
    heads = []
    return
  }
  heads = [...scroller.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(el=>!el.closest('.reader-rich-block'))
}

function syncActive() {
  if (!scroller || !heads.length) return
  const base = scroller.getBoundingClientRect().top
  let current = 0
  for (let i = 0; i < heads.length; i++) {
    if (heads[i].getBoundingClientRect().top - base <= 120) current = i
    else break
  }
  if (activeIndex.value !== current) activeIndex.value = current
}

/* 读到哪，目录就跟着露出来、滚过去 */
watch(activeIndex, (i) => {
  if (i < 0) return
  revealIndex(i)
  nextTick(scrollActiveRow)
})

/* 折叠状态按文档分开记 */
watch(
  () => props.docKey,
  (k) => {
    foldDoc.value = k || ''
  },
  { immediate: true }
)

function onScroll() {
  if (!scroller) return
  const max = scroller.scrollHeight - scroller.clientHeight
  progress.value = max > 0 ? Math.min(100, Math.round((scroller.scrollTop / max) * 100)) : 0
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    ticking = false
    syncActive()
  })
}

function scrollTo(i) {
  // pdf：没有 DOM 标题可滚，交给 DocView 跳页
  if (props.pdf) {
    const page = props.toc[i] && props.toc[i].page
    activeIndex.value = i
    if (page) emit('go-page', page)
    return
  }
  const el = heads[i]
  if (!el || !scroller) return
  scrollToTarget(scroller, el)
  activeIndex.value = i
}

/* ---------- 装配 ---------- */

function teardown() {
  if (scroller) scroller.removeEventListener('scroll', onScroll)
}

function setup() {
  teardown()
  scroller = document.getElementById('main-scroll-container')
  if (!scroller) return
  collect()
  scroller.addEventListener('scroll', onScroll, { passive: true })
  progress.value = 0
  activeIndex.value = -1
  onScroll()
  syncActive()
}

onMounted(() => nextTick(() => setTimeout(setup, 200)))
onBeforeUnmount(teardown)

watch(
  () => props.toc,
  async () => {
    activeIndex.value = -1
    progress.value = 0
    await nextTick()
    // 编辑器是异步渲染的，等它把标题铺进 DOM 再量
    setTimeout(setup, 400)
    setTimeout(setup, 1200)
  }
)
watch(
  () => props.collapsed,
  async (v) => {
    if (!v) {
      await nextTick()
      setTimeout(setup, 120)
    }
  }
)
</script>

<style scoped>
.toc-panel {
  border-left: 1px solid var(--c-line-soft);
  transition: width 0.26s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.26s ease;
}
.toc-panel.is-collapsed {
  border-left-color: transparent;
}
/* 拖拽时不能有过渡，否则跟手会飘 */
.toc-panel.is-dragging {
  transition: none;
}

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
  color: var(--c-sub);
  transition: color 0.16s ease, background 0.16s ease;
  position: relative;
}
.toc-item:hover {
  color: var(--c-ink);
  background: var(--c-hover);
}
.toc-item.is-active {
  color: var(--color-ds);
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
  background: var(--color-ds);
}
</style>

<style scoped>.toc-scroll{padding-bottom:28px;mask-image:linear-gradient(to bottom,#000 0,#000 calc(100% - 24px),transparent);-webkit-mask-image:linear-gradient(to bottom,#000 0,#000 calc(100% - 24px),transparent)}</style>
