<template>
  <button ref="trigger" class="select-menu-trigger" type="button" :aria-label="label" aria-haspopup="listbox" :aria-expanded="open" @click="toggle" @keydown.down.prevent="show" @keydown.up.prevent="show">
    <span>{{ options.find(item => item.value === modelValue)?.label }}</span><PhCaretDown :size="14" />
  </button>
  <Teleport to="body">
    <Transition name="pop">
    <div v-if="open" ref="panel" class="select-menu-panel" :style="position" role="listbox" :aria-label="label" @keydown="onKey">
      <button v-for="(item, index) in options" :key="item.value" type="button" role="option" :aria-selected="item.value === modelValue" :tabindex="index === active ? 0 : -1" @click="choose(item.value)"><span>{{ item.label }}</span><PhCheck v-if="item.value === modelValue" :size="14" /></button>
    </div>
    </Transition>
  </Teleport>
</template>
<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { PhCaretDown, PhCheck } from '@phosphor-icons/vue'
const props = defineProps({ modelValue: String, options: { type: Array, default: () => [] }, label: String })
const emit = defineEmits(['update:modelValue'])
const trigger = ref(null), panel = ref(null), open = ref(false), active = ref(0), position = ref({})
function close(focus = false) { open.value = false; if (focus) trigger.value?.focus() }
async function show() {
  const rect = trigger.value.getBoundingClientRect(), width = Math.max(160, rect.width)
  position.value = { width: width + 'px', left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + 'px', top: Math.max(8, Math.min(rect.bottom + 6, innerHeight - props.options.length * 36 - 16)) + 'px' }
  active.value = Math.max(0, props.options.findIndex(item => item.value === props.modelValue)); open.value = true
  await nextTick(); panel.value?.children[active.value]?.focus()
}
function toggle() { open.value ? close() : show() }
function choose(value) { emit('update:modelValue', value); close(true) }
function onKey(event) {
  if (event.key === 'Escape') { event.preventDefault(); close(true) }
  else if (event.key === 'Tab') close()
  else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    active.value = event.key === 'Home' ? 0 : event.key === 'End' ? props.options.length - 1 : (active.value + (event.key === 'ArrowDown' ? 1 : -1) + props.options.length) % props.options.length
    panel.value?.children[active.value]?.focus()
  }
}
function outside(event) { if (!trigger.value?.contains(event.target) && !panel.value?.contains(event.target)) close() }
function dismiss() { close() }
onMounted(() => { document.addEventListener('pointerdown', outside); window.addEventListener('resize', dismiss); window.addEventListener('scroll', dismiss, true) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', dismiss, true) })
</script>
<style>
.select-menu-trigger{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:36px;padding:8px 12px;border:1px solid var(--c-line);border-radius:var(--radius-control);corner-shape:superellipse(2);background:var(--c-field);font:inherit;font-size:12px;color:var(--c-sub);text-align:left}
.select-menu-trigger span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.select-menu-trigger svg{flex:none}
.select-menu-panel{position:fixed;z-index:1200;padding:5px;border:1px solid var(--c-line);border-radius:20px;corner-shape:superellipse(2);background:var(--c-pop);box-shadow:var(--c-pop-shadow);font-synthesis:none}
.select-menu-panel button{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:34px;padding:7px 10px;border-radius:14px;corner-shape:superellipse(2);font-size:12px;text-align:left}.select-menu-panel button:hover,.select-menu-panel button:focus-visible{background:var(--c-hover);outline:0}
</style>
