<template>
  <Teleport to="body">
    <nav
      v-if="visible && items.length"
      class="rail-files"
      aria-label="文件快捷导航"
      @mouseenter="cancelClose"
      @mouseleave="scheduleClose"
      @keydown.esc="closeAll(true)"
    >
      <button
        v-for="(item, i) in items"
        :key="item.key"
        type="button"
        class="rail-files-item"
        :class="[
          'is-' + item.kind,
          {
            'is-current': item.isCurrent,
            'is-context': item.containsCurrent,
            'is-hovered': hoveredKey === item.key,
            'is-active': activeKey === item.key
          }
        ]"
        :style="{ '--i': i }"
        :data-rail-key="item.key"
        :aria-label="ariaLabel(item)"
        :aria-current="item.isCurrent ? 'page' : undefined"
        :aria-haspopup="item.kind === 'folder' ? 'tree' : undefined"
        :aria-expanded="item.kind === 'folder' ? activeKey === item.key : undefined"
        @mouseenter="onItemEnter(item, $event)"
        @mouseleave="onItemLeave(item)"
        @focus="onItemFocus(item, $event)"
        @blur="onItemBlur(item)"
        @click="choose(item)"
        @keydown.right.prevent="item.kind === 'folder' ? openPeekFromKeyboard(item, $event) : null"
      >
        <span class="rail-bar" aria-hidden="true" />
      </button>
    </nav>

    <Transition name="rail-hint" :css="!hintFast">
      <div v-if="hint" class="rail-hint ui-font" role="tooltip" :style="{ top: hint.top + 'px', left: hint.left + 'px' }">
        <span class="rail-hint-name">{{ hint.name }}</span>
        <span v-if="hint.meta" class="rail-hint-meta">{{ hint.meta }}</span>
      </div>
    </Transition>

    <Transition name="rail-peek">
      <RailFilePeek
        v-if="peek"
        :key="peek.item.key"
        ref="peekRef"
        :root="peek.item"
        :current-path="currentPath"
        :top="peek.top"
        :left="peek.left"
        :max-height="peek.maxHeight"
        @open="chooseFromPeek"
        @enter="cancelClose"
        @leave="scheduleClose"
        @close="closeAll(true)"
      />
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RailFilePeek from './RailFilePeek.vue'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  currentPath: { type: String, default: '' },
  visible: { type: Boolean, default: false }
})
const emit = defineEmits(['open'])

/** A rail is a shortcut, not a second sidebar. Keep it calm and cap it. */
const MAX_STOPS = 12
const HOVER_DELAY = 280
const CLOSE_DELAY = 240
const PANEL_WIDTH = 240

const hoveredKey = ref('')
const hint = ref(null)
const hintFast = ref(false)
const peek = ref(null)
const peekRef = ref(null)
const activeKey = computed(() => peek.value?.item.key || '')

let hintTimer = 0
let peekTimer = 0
let closeTimer = 0

/* ---------- 根层目录 ---------- */

function contains(node, path) {
  if (!path) return false
  const walk = n => n.type === 'folder' ? (n.children || []).some(walk) : n.file === path
  return walk(node)
}
function countDocs(node) {
  let total = 0
  for (const child of node.children || []) {
    if (child.type === 'folder') total += countDocs(child)
    else total += 1
  }
  return total
}
function parentPath(file) {
  const parts = String(file || '').split('/')
  parts.pop()
  return parts.join(' / ')
}

const items = computed(() => {
  const all = (props.nodes || []).map(node => {
    const folder = node.type === 'folder'
    const count = folder ? countDocs(node) : 0
    return {
      key: (folder ? 'folder:' : 'file:') + (folder ? node.path : node.file),
      kind: folder ? 'folder' : 'file',
      name: node.name,
      path: node.path || '',
      file: node.file || '',
      node: folder ? node : null,
      count,
      isCurrent: !folder && node.file === props.currentPath,
      containsCurrent: folder && contains(node, props.currentPath)
    }
  })
  if (all.length <= MAX_STOPS) return all
  const visible = all.slice(0, MAX_STOPS - 1)
  // Never hide the current context behind “more” just because it sits late in the tree.
  const current = all.find(item => item.isCurrent || item.containsCurrent)
  if (current && !visible.some(item => item.key === current.key)) visible[visible.length - 1] = current
  return [
    ...visible,
    { key: 'more', kind: 'more', name: '更多文件', count: 0, isCurrent: false, containsCurrent: false }
  ]
})

function ariaLabel(item) {
  if (item.kind === 'folder') return '文件夹 ' + item.name + '，' + item.count + ' 篇文档'
  if (item.kind === 'more') return '更多文件，打开完整文件目录'
  const parent = parentPath(item.file)
  return '文件 ' + item.name + (parent ? '，位于 ' + parent : '')
}

function hintFor(item) {
  if (item.kind === 'folder') return { name: item.name, meta: item.count ? item.count + ' 篇文档' : '空文件夹' }
  if (item.kind === 'more') return { name: '更多文件', meta: '打开完整文件目录' }
  return { name: item.name, meta: parentPath(item.file) || '根目录' }
}

