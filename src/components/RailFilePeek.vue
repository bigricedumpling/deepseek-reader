<template>
  <section
    class="rail-peek ui-font"
    :style="{ top: top + 'px', left: left + 'px', maxHeight: maxHeight + 'px' }"
    role="dialog"
    :aria-label="root.name"
    @mouseenter="$emit('enter')"
    @mouseleave="$emit('leave')"
    @focusin="$emit('enter')"
    @focusout="onFocusOut"
    @keydown.esc.stop.prevent="$emit('close')"
  >
    <header class="rail-peek-head">
      <strong>{{ root.name }}</strong>
      <span v-if="root.count" class="rail-peek-meta">{{ root.count }} 篇文档</span>
    </header>

    <div v-if="rows.length" ref="listEl" class="rail-peek-list" role="tree" :aria-label="root.name">
      <template v-for="row in rows" :key="row.node.type + ':' + (row.node.path || row.node.file)">
        <div
          v-if="row.node.type === 'folder'"
          class="peek-row is-folder"
          :class="{ 'is-context': containsCurrent(row.node), 'is-expanded': expanded.has(row.node.path) }"
          role="treeitem"
          :aria-level="row.depth + 1"
          :aria-expanded="row.node.children?.length ? expanded.has(row.node.path) : undefined"
          tabindex="0"
          :style="{ paddingLeft: 8 + row.depth * 12 + 'px' }"
          @mouseenter="scheduleExpand(row.node)"
          @mouseleave="cancelExpand"
          @focus="expandNow(row.node)"
          @click="openNode(row.node)"
          @keydown.enter.prevent="openNode(row.node)"
          @keydown.space.prevent="openNode(row.node)"
          @keydown.right.prevent="expandNow(row.node)"
          @keydown.left.prevent="collapse(row.node)"
          @keydown.down.prevent="moveFocus($event, 1)"
          @keydown.up.prevent="moveFocus($event, -1)"
        >
          <button
            v-if="row.node.children?.length"
            type="button"
            class="peek-caret"
            :aria-label="(expanded.has(row.node.path) ? '收起 ' : '展开 ') + row.node.name"
            :aria-expanded="expanded.has(row.node.path)"
            tabindex="-1"
            @click.stop="toggle(row.node)"
          >
            <PhCaretRight :size="10" weight="bold" />
          </button>
          <span v-else class="peek-caret-space" aria-hidden="true" />
          <span class="peek-bar" aria-hidden="true" />
          <span class="peek-label">{{ row.node.name }}</span>
        </div>

        <button
          v-else
          type="button"
          class="peek-row is-file"
          :class="{ 'is-current': row.node.file === currentPath }"
          role="treeitem"
          :aria-level="row.depth + 1"
          :aria-current="row.node.file === currentPath ? 'page' : undefined"
          :style="{ paddingLeft: 8 + row.depth * 12 + 'px' }"
          @mouseenter="cancelExpand"
          @click="openNode(row.node)"
          @keydown.down.prevent="moveFocus($event, 1)"
          @keydown.up.prevent="moveFocus($event, -1)"
        >
          <span class="peek-caret-space" aria-hidden="true" />
          <span class="peek-bar" aria-hidden="true" />
          <span class="peek-label">{{ row.node.name }}</span>
        </button>
      </template>
    </div>

    <p v-else class="rail-peek-empty">这个文件夹里还没有文档</p>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { PhCaretRight } from '../icons/remix'

const props = defineProps({
  root: { type: Object, required: true },
  currentPath: { type: String, default: '' },
  top: { type: Number, default: 8 },
  left: { type: Number, default: 40 },
  maxHeight: { type: Number, default: 420 }
})
const emit = defineEmits(['open', 'enter', 'leave', 'close'])

const expanded = ref(new Set())
const listEl = ref(null)
let expandTimer = 0

function containsCurrent(node) {
  return !!props.currentPath && props.currentPath.startsWith(node.path + '/')
}

const rows = computed(() => {
  const out = []
  const walk = (nodes, depth) => {
    for (const node of nodes || []) {
      out.push({ node, depth })
      if (node.type === 'folder' && expanded.value.has(node.path)) walk(node.children, depth + 1)
    }
  }
  walk(props.root?.node?.children, 0)
  return out
})

function seedExpanded() {
  const next = new Set()
  const rootPath = String(props.root?.path || '')
  const current = String(props.currentPath || '')
  if (rootPath && current.startsWith(rootPath + '/')) {
    const parts = current.split('/')
    for (let i = 2; i < parts.length - 1; i++) {
      const path = parts.slice(0, i).join('/')
      if (path.startsWith(rootPath + '/')) next.add(path)
    }
  }
  expanded.value = next
}

watch(() => props.root, () => {
  seedExpanded()
  nextTick(scrollCurrent)
}, { immediate: true })

function scheduleExpand(node) {
  if (node.type !== 'folder' || !node.children?.length || expanded.value.has(node.path)) return
  clearTimeout(expandTimer)
  expandTimer = window.setTimeout(() => expandNow(node), 160)
}
function cancelExpand() {
  clearTimeout(expandTimer)
}
function expandNow(node) {
  cancelExpand()
  if (node.type !== 'folder' || !node.children?.length || expanded.value.has(node.path)) return
  const next = new Set(expanded.value)
  next.add(node.path)
  expanded.value = next
}
function collapse(node) {
  cancelExpand()
  if (node.type !== 'folder' || !expanded.value.has(node.path)) return
  const next = new Set(expanded.value)
  next.delete(node.path)
  expanded.value = next
}
function toggle(node) {
  expanded.value.has(node.path) ? collapse(node) : expandNow(node)
}

