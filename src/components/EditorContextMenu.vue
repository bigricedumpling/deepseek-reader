<template>
  <Teleport to="body">
    <Transition name="editor-pop">
      <div v-if="items.length" ref="panel" class="editor-context-menu ui-font" role="menu" :aria-label="label" :style="{ left: pos.x + 'px', top: pos.y + 'px', visibility: ready ? 'visible' : 'hidden' }" @mousedown.stop.prevent @contextmenu.prevent @keydown="onKey">
        <template v-for="item in items" :key="item.id">
          <div v-if="item.separator" class="ctx-sep" role="separator" />
          <button v-else type="button" role="menuitem" class="ctx-item" :class="{ 'is-danger': item.danger }" :disabled="item.disabled" @click="choose(item)">
            <component :is="item.icon" v-if="item.icon" :size="15" class="ctx-icon" />
            <span class="ctx-label">{{ item.label }}</span>
            <kbd v-if="item.shortcut" class="ctx-shortcut">{{ item.shortcut }}</kbd>
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue'

const props = defineProps({
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  label: { type: String, default: '编辑操作' },
  items: { type: Array, default: () => [] }
})
const emit = defineEmits(['select', 'close'])
const panel = ref(null)
const ready = ref(false)
const pos = ref({ x: props.x, y: props.y })

onMounted(async () => {
  await nextTick()
  const rect = panel.value?.getBoundingClientRect()
  if (rect) {
    pos.value = {
      x: Math.max(8, Math.min(props.x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(props.y, window.innerHeight - rect.height - 8))
    }
  }
  ready.value = true
  await nextTick()
  panel.value?.querySelector('button:not(:disabled)')?.focus()
})

function choose(item) {
  if (!item || item.disabled) return
  emit('select', item.id)
}
function onKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key === 'Tab') {
    emit('close')
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const buttons = [...(panel.value?.querySelectorAll('button:not(:disabled)') || [])]
  if (!buttons.length) return
  const at = buttons.indexOf(document.activeElement)
  const next = event.key === 'Home'
    ? buttons[0]
    : event.key === 'End'
      ? buttons[buttons.length - 1]
      : buttons[(at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]
  next.focus()
}
</script>

<style scoped>
.editor-context-menu {
  position: fixed;
  z-index: 980;
  width: 196px;
  max-height: min(420px, calc(100dvh - 16px));
  overflow-y: auto;
  padding: 5px;
  border: 1px solid var(--c-line);
  border-radius: 12px;
  background: var(--c-pop);
  box-shadow: var(--c-pop-shadow);
  corner-shape: superellipse(2);
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 29px;
  padding: 5px 7px;
  border-radius: 7px;
  color: var(--c-text);
  font-size: 12.5px;
  line-height: 1.35;
  text-align: left;
}
.ctx-item:hover,
.ctx-item:focus-visible {
  background: var(--c-hover);
  color: var(--c-ink);
  outline: 0;
}
.ctx-item:disabled {
  opacity: .38;
  cursor: default;
  background: transparent;
}
.ctx-item.is-danger:hover,
.ctx-item.is-danger:focus-visible {
  color: #a55752;
  background: color-mix(in srgb, #a55752 8%, transparent);
}
.ctx-icon {
  flex: none;
  color: var(--c-sub);
}
.ctx-item:hover .ctx-icon,
.ctx-item:focus-visible .ctx-icon {
  color: currentColor;
}
.ctx-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ctx-shortcut {
  flex: none;
  color: var(--c-faint);
  font: 10.5px var(--font-sans);
  letter-spacing: .01em;
}
.ctx-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--c-line-soft);
}
</style>