/* ---------- hover 标题 ---------- */

function showHint(item, event) {
  clearTimeout(hintTimer)
  hintFast.value = false
  const rect = event.currentTarget.getBoundingClientRect()
  const data = hintFor(item)
  hintTimer = window.setTimeout(() => {
    if (peek.value) return
    hint.value = {
      ...data,
      top: Math.max(24, Math.min(innerHeight - 24, rect.top + rect.height / 2)),
      left: rect.right + 10
    }
  }, 55)
}
function hideHint() {
  clearTimeout(hintTimer)
  hint.value = null
}

/* ---------- peek 面板 ---------- */

function openPeek(item, rect, focus = false) {
  if (!item?.node) return
  clearTimeout(peekTimer)
  // The folder hint and the panel share the same corner; drop the hint without a second exit.
  hintFast.value = true
  hideHint()
  const maxPanel = Math.min(innerHeight * 0.6, 480)
  const childCount = item.node.children?.length || 0
  const estimate = Math.min(maxPanel, 38 + Math.max(1, Math.min(childCount, 8)) * 24 + 8)
  let top = rect.top - 4
  if (top + estimate > innerHeight - 8) top = innerHeight - 8 - estimate
  top = Math.max(8, top)
  const maxHeight = Math.min(maxPanel, innerHeight - top - 8)
  const left = Math.max(rect.right + 6, Math.min(rect.right + 10, innerWidth - PANEL_WIDTH - 8))
  peek.value = { item, top, left, maxHeight }
  if (focus) nextTick(() => peekRef.value?.focusFirst())
}
function schedulePeek(item, event) {
  if (item.kind !== 'folder') return
  clearTimeout(peekTimer)
  const rect = event.currentTarget.getBoundingClientRect()
  peekTimer = window.setTimeout(() => {
    if (hoveredKey.value === item.key) openPeek(item, rect)
  }, HOVER_DELAY)
}
function openPeekFromKeyboard(item, event) {
  if (item.kind !== 'folder') return
  openPeek(item, event.currentTarget.getBoundingClientRect(), true)
}
function closePeek(returnFocus = false) {
  clearTimeout(peekTimer)
  const key = peek.value?.item.key
  peek.value = null
  hideHint()
  if (returnFocus && key) {
    nextTick(() => {
      [...document.querySelectorAll('.rail-files-item')].find(el => el.dataset.railKey === key)?.focus()
    })
  }
}
function scheduleClose() {
  clearTimeout(closeTimer)
  closeTimer = window.setTimeout(() => {
    if (!hoveredKey.value) closePeek(false)
  }, CLOSE_DELAY)
}
function cancelClose() {
  clearTimeout(closeTimer)
}
function closeAll(returnFocus = false) {
  clearTimeout(closeTimer)
  clearTimeout(peekTimer)
  hoveredKey.value = ''
  closePeek(returnFocus)
}

/* ---------- 指针 / 焦点 ---------- */

function onItemEnter(item, event) {
  hoveredKey.value = item.key
  cancelClose()
  if (peek.value && peek.value.item.key !== item.key) closePeek(false)
  if (item.kind === 'folder') {
    /* 文件夹直接等浮层，不再先闪一个白色提示卡再跳成目录面板。 */
    schedulePeek(item, event)
    return
  }
  if (!(item.kind === 'folder' && peek.value?.item.key === item.key)) showHint(item, event)
}
function onItemLeave(item) {
  if (hoveredKey.value === item.key) hoveredKey.value = ''
  hideHint()
}
function onItemFocus(item, event) {
  hoveredKey.value = item.key
  cancelClose()
  if (!(item.kind === 'folder' && peek.value?.item.key === item.key)) showHint(item, event)
}
function onItemBlur(item) {
  if (hoveredKey.value === item.key) hoveredKey.value = ''
  hideHint()
  scheduleClose()
}

/* ---------- 选择 ---------- */

function choose(item) {
  if (item.kind === 'more') {
    closeAll()
    emit('open', { kind: 'more' })
    return
  }
  closeAll()
  emit('open', item.kind === 'folder'
    ? { kind: 'folder', name: item.name, path: item.path }
    : { kind: 'file', name: item.name, file: item.file })
}
function chooseFromPeek(item) {
  closeAll()
  emit('open', item)
}

/* ---------- 生命周期 ---------- */

