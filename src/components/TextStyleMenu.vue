<template>
  <Teleport to="body">
    <div ref="el" class="text-style-menu ui-font" :style="{ left: x + 'px', top: y + 'px' }" @mousedown.prevent @keydown="onKey">
      <p>文字颜色</p>
      <div class="style-row">
        <button v-for="(hex, name) in TEXT_COLORS" :key="name" type="button" class="style-swatch"
          :class="{ 'is-on': color === name }"
          :aria-pressed="color === name"
          :title="COLOR_NAMES[name]" :aria-label="`文字颜色 ${COLOR_NAMES[name]}`" :style="{ color: hex }" @click="pickColor(name)">A</button>
        <button type="button" class="style-swatch style-custom"
          :class="{ 'is-on': customActive }"
          :aria-pressed="customActive"
          :title="customActive ? `自定义颜色 ${color}` : '自定义颜色'"
          aria-label="自定义文字颜色"
          :style="{ background: customActive ? color : 'conic-gradient(from 210deg, #2f6fed, #4a6fa5, #374151, #9aa7bd, #2f6fed)' }"
          @click="customInput?.click()"><span aria-hidden="true">+</span></button>
        <input ref="customInput" class="style-custom-input" type="color" tabindex="-1"
          :value="customColor" aria-label="选择自定义文字颜色" @input="onCustomInput" />
        <button type="button" class="style-reset" :class="{ 'is-on': !color }" :aria-pressed="!color" @click="emit('pick', 'color', null)">默认</button>
      </div>
      <template v-if="recentColors.length">
        <p class="recent-label">最近使用</p>
        <div class="style-row recent-row">
          <button v-for="name in recentColors" :key="'recent-'+name" type="button" class="style-swatch"
            :class="{ 'is-on': color === name }"
            :aria-pressed="color === name"
            :title="colorTitle(name)" :aria-label="`文字颜色 ${colorTitle(name)}`" :style="{ color: toneValue(name) }"
            @click="pickColor(name)">A</button>
        </div>
      </template>
      <p>马克笔高光</p>
      <div class="style-row">
        <button v-for="(hex, name) in HIGHLIGHT_COLORS" :key="name" type="button" class="style-highlight"
          :class="{ 'is-on': highlight === name }"
          :aria-pressed="highlight === name"
          :title="COLOR_NAMES[name]" :aria-label="`高光 ${COLOR_NAMES[name]}`" :style="{ backgroundColor: hex }" @click="emit('pick', 'highlight', name)"></button>
        <button type="button" class="style-reset" :class="{ 'is-on': !highlight }" :aria-pressed="!highlight" @click="emit('pick', 'highlight', null)">清除</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { TEXT_COLORS, HIGHLIGHT_COLORS, isCustomTextColor, textColorName, textColorValue } from '../utils/inline-style'
import { storageJSON, storageSet } from '../utils/storage'
const COLOR_NAMES = { red: '红色', orange: '橙色', green: '绿色', blue: '蓝色', purple: '紫色', gray: '灰色', yellow: '黄色', pink: '粉色' }
const props = defineProps({
  x: Number,
  y: Number,
  color: { type: String, default: '' },
  highlight: { type: String, default: '' }
})
const emit = defineEmits(['pick'])
const el = ref(null)
const customInput = ref(null)
const recentColors = ref(storageJSON('reader:recent-text-colors', []).filter(name => textColorValue(name)).slice(0, 4))
const customActive = computed(() => isCustomTextColor(props.color))
const customColor = computed(() => isCustomTextColor(props.color) ? props.color : (textColorValue(props.color) || '#356ccc'))

function colorTitle(name) {
  return COLOR_NAMES[name] || name
}
function toneValue(name) {
  return textColorValue(name) || name
}
function pickColor(value) {
  const name = textColorName(value) || (isCustomTextColor(value) ? value.toLowerCase() : value)
  if (name) {
    recentColors.value = [name, ...recentColors.value.filter(item => item !== name)].slice(0, 4)
    storageSet('reader:recent-text-colors', JSON.stringify(recentColors.value))
  }
  emit('pick', 'color', name || null)
}
function onCustomInput(event) {
  const value = String(event.target.value || '')
  if (!isCustomTextColor(value)) return
  pickColor(value.toLowerCase())
}

onMounted(async () => {
  await nextTick()
  const active = el.value?.querySelector('button.is-on') || el.value?.querySelector('button')
  active?.focus()
})

function onKey(event) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const buttons = [...(el.value?.querySelectorAll('button:not(:disabled)') || [])]
  if (!buttons.length) return
  const at = buttons.indexOf(document.activeElement)
  const next = event.key === 'Home'
    ? buttons[0]
    : event.key === 'End'
      ? buttons[buttons.length - 1]
      : buttons[(at + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]
  next.focus()
}
</script>

<style scoped>
.text-style-menu {
  position: fixed;
  z-index: 60;
  width: 260px;
  padding: 9px 10px;
  border: 1px solid var(--c-line);
  border-radius: var(--radius-surface);
  background: var(--c-pop);
  box-shadow: var(--c-pop-shadow);
}
.text-style-menu p {
  margin: 0 0 6px;
  color: var(--c-sub);
  font-size: 10.5px;
}
.text-style-menu p + .style-row + p,
.text-style-menu .recent-label {
  margin-top: 9px;
}
.text-style-menu .recent-label {
  margin-bottom: 5px;
}
.style-row.recent-row {
  margin-bottom: 2px;
}
.style-row {
  display: flex;
  align-items: center;
  gap: 5px;
}
.style-row button,
.style-reset {
  cursor: pointer;
  border: 1px solid var(--c-line);
  background: var(--c-surface);
  border-radius: 7px;
}
.style-swatch,
.style-highlight {
  position: relative;
  width: 22px;
  height: 22px;
  flex: none;
}
.style-swatch {
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}
.style-custom {
  color: #fff;
  border-color: transparent !important;
  font-size: 15px;
  font-weight: 500;
  text-shadow: 0 1px 2px rgb(0 0 0 / .28);
}
.style-custom-input {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.style-highlight {
  border-color: color-mix(in srgb, var(--c-ink) 10%, transparent);
}
.style-reset {
  height: 22px;
  padding: 0 5px;
  color: var(--c-sub);
  font-size: 9.5px;
  white-space: nowrap;
}
.style-reset.is-on {
  border-color: transparent;
  background: var(--c-active);
  color: var(--c-ink);
}
.style-swatch.is-on,
.style-highlight.is-on {
  box-shadow: 0 0 0 2px var(--c-pop), 0 0 0 3px var(--c-ink);
}
.style-swatch.is-on::after,
.style-highlight.is-on::after {
  content: "";
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--c-ink);
  box-shadow: 0 0 0 1px var(--c-pop);
}
.text-style-menu button:hover {
  border-color: color-mix(in srgb, var(--c-accent) 55%, var(--c-line));
}
</style>
