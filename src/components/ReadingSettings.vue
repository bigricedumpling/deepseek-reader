<template>
  <div class="reading-settings">
    <ReadingChoices v-model="reader.theme" label="外观" :options="themes" />
    <ReadingChoices class="document-styles" v-model="reader.documentStyle" label="文档风格" :options="DOCUMENT_STYLES" />
    <ReadingChoices v-model="reader.font" label="正文字体" :options="fonts" :columns="3" />
    <ReadingChoices v-model="reader.size" label="字号" :options="sizes" />
    <ReadingChoices v-model="reader.measure" label="正文宽度" :options="WIDTH_OPTIONS" />
    <label class="slider-row">
      <span>行距</span>
      <input v-model.number="reader.leading" type="range" min="1.4" max="2.4" step="0.05" aria-label="行距">
      <output>{{ reader.leading.toFixed(2) }}</output>
    </label>
    <details class="reading-details">
      <summary>更多排版<PhCaretDown :size="14" aria-hidden="true" /></summary>
      <div class="details-content">
        <ReadingChoices v-model="reader.paraStyle" label="段落样式" :options="paragraphs" />
        <label class="slider-row">
          <span>字间距</span>
          <input v-model.number="reader.tracking" type="range" min="-0.02" max="0.12" step="0.01" aria-label="字间距">
          <output>{{ reader.tracking.toFixed(2) }} em</output>
        </label>
        <ReadingChoices v-model="reader.strongFace" label="中文加粗" :options="strongFaces" />
        <ReadingChoices v-model="reader.italicFace" label="中文斜体" :options="italicFaces" />
        <ReadingChoices v-model="reader.tableWidth" label="表格宽度" :options="tableWidths" />
        <ReadingChoices v-model="reader.tableAlign" label="表格对齐" :options="tableAligns" />
        <label class="zoom-row">
          <span>阅读缩放</span>
          <select v-model.number="reader.zoom" aria-label="阅读缩放">
            <option v-for="zoom in zooms" :key="zoom" :value="zoom">{{ zoom }}%</option>
          </select>
          <PhCaretDown :size="12" aria-hidden="true" />
        </label>
      </div>
    </details>
  </div>
</template>

<script setup>
import { PhCaretDown, PhSun, PhMoon, PhCircleHalf } from '../icons/remix'
import { useReaderStore, DOCUMENT_STYLES, WIDTH_OPTIONS } from '../stores/reader'
import ReadingChoices from './ReadingChoices.vue'

const reader = useReaderStore()
const themes = [
  { value: 'light', label: '浅色', icon: PhSun },
  { value: 'sepia', label: '柔和', icon: PhCircleHalf },
  { value: 'dark', label: '深色', icon: PhMoon }
]
const sizes = [
  { value: 14, label: '小' }, { value: 15.5, label: '中' },
  { value: 17, label: '大' }, { value: 18.5, label: '特大' }
]
const fonts = [
  { value: 'serif', label: '衬线', family: '"TeX Gyre Pagella", "Noto Serif SC", "Songti SC", serif' },
  { value: 'songti', label: '宋体', family: '"Songti SC", SimSun, STSong, "Noto Serif SC", serif' },
  { value: 'sans', label: '无衬线', family: '"Noto Sans SC", "Heiti SC", sans-serif' },
  { value: 'harmony', label: '鸿蒙黑体', family: '"HarmonyOS Sans SC", "Noto Sans SC", sans-serif' },
  { value: 'kai', label: '楷体', family: 'ChillKai, "Kaiti SC", STKaiti, 楷体, serif' },
  { value: 'ping', label: '苹方', family: '"PingFang SC", "Hiragino Sans GB", sans-serif' }
]
const paragraphs = [
  { value: 'space', label: '段间距' }, { value: 'indent', label: '首行缩进' }
]
const strongFaces = [
  { value: 'bold', label: '标准加粗' }, { value: 'black', label: '特黑' }
]
const italicFaces = [
  { value: 'kai', label: '楷体替代' }, { value: 'none', label: '保留字形' }
]
const tableWidths = [
  { value: 'measure', label: '跟随正文' }, { value: 'full', label: '铺满页面' }
]
const tableAligns = [
  { value: 'left', label: '左' }, { value: 'center', label: '中' }, { value: 'right', label: '右' }
]
const zooms = [80, 90, 100, 115, 130, 150]
</script>

<style scoped>
.reading-settings { container-type: inline-size; --setting-label: 52px; --setting-gap: 12px; min-width: 0; display: grid; gap: 12px; }
.slider-row, .zoom-row { display: grid; grid-template-columns: var(--setting-label) minmax(0, 1fr) auto; gap: var(--setting-gap); position: relative; align-items: center; min-height: 30px; font-size: 12px; color: var(--c-sub); }
.slider-row input { appearance: none; width: 100%; height: 30px; min-width: 0; margin: 0; background: transparent; cursor: pointer; }
.slider-row input::-webkit-slider-runnable-track { height: 3px; border-radius: 3px; background: var(--c-line); }
.slider-row input::-webkit-slider-thumb { appearance: none; width: 13px; height: 13px; margin-top: -5px; border-radius: 50%; background: var(--c-accent); }
.slider-row input::-moz-range-track { height: 3px; border-radius: 3px; background: var(--c-line); }
.slider-row input::-moz-range-thumb { width: 13px; height: 13px; border: 0; border-radius: 50%; background: var(--c-accent); }
.slider-row output { min-width: 3ch; color: var(--c-text); font-variant-numeric: tabular-nums; text-align: right; }
.reading-details summary { display: flex; width: fit-content; align-items: center; gap: 5px; margin-left: -5px; padding: 5px; min-height: 30px; border-radius: var(--radius-control); color: var(--c-sub); font-size: 12px; list-style: none; cursor: pointer; }
.reading-details summary::-webkit-details-marker { display: none; }
.reading-details summary:hover { color: var(--c-ink); background: var(--c-hover); }
.reading-details[open] summary svg { transform: rotate(180deg); }
.reading-details:not([open]) > .details-content { display: none; }
.details-content { padding-top: 12px; display: grid; gap: 12px; }
.zoom-row { grid-template-columns: var(--setting-label) minmax(0, 1fr); }
.zoom-row select { appearance: none; width: fit-content; border-radius: var(--radius-control); min-height: 30px; min-width: 72px; padding: 4px 25px 4px 9px; background: var(--c-field); color: var(--c-text); }
.zoom-row svg { position: absolute; left: calc(var(--setting-label) + var(--setting-gap) + 51px); pointer-events: none; }
@container (max-width: 285px) {
  .document-styles :deep(.choice-options) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (pointer:coarse) { .slider-row input, .zoom-row select, .reading-details summary { min-height: 44px; } }
</style>
