<template>
  <div class="reading-settings">
    <button class="pop-item reading-back" @click="emit('close')"><PhCaretLeft :size="15" />阅读设置</button>

    <div class="reading-tabs" role="tablist" aria-label="阅读设置">
      <button :aria-selected="tab === 'type'" :class="{ 'is-on': tab === 'type' }" @click="tab = 'type'">排版</button>
      <button :aria-selected="tab === 'look'" :class="{ 'is-on': tab === 'look' }" @click="tab = 'look'">外观</button>
    </div>

    <template v-if="tab === 'type'">
      <div class="type-tabs" role="tablist" aria-label="排版设置">
        <button v-for="section in [{ id: 'text', label: '常用' }, { id: 'advanced', label: '更多' }]" :key="section.id" :aria-selected="typeSection === section.id" :class="{ 'is-on': typeSection === section.id }" @click="typeSection = section.id">{{ section.label }}</button>
      </div>
      <div v-if="typeSection === 'text'" class="type-groups">
        <section class="type-group"><p class="type-label">正文宽度</p><div class="type-row columns-3"><button v-for="w in WIDTHS" :key="w.value" class="type-chip" :class="{ 'is-on': reader.measure === w.value }" @click="reader.measure = w.value">{{ w.label }}</button></div></section>
        <section class="type-group"><p class="type-label">字号</p><div class="type-row columns-4"><button v-for="size in SIZES" :key="size.value" class="type-chip" :class="{ 'is-on': reader.size === size.value }" @click="reader.size = size.value">{{ size.label }}</button></div></section>
        <section class="type-group"><p class="type-label">字体</p><SelectMenu v-model="reader.font" :options="FONTS.map(f => ({ value: f.id, label: f.label }))" label="字体" /></section>
        <section class="type-group"><p class="type-label"><span>行距</span><span class="tabular-nums">{{ reader.leading.toFixed(2) }}</span></p><div class="type-row columns-3"><button v-for="pace in PACE_OPTIONS" :key="pace.id" class="type-chip" :class="{ 'is-on': Math.abs(reader.leading - pace.lh) < .02 }" @click="reader.leading = pace.lh">{{ pace.label }}</button></div><input class="type-range" type="range" aria-label="行距" min="1.4" max="2.4" step=".05" :value="reader.leading" @input="reader.leading = Number($event.target.value)" /></section>
      </div>
      <div v-else class="type-groups">
        <section class="type-group"><p class="type-label">段落样式</p><div class="type-row columns-2"><button v-for="para in PARA_STYLES" :key="para.id" class="type-chip" :class="{ 'is-on': reader.paraStyle === para.id }" @click="reader.paraStyle = para.id">{{ para.label }}</button></div></section>
        <section class="type-group"><p class="type-label">中文加粗</p><div class="type-row columns-2"><button v-for="face in STRONG_FACES" :key="face.id" class="type-chip" :class="{ 'is-on': reader.strongFace === face.id }" @click="reader.strongFace = face.id">{{ face.label }}</button></div></section>
        <section class="type-group"><p class="type-label">中文斜体</p><div class="type-row columns-2"><button v-for="face in ITALIC_FACES" :key="face.id" class="type-chip" :class="{ 'is-on': reader.italicFace === face.id }" @click="reader.italicFace = face.id">{{ face.label }}</button></div></section>
        <section class="type-group"><p class="type-label"><span>字间距</span><span class="tabular-nums">{{ reader.tracking.toFixed(2) }} em</span></p><input class="type-range" type="range" aria-label="字间距" min="-.02" max=".12" step=".01" :value="reader.tracking" @input="reader.tracking = Number($event.target.value)" /></section>
        <section class="type-group"><p class="type-label">表格宽度</p><div class="type-row columns-2"><button v-for="width in TABLE_WIDTHS" :key="width.id" class="type-chip" :class="{ 'is-on': reader.tableWidth === width.id }" @click="reader.tableWidth = width.id"><component :is="width.icon" :size="13" class="chip-icon" />{{ width.label }}</button></div></section>
        <section class="type-group"><p class="type-label">表格对齐</p><div class="type-row columns-3"><button v-for="align in TABLE_ALIGNS" :key="align.id" class="type-chip" :class="{ 'is-on': reader.tableAlign === align.id }" @click="reader.tableAlign = align.id"><component :is="align.icon" :size="13" class="chip-icon" />{{ align.label }}</button></div></section>
      </div>
    </template>

    <template v-else>
      <p class="type-label"><span class="label-main"><PhCircleHalf :size="12" class="label-icon" />主题</span></p>
      <div class="type-row columns-2">
        <button v-for="t in THEMES" :key="t.id" class="type-chip" :class="{ 'is-on': reader.theme === t.id }" @click="reader.theme = t.id">
          <component v-if="t.icon" :is="t.icon" :size="13" class="chip-icon" />
          {{ t.label }}
        </button>
      </div>
      <p class="type-label">
        <span class="label-main"><PhMagnifyingGlass :size="12" class="label-icon" />Markdown 阅读缩放</span>
        <span class="tabular-nums text-[var(--c-faint)]">{{ reader.zoom }}%</span>
      </p>
      <div class="type-row columns-3">
        <button v-for="z in ZOOMS" :key="z.value" class="type-chip" :class="{ 'is-on': reader.zoom === z.value }" @click="reader.zoom = z.value">{{ z.label }}</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { PhCaretLeft, PhCircleHalf, PhCoffee, PhMagnifyingGlass, PhMoon, PhSun, PhArrowsInSimple, PhArrowsOutSimple, PhTextAlignCenter, PhTextAlignLeft, PhTextAlignRight, PhParagraph, PhTextIndent } from '@phosphor-icons/vue'
