<template>
  <div
    ref="el"
    class="bt-menu ui-font"
    @keydown="onKey"
    :style="position"
    @mousedown.prevent
    @contextmenu.prevent
  >
    <template v-for="g in groups" :key="g.label">
      <p class="bt-group">{{ g.label }}</p>
      <template v-if="g.label === '转为'">
        <button
          v-if="paragraphOf(g)"
          class="bt-item"
          :class="{ 'is-on': paragraphOf(g).active }"
          :aria-pressed="paragraphOf(g).active ? 'true' : undefined"
          @click="emit('pick', paragraphOf(g).key)"
        >
          <span class="bt-icon">{{ paragraphOf(g).icon }}</span>
          <span class="bt-label">{{ paragraphOf(g).label }}</span>
          <PhCheck v-if="paragraphOf(g).active" :size="12" class="bt-check" />
        </button>
        <div class="bt-headings">
          <button
            v-for="it in headingsOf(g)"
            :key="it.key"
            class="bt-item bt-heading-item"
            :class="{ 'is-on': it.active }"
            :aria-pressed="it.active ? 'true' : undefined"
            @click="emit('pick', it.key)"
          >
            <span class="bt-icon">{{ it.icon }}</span>
            <span class="bt-label">{{ shortLabel(it) }}</span>
            <PhCheck v-if="it.active" :size="11" class="bt-check" />
          </button>
        </div>
      </template>
      <template v-else>
        <button
          v-for="it in g.items"
          :key="it.key"
          class="bt-item"
          :class="{ 'is-on': it.active }"
          :aria-pressed="it.active ? 'true' : undefined"
          @click="emit('pick', it.key)"
        >
          <span class="bt-icon">{{ it.icon }}</span>
          <span class="bt-label">{{ it.label }}</span>
          <PhCheck v-if="it.active" :size="12" class="bt-check" />
        </button>
      </template>
    </template>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { PhCheck } from '../icons/remix'

const el = ref(null)
const position = ref({ visibility: 'hidden' })
function place() {
  if (!el.value) return
  position.value = {
    left: Math.max(8, Math.min(props.x, innerWidth - el.value.offsetWidth - 8)) + 'px',
    top: Math.max(8, Math.min(props.y, innerHeight - el.value.offsetHeight - 8)) + 'px'
  }
}
onMounted(async () => {
  place()
  window.addEventListener('resize', place)
  await nextTick()
  // Open on the current block, then let arrows walk the list.
  const target = el.value?.querySelector('.bt-item.is-on') || el.value?.querySelector('.bt-item')
  // Milkdown restores the editor selection on pointerup in the next frame.
  requestAnimationFrame(() => {
    if (target?.isConnected) target.focus({ preventScroll: true })
  })
})

onBeforeUnmount(() => window.removeEventListener('resize', place))

function onKey(event) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const items = [...(el.value?.querySelectorAll('.bt-item:not(:disabled)') || [])]
  if (!items.length) return
  const at = items.indexOf(document.activeElement)
  const next = event.key === 'Home'
    ? items[0]
    : event.key === 'End'
      ? items[items.length - 1]
      : items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]
  next.focus()
}

const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  /* [{ label, items: [{ key, label, icon, active }] }] */
  groups: { type: Array, default: () => [] }
})
const emit = defineEmits(['pick'])

function paragraphOf(group) {
  return group.items.find(item => item.key === 'paragraph')
}
function headingsOf(group) {
  return group.items.filter(item => /^h[1-6]$/.test(item.key))
}
function shortLabel(item) {
  return item.label.replace('级标题', '')
}
</script>

<style scoped>
.bt-menu {
  position: fixed;
  z-index: 55;
  width: 190px;
  max-height: min(400px, calc(100dvh - 24px));
  overflow-y: auto;
  padding: 5px;
  scrollbar-width: thin;
  scrollbar-color: var(--c-line) transparent;
  background: var(--c-pop, #fff);
  border: 1px solid var(--c-line-soft, #ececec);
  border-radius: var(--radius-tool);
  box-shadow: var(--c-pop-shadow);
}
.bt-group {
  position: sticky;
  top: -5px;
  z-index: 1;
  margin: 2px 0 1px;
  padding: 6px 8px 3px;
  background: var(--c-pop, #fff);
  font-size: 10px;
  letter-spacing: 0;
  color: var(--c-faint, #9a9a9a);
}
.bt-group:not(:first-child) { margin-top: 4px; border:0; padding-top: 7px; }
.bt-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 27px;
  padding: 4px 8px;
  border: 0;
  border-radius: var(--radius-item);
  background: transparent;
  color: var(--c-text, #333);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.bt-item:hover {
  background: var(--c-hover, #f4f4f4);
}
.bt-headings {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  margin-top: 2px;
}
.bt-heading-item {
  min-height: 27px;
  padding: 3px 6px;
}
.bt-heading-item .bt-icon {
  width: 18px;
}
.bt-heading-item .bt-label {
  font-size: 11.5px;
}
.bt-item.is-on {
  color: var(--c-accent, #303030);
  background: var(--c-active);
}
.bt-icon {
  display: inline-flex;
  width: 20px;
  flex-shrink: 0;
  justify-content: center;
  font-size: 10.5px;
  color: var(--c-faint, #9a9a9a);
  font-variant-numeric: tabular-nums;
}
.bt-item.is-on .bt-icon {
  color: inherit;
}
.bt-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.bt-check {
  flex-shrink: 0;
  opacity: 0.9;
}
</style>