function openNode(node) {
  if (node.type === 'folder') emit('open', { kind: 'folder', name: node.name, path: node.path })
  else emit('open', { kind: 'file', name: node.name, file: node.file })
}
function moveFocus(event, delta) {
  const all = [...(listEl.value?.querySelectorAll('.peek-row') || [])]
  const index = all.indexOf(event.currentTarget)
  const next = all[index + delta]
  if (next) next.focus()
}

async function scrollCurrent() {
  await nextTick()
  const list = listEl.value
  const row = list?.querySelector('.peek-row.is-current')
  if (!list || !row) return
  const top = row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2
  list.scrollTop = Math.max(0, top)
}

async function focusFirst() {
  await nextTick()
  listEl.value?.querySelector('.peek-row')?.focus()
}
defineExpose({ focusFirst })

function onFocusOut(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) emit('leave')
}

onBeforeUnmount(() => clearTimeout(expandTimer))
</script>

<style scoped>
.rail-peek {
  position: fixed;
  z-index: var(--layer-hint);
  display: flex;
  flex-direction: column;
  width: max-content;
  max-width: min(240px, calc(100vw - 16px));
  overflow: hidden;
  border: 0;
  border-radius: 12px;
  background: transparent;
  box-shadow: none;
  color: var(--c-ink);
  isolation: isolate;
  animation: rail-peek-in 170ms var(--motion-snap);
}
.rail-peek::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: color-mix(in srgb, var(--c-pop) 70%, transparent);
  -webkit-backdrop-filter: blur(14px) saturate(1.04);
  backdrop-filter: blur(14px) saturate(1.04);
  -webkit-mask: linear-gradient(to right, transparent 0, #000 8px, #000 calc(100% - 8px), transparent 100%);
  mask: linear-gradient(to right, transparent 0, #000 8px, #000 calc(100% - 8px), transparent 100%);
}
@keyframes rail-peek-in {
  from { transform: translateX(-4px) scale(.992); }
  to { transform: none; }
}
.rail-peek-head {
  display: flex;
  align-items: baseline;
  gap: 7px;
  flex: none;
  min-width: 0;
  padding: 7px 10px 3px;
}
.rail-peek-head strong {
  min-width: 0;
  overflow: hidden;
  color: var(--c-ink);
  font-size: 11.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rail-peek-meta { flex: none; color: var(--c-faint); font-size: 10.5px; }
.rail-peek-list {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 4px 4px;
  scrollbar-width: thin;
}
.peek-row {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  min-height: 24px;
  padding: 2px 6px;
  border-radius: 6px;
  color: var(--c-sub);
  font-size: 11.5px;
  line-height: 1.35;
  text-align: left;
  transition: background .12s ease, color .12s ease;
}
.peek-row:hover,
.peek-row:focus-visible {
  background: color-mix(in srgb, var(--c-ink) 5%, transparent);
  color: var(--c-ink);
}
.peek-row.is-context {
  color: var(--c-sub);
}
.peek-row.is-current {
  color: var(--c-accent);
}
.peek-caret,
.peek-caret-space {
  display: grid;
  place-items: center;
  flex: none;
  width: 11px;
  height: 14px;
}
.peek-caret {
  border-radius: 4px;
  color: var(--c-faint);
  opacity: .55;
  transition: opacity .12s ease, background .12s ease;
}
.peek-caret:hover,
.peek-caret:focus-visible {
  background: var(--c-pop);
  color: var(--c-ink);
  opacity: 1;
}
.peek-caret svg {
  transition: transform 160ms var(--motion-snap);
}
.peek-row.is-expanded .peek-caret svg {
  transform: rotate(90deg);
}
.peek-bar {
  flex: none;
  width: 2px;
  height: 4px;
  border-radius: 2px;
  background: currentColor;
  opacity: .3;
}
.peek-row.is-folder .peek-bar {
  height: 8px;
}
.peek-row.is-current .peek-bar,
.peek-row.is-context .peek-bar {
  background: var(--c-accent);
  opacity: .85;
}
.peek-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.peek-row.is-folder .peek-label {
  font-weight: 500;
}
.rail-peek-empty {
  margin: 0;
  padding: 0 10px 10px;
  color: var(--c-faint);
  font-size: 11px;
}
@media (prefers-reduced-motion: reduce) {
  .rail-peek { animation: none; }
  .peek-row, .peek-caret, .peek-caret svg { transition: none; }
}
</style>

<style scoped>
/* Folder peek uses the same soft entrance as the rail hints. */
.rail-peek-enter-active { transition: opacity 160ms ease, transform 200ms var(--motion-pop); }
.rail-peek-leave-active { transition: opacity 120ms ease, transform 140ms var(--motion-snap); }
.rail-peek-enter-from,
.rail-peek-leave-to { opacity: 0; transform: translateX(-4px) scale(.98); }
@media (prefers-reduced-motion: reduce) {
  .rail-peek-enter-active,
  .rail-peek-leave-active { transition: none; }
  .rail-peek-enter-from,
  .rail-peek-leave-to { opacity: 1; transform: none; }
}
</style>
