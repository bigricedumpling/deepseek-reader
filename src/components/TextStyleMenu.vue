<template>
  <Teleport to="body">
    <div class="text-style-menu ui-font" :style="{ left: x + 'px', top: y + 'px' }" @mousedown.prevent>
      <p>文字颜色</p>
      <div class="style-row">
        <button v-for="(hex, name) in TEXT_COLORS" :key="name" class="style-swatch"
          :title="COLOR_NAMES[name]" :aria-label="`文字颜色 ${COLOR_NAMES[name]}`" :style="{ color: hex }" @click="emit('pick', 'color', name)">A</button>
        <button class="style-reset" @click="emit('pick', 'color', null)">默认</button>
      </div>
      <p>马克笔高光</p>
      <div class="style-row">
        <button v-for="(hex, name) in HIGHLIGHT_COLORS" :key="name" class="style-highlight"
          :title="COLOR_NAMES[name]" :aria-label="`高光 ${COLOR_NAMES[name]}`" :style="{ backgroundColor: hex }" @click="emit('pick', 'highlight', name)"></button>
        <button class="style-reset" @click="emit('pick', 'highlight', null)">清除</button>
      </div>
      <button class="style-underline" @click="emit('pick', 'underline', null)"><u>U</u> 下划线</button>
    </div>
  </Teleport>
</template>

<script setup>
import { TEXT_COLORS, HIGHLIGHT_COLORS } from '../utils/inline-style'
const COLOR_NAMES = { red: '红色', orange: '橙色', green: '绿色', blue: '蓝色', purple: '紫色', gray: '灰色', yellow: '黄色', pink: '粉色' }
defineProps({ x: Number, y: Number })
const emit = defineEmits(['pick'])
</script>

<style scoped>
.text-style-menu { position:fixed; z-index:60; width:250px; padding:10px; border:1px solid var(--c-line); border-radius:var(--radius-surface); background:var(--c-pop); box-shadow:var(--c-pop-shadow) }
.text-style-menu p { margin:1px 0 7px; font-size:11px; color:var(--c-sub) }
.style-row { display:flex; align-items:center; gap:6px; margin-bottom:12px }
.style-row button, .style-underline { cursor:pointer; border:1px solid var(--c-line); background:var(--c-surface); border-radius:var(--radius-control) }
.style-swatch { width:25px; height:25px; font-size:15px; font-weight:700 }
.style-highlight { width:25px; height:25px }
.style-reset { height:25px; padding:0 6px; color:var(--c-sub); font-size:10px }
.style-underline { display:flex; gap:8px; align-items:center; width:100%; padding:6px 8px; color:var(--c-text); font-size:12px }
.style-underline u { font-size:15px }
.text-style-menu button:hover { border-color:var(--c-accent) }
</style>