import SelectMenu from './SelectMenu.vue'
import { useReaderStore, WIDTH_OPTIONS, PACE_OPTIONS } from '../stores/reader'

const emit = defineEmits(['close'])
const reader = useReaderStore()
const tab = ref('type')
const typeSection = ref('text')

const WIDTHS = WIDTH_OPTIONS.map(w => ({ ...w }))
const SIZES = [
  { value: 14, label: '小' },
  { value: 15.5, label: '中' },
  { value: 17, label: '大' },
  { value: 18.5, label: '特大' }
]
const FONTS = [
  { id: 'serif', label: '衬线' },
  { id: 'sans', label: '无衬线' },
  { id: 'harmony', label: '鸿蒙黑体' },
  { id: 'kai', label: '楷体' },
  { id: 'ping', label: '苹方' }
]
const STRONG_FACES = [
  { id: 'black', label: '特黑' },
  { id: 'bold', label: '标准加粗' }
]
const ITALIC_FACES = [
  { id: 'kai', label: '楷体替代' },
  { id: 'none', label: '保留字形' }
]
const ZOOMS = [
  { value: 80, label: '80%' },
  { value: 90, label: '90%' },
  { value: 100, label: '100%' },
  { value: 115, label: '115%' },
  { value: 130, label: '130%' },
  { value: 150, label: '150%' }
]
const THEMES = [
  { id: 'auto', label: '跟随系统', icon: PhCircleHalf },
  { id: 'light', label: '浅色', icon: PhSun },
  { id: 'sepia', label: '护眼', icon: PhCoffee },
  { id: 'dark', label: '深色', icon: PhMoon }
]
const TABLE_WIDTHS = [
  { id: 'full', label: '铺满页面', icon: PhArrowsOutSimple },
  { id: 'measure', label: '跟随正文', icon: PhArrowsInSimple }
]
const TABLE_ALIGNS = [
  { id: 'left', label: '左', icon: PhTextAlignLeft },
  { id: 'center', label: '中', icon: PhTextAlignCenter },
  { id: 'right', label: '右', icon: PhTextAlignRight }
]
const PARA_STYLES = [
  { id: 'space', label: '段间距', icon: PhParagraph },
  { id: 'indent', label: '首行缩进', icon: PhTextIndent }
]
</script>

<style scoped>
.reading-settings { display: flex; flex-direction: column; min-width: 0; }
.reading-back { display:flex; align-items:center; gap:8px; width:100%; padding:8px 6px; margin:-6px 0 6px -6px; border-radius:var(--radius-control); color:var(--c-sub); font-size:12px; text-align:left; }
.reading-back:hover { background:var(--c-hover); color:var(--c-ink); }
.reading-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; padding: 3px; margin-bottom: 14px; background: var(--c-field); border-radius: var(--radius-control); }
.reading-tabs button { min-height: 30px; border-radius: calc(var(--radius-control) - 3px); color: var(--c-sub); font-size: 12px; }
.reading-tabs button.is-on { background: var(--c-pop); color: var(--c-ink); box-shadow: 0 1px 3px color-mix(in srgb, var(--c-ink) 8%, transparent); }
.type-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; padding: 3px; margin-bottom: 18px; background: var(--c-field); border-radius: var(--radius-control); }
.type-tabs button { min-height: 30px; border-radius: calc(var(--radius-control) - 3px); color: var(--c-sub); font-size: 12px; }
.type-tabs button.is-on { background: var(--c-pop); color: var(--c-ink); box-shadow: 0 1px 3px color-mix(in srgb, var(--c-ink) 8%, transparent); }
.type-groups { display: grid; gap: 20px; }
.type-group { display: grid; gap: 8px; min-width: 0; }
.type-label { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0; min-height: 16px; color: var(--c-sub); font-size: 12px; }
.type-label:first-child { margin-top: 0; }
.type-row { display: grid; gap: 5px; }
.type-row.columns-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.type-row.columns-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.type-row.columns-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.type-chip { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 32px; padding: 6px 8px; border-radius: var(--radius-control); background: var(--c-field); color: var(--c-sub); font-size: 12px; white-space: nowrap; }
.type-chip:hover { background: var(--c-chip-hover); color: var(--c-ink); }
.type-chip:active { transform: scale(.96); }
.type-chip.is-on { background: var(--c-active); color: var(--c-accent); }
.type-range { width: 100%; accent-color: var(--c-accent); }
.chip-icon { flex: none; }
.label-main { display: inline-flex; align-items: center; gap: 5px; }
.label-icon { flex: none; color: var(--c-faint); }
.type-group :deep(.select-menu-trigger) { width: 100%; min-height: 34px; padding: 8px 12px; justify-content: space-between; }
</style>
