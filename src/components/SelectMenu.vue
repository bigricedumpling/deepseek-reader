<template>
  <button ref="trigger" class="select-menu-trigger" :class="{ 'is-open': open }" type="button" :aria-label="label" :aria-description="selectedLabel" :disabled="disabled" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="open ? listId : undefined" :data-esc-local="open ? '' : undefined" @click="toggle" @keydown="onTriggerKey">
    <span>{{ selectedLabel }}</span><PhCaretDown :size="14" />
  </button>
  <Teleport to="body">
    <Transition name="pop">
    <div v-if="open" :id="listId" ref="panel" class="select-menu-panel" :class="{'in-dialog':inDialog}" :style="position" role="listbox" :aria-label="label" @keydown="onKey">
      <button v-for="(item, index) in options" :key="item.value" type="button" role="option" :aria-selected="item.value === modelValue" :tabindex="index === active ? 0 : -1" @click="choose(item.value)"><span>{{ item.label }}</span><PhCheck v-if="item.value === modelValue" :size="14" /></button>
    </div>
    </Transition>
  </Teleport>
</template>
<script setup>
import { computed, ref, nextTick, onMounted, onBeforeUnmount, useId } from 'vue'
import { PhCaretDown, PhCheck } from '../icons/remix'
const props = defineProps({ modelValue: String, options: { type: Array, default: () => [] }, label: String, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
const selectedLabel = computed(() => props.options.find(item => item.value === props.modelValue)?.label || '')
const listId = useId()
const inDialog = ref(false)
const trigger = ref(null), panel = ref(null), open = ref(false), active = ref(0), position = ref({})
function close(focus = false) {
  open.value = false
  if (focus) trigger.value?.focus({ preventScroll: true })
}
function focusOption() {
  const option = panel.value?.children[active.value]
  if (!option) return
  option.focus({ preventScroll: true })
  const list = panel.value
  if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop
  else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
    list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight
  }
}
async function show() {
  if (!props.options.length) return
  inDialog.value = Boolean(trigger.value.closest('[role=dialog]'))
  const rect = trigger.value.getBoundingClientRect()
  const width = Math.min(innerWidth - 16, Math.max(128, rect.width))
  const left = Math.max(8, Math.min(rect.left, innerWidth - width - 8))
  position.value = { width: width + 'px', left: left + 'px', top: '0', visibility: 'hidden' }
  active.value = Math.max(0, props.options.findIndex(item => item.value === props.modelValue))
  open.value = true
  await nextTick()
  if (!panel.value) return
  // Measure wrapped options at the final width before choosing which side fits.
  const fullHeight = panel.value.scrollHeight + 2
  const below = Math.max(0, innerHeight - rect.bottom - 14)
  const above = Math.max(0, rect.top - 14)
  const upward = fullHeight > below && above > below
  const height = Math.min(fullHeight, upward ? above : below)
  const top = upward ? rect.top - 6 - height : rect.bottom + 6
  position.value = { width: width + 'px', left: left + 'px', top: top + 'px', maxHeight: height + 'px' }
  await nextTick()
  focusOption()
}
function toggle() { open.value ? close() : show() }
function choose(value) { emit('update:modelValue', value); close(true) }
function onTriggerKey(event) {
  // After a touch tap the browser can keep focus on the trigger.
  if (open.value) return onKey(event)
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    show()
  }
}
function onKey(event) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) }
  else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    choose(props.options[active.value].value)
  }
  else if (event.key === 'Tab') close(true)
  else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    active.value = event.key === 'Home' ? 0 : event.key === 'End' ? props.options.length - 1 : (active.value + (event.key === 'ArrowDown' ? 1 : -1) + props.options.length) % props.options.length
    focusOption()
  }
}
function outside(event) { if (!trigger.value?.contains(event.target) && !panel.value?.contains(event.target)) close() }
function dismiss() { close() }
function onScroll(event) {
  if (open.value && !(event.target instanceof Node && panel.value?.contains(event.target))) close()
}
onMounted(() => { document.addEventListener('pointerdown', outside); window.addEventListener('resize', dismiss); window.addEventListener('scroll', onScroll, true) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', onScroll, true) })
</script>
<style>
.select-menu-trigger{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:36px;padding:8px 12px;border:1px solid var(--c-line);border-radius:var(--radius-control);corner-shape:superellipse(2);background:var(--c-field);font:inherit;font-size:12px;color:var(--c-sub);text-align:left}
.select-menu-trigger span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.select-menu-trigger svg{flex:none;transition:transform 200ms var(--motion-snap)}.select-menu-trigger.is-open svg{transform:rotate(180deg)}
.select-menu-panel{position:fixed;box-sizing:border-box;overflow:auto;overscroll-behavior:contain;z-index:1200;padding:5px;border:1px solid var(--c-line);border-radius:var(--radius-tool);corner-shape:var(--corner-ui);background:var(--c-pop);box-shadow:var(--surface-menu-shadow);font-synthesis:none}
.select-menu-panel button{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:34px;padding:7px 10px;border-radius:var(--radius-item);corner-shape:var(--corner-ui);font-size:12px;text-align:left}.select-menu-panel button:hover,.select-menu-panel button:focus-visible{background:var(--c-hover);outline:0}
.select-menu-panel button span{min-width:0;overflow-wrap:anywhere}
.select-menu-panel button svg{flex:none}
@media (pointer:coarse){.select-menu-panel button{min-height:44px}}
@media (prefers-reduced-motion:reduce){.select-menu-trigger svg{transition:none}}
</style>