function onDocumentPointerDown(event) {
  if (!peek.value) return
  if (event.target.closest?.('.rail-files, .rail-peek')) return
  closeAll()
}
function onResize() {
  closeAll()
}
watch(() => props.visible, value => { if (!value) closeAll() })
watch(() => props.nodes, () => closeAll())
watch(() => props.currentPath, () => closeAll())

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  clearTimeout(hintTimer)
  clearTimeout(peekTimer)
  clearTimeout(closeTimer)
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.rail-files {
  position: fixed;
  left: 5px;
  top: 50%;
  z-index: 6;
  display: flex;
  flex-direction: column;
  transform: translateY(-50%);
  opacity: .66;
  transition: opacity .18s ease;
}
.rail-files:hover,
.rail-files:focus-within {
  opacity: 1;
}
.rail-files-item {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 26px;
  height: 16px;
  padding: 0 4px 0 0;
  border-radius: 4px;
}
.rail-bar {
  display: block;
  flex: none;
  width: 2px;
  height: 6px;
  border-radius: 2px;
  background: var(--c-faint);
  opacity: .14;
  transition:
    height .16s var(--motion-snap),
    width .16s var(--motion-snap),
    background .14s ease,
    opacity .14s ease;
}
.rail-files-item.is-folder .rail-bar {
  height: 12px;
}
.rail-files-item.is-more .rail-bar {
  height: 14px;
  background: repeating-linear-gradient(to bottom, var(--c-faint) 0 2px, transparent 2px 4px);
  opacity: .22;
}
.rail-files-item.is-current .rail-bar {
  background: var(--c-accent);
  opacity: .9;
}
.rail-files-item.is-context .rail-bar {
  background: var(--c-accent);
  opacity: .22;
}
.rail-files-item.is-hovered .rail-bar,
.rail-files-item.is-active .rail-bar,
.rail-files-item:focus-visible .rail-bar {
  width: 3px;
  background: var(--c-ink);
  opacity: 1;
}
.rail-files-item.is-folder.is-hovered .rail-bar,
.rail-files-item.is-folder.is-active .rail-bar,
.rail-files-item.is-folder:focus-visible .rail-bar {
  height: 14px;
}
.rail-files-item.is-file.is-hovered .rail-bar,
.rail-files-item.is-file:focus-visible .rail-bar {
  height: 9px;
}
.rail-files-item.is-more.is-hovered .rail-bar,
.rail-files-item.is-more:focus-visible .rail-bar {
  height: 16px;
  background: repeating-linear-gradient(to bottom, var(--c-ink) 0 2px, transparent 2px 4px);
}
.rail-files-item.is-current.is-hovered .rail-bar,
.rail-files-item.is-context.is-hovered .rail-bar,
.rail-files-item.is-current.is-active .rail-bar,
.rail-files-item.is-context.is-active .rail-bar,
.rail-files-item.is-current:focus-visible .rail-bar,
.rail-files-item.is-context:focus-visible .rail-bar {
  background: var(--c-accent);
}

/* The label mirrors the right-hand TOC hint, but grows out of the left spine. */
.rail-hint {
  position: fixed;
  z-index: var(--layer-hint);
  display: flex;
  align-items: baseline;
  gap: 7px;
  max-width: min(280px, calc(100vw - 64px));
  padding: 5px 12px;
  border: 0 !important;
  border-radius: 999px;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--c-sub) !important;
  font-size: 11.5px;
  line-height: 1.5;
  white-space: nowrap;
  pointer-events: none;
  overflow: hidden;
  isolation: isolate;
  clip-path: inset(0 0 0 0);
  transform: translateY(-50%);
  transition:
    clip-path 160ms var(--motion-snap),
    opacity 100ms ease,
    transform 160ms var(--motion-snap),
    top 180ms var(--motion-snap),
    left 180ms var(--motion-snap);
}
.rail-hint::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: color-mix(in srgb, var(--c-panel) 72%, transparent);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  -webkit-mask: linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
  mask: linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
}
.rail-hint-name {
  min-width: 0;
  overflow: hidden;
  color: var(--c-ink);
  text-overflow: ellipsis;
}
.rail-hint-meta {
  flex: none;
  color: var(--c-faint);
  font-size: 10.5px;
}
.rail-hint-enter-active {
  transition:
    clip-path 150ms var(--motion-snap),
    opacity 90ms ease,
    transform 150ms var(--motion-snap),
    top 180ms var(--motion-snap),
    left 180ms var(--motion-snap);
}
.rail-hint-leave-active {
  transition:
    clip-path 300ms var(--motion-pop),
    opacity 260ms ease,
    transform 300ms var(--motion-pop),
    filter 160ms ease,
    top 180ms var(--motion-snap),
    left 180ms var(--motion-snap);
}
.rail-hint-enter-from {
  opacity: 0;
  clip-path: inset(0 100% 0 0);
  transform: translateY(-50%) translateX(-4px);
}
.rail-hint-leave-to {
  opacity: 0;
  clip-path: inset(0 70% 0 0);
  transform: translateY(-50%) translateX(-4px) scale(.98);
  filter: blur(1px);
}
@media (max-width: 760px) {
  .rail-files { display: none; }
}
.rail-peek-enter-active { transition: opacity 160ms ease, transform 200ms var(--motion-pop); }
.rail-peek-leave-active { transition: opacity 120ms ease, transform 140ms var(--motion-snap); }
.rail-peek-enter-from,
.rail-peek-leave-to { opacity: 0; transform: translateX(-4px) scale(.98); }
@media (prefers-reduced-motion: reduce) {
  .rail-files,
  .rail-bar,
  .rail-hint,
  .rail-hint::before { transition: none; }
  .rail-peek-enter-active,
  .rail-peek-leave-active { transition: none; }
}
</style>
