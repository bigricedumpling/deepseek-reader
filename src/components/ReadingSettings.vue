<template>
  <div class="reading-settings">
    <div class="reading-tabs" role="tablist" aria-label="阅读设置">
      <button :aria-selected="tab === 'type'" :class="{ 'is-on': tab === 'type' }" @click="tab = 'type'">排版</button>
      <button :aria-selected="tab === 'look'" :class="{ 'is-on': tab === 'look' }" @click="tab = 'look'">外观</button>
    </div>

    <Transition name="pane" mode="out-in">
    <div v-if="tab === 'type'" key="type" class="reading-pane">
      <div class="type-tabs" role="tablist" aria-label="排版设置">
        <span class="seg-thumb" :class="{ 'is-moving': segMoving }" :style="{ transform: typeSection === 'text' ? 'translateX(0)' : 'translateX(calc(100% + 3px))' }" aria-hidden="true" />
        <button v-for="section in [{ id: 'text', label: '常用' }, { id: 'advanced', label: '更多' }]" :key="section.id" :aria-selected="typeSection === section.id" :class="{ 'is-on': typeSection === section.id }" @click="typeSection = section.id">{{ section.label }}</button>
      </div>
      <Transition name="pane" mode="out-in">
      <div v-if="typeSection === 'text'" key="text" class="type-groups">
        <section class="type-group"><p class="type-label">正文宽度</p><div class="type-row columns-3"><button v-for="w in WIDTHS" :key="w.value" class="type-chip" :class="{ 'is-on': reader.measure === w.value }" @click="reader.measure = w.value">{{ w.label }}</button></div></section>
        <section class="type-group"><p class="type-label">字号</p><div class="type-row columns-4"><button v-for="size in SIZES" :key="size.value" class="type-chip" :class="{ 'is-on': reader.size === size.value }" @click="reader.size = size.value">{{ size.label }}</button></div></section>
        <section class="type-group"><p class="type-label">字体</p>
          <div class="font-grid" role="radiogroup" aria-label="正文字体">
            <button v-for="f in FONTS" :key="f.id" class="font-card" :class="{ 'is-on': reader.font === f.id }" role="radio" :aria-checked="reader.font === f.id" :style="{ fontFamily: f.family }" @click="reader.font = f.id">
              <span class="font-sample">Ag</span>
              <span class="font-name">{{ f.label }}</span>
            </button>
          </div>
        </section>
        <section class="type-group"><p class="type-label"><span>行距</span><span class="tabular-nums">{{ reader.leading.toFixed(2) }}</span></p><input class="type-range type-range-leading" type="range" aria-label="行距" min="1.4" max="2.4" step=".05" :style="{ '--range-progress': Math.max(0, Math.min(100, ((reader.leading - 1.4) / 1) * 100)) + '%' }" :value="reader.leading" @input="reader.leading = Number($event.target.value)" /><div class="type-row columns-3"><button v-for="pace in PACE_OPTIONS" :key="pace.id" class="type-chip" :class="{ 'is-on': Math.abs(reader.leading - pace.lh) < .02 }" @click="reader.leading = pace.lh">{{ pace.label }}</button></div></section>
      </div>
      <div v-else class="type-groups">
        <section class="type-group"><p class="type-label">段落样式</p><div class="type-row columns-2"><button v-for="para in PARA_STYLES" :key="para.id" class="type-chip" :class="{ 'is-on': reader.paraStyle === para.id }" @click="reader.paraStyle = para.id">{{ para.label }}</button></div></section>
        <section class="type-group"><p class="type-label">中文加粗</p><div class="type-row columns-2"><button v-for="face in STRONG_FACES" :key="face.id" class="type-chip" :class="{ 'is-on': reader.strongFace === face.id }" @click="reader.strongFace = face.id">{{ face.label }}</button></div></section>
        <section class="type-group"><p class="type-label">中文斜体</p><div class="type-row columns-2"><button v-for="face in ITALIC_FACES" :key="face.id" class="type-chip" :class="{ 'is-on': reader.italicFace === face.id }" @click="reader.italicFace = face.id">{{ face.label }}</button></div></section>
        <section class="type-group"><p class="type-label"><span>字间距</span><span class="tabular-nums">{{ reader.tracking.toFixed(2) }} em</span></p><input class="type-range" type="range" aria-label="字间距" min="-.02" max=".12" step=".01" :style="{ '--range-progress': Math.max(0, Math.min(100, ((reader.tracking + .02) / .14) * 100)) + '%' }" :value="reader.tracking" @input="reader.tracking = Number($event.target.value)" /></section>
        <section class="type-group"><p class="type-label">表格宽度</p><div class="type-row columns-2"><button v-for="width in TABLE_WIDTHS" :key="width.id" class="type-chip" :class="{ 'is-on': reader.tableWidth === width.id }" @click="reader.tableWidth = width.id"><component :is="width.icon" :size="13" class="chip-icon" />{{ width.label }}</button></div></section>
        <section class="type-group"><p class="type-label">表格对齐</p><div class="type-row columns-3"><button v-for="align in TABLE_ALIGNS" :key="align.id" class="type-chip" :class="{ 'is-on': reader.tableAlign === align.id }" @click="reader.tableAlign = align.id"><component :is="align.icon" :size="13" class="chip-icon" />{{ align.label }}</button></div></section>
      </div>
      </Transition>
    </div>

    <div v-else key="look" class="reading-pane">
      <div class="type-groups">
        <section class="type-group">
          <p class="type-label"><span class="label-main"><PhCircleHalf :size="12" class="label-icon" />主题</span></p>
          <div class="type-row columns-3">
            <button v-for="t in THEMES" :key="t.id" class="type-chip" :class="{ 'is-on': reader.theme === t.id }" @click="reader.theme = t.id">
              <component v-if="t.icon" :is="t.icon" :size="13" class="chip-icon" />
              {{ t.label }}
            </button>
          </div>
        </section>
        <section class="type-group">
          <p class="type-label"><span class="label-main"><PhPalette :size="12" class="label-icon" />主题色</span></p>
          <div class="accent-row" role="radiogroup" aria-label="产品主题色">
            <button
              v-for="a in ACCENTS"
              :key="a.id"
              class="accent-swatch"
              :class="{ 'is-on': reader.accent === a.id }"
              role="radio"
              :aria-checked="reader.accent === a.id"
              :aria-label="a.label"
              :title="a.label"
              :style="{ '--swatch': reader.isDark ? a.dark : a.light }"
              @click="reader.accent = a.id"
            />
          </div>
        </section>
        <section class="type-group">
          <p class="type-label">
            <span class="label-main"><PhMagnifyingGlass :size="12" class="label-icon" />Markdown 阅读缩放</span>
            <span class="tabular-nums text-[var(--c-faint)]">{{ reader.zoom }}%</span>
          </p>
          <div class="type-row columns-3">
            <button v-for="z in ZOOMS" :key="z.value" class="type-chip" :class="{ 'is-on': reader.zoom === z.value }" @click="reader.zoom = z.value">{{ z.label }}</button>
          </div>
        </section>
      </div>
    </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { PhCircleHalf, PhCoffee, PhMagnifyingGlass, PhMoon, PhSun, PhArrowsInSimple, PhArrowsOutSimple, PhTextAlignCenter, PhTextAlignLeft, PhTextAlignRight, PhParagraph, PhTextIndent, PhPalette } from '../icons/remix'
import { useReaderStore, WIDTH_OPTIONS, PACE_OPTIONS, ACCENT_PRESETS } from '../stores/reader'

const emit = defineEmits(['close'])
const reader = useReaderStore()
const tab = ref('type')
const typeSection = ref('text')

/* 共享底块换位时先被拉长再回弹，避免只有位移没有形变。 */
const segMoving = ref(false)
let segTimer = 0
watch(typeSection, () => {
  segMoving.value = true
  clearTimeout(segTimer)
  segTimer = setTimeout(() => { segMoving.value = false }, 280)
})
onBeforeUnmount(() => clearTimeout(segTimer))

const WIDTHS = WIDTH_OPTIONS.map(w => ({ ...w }))
const SIZES = [
  { value: 14, label: '小' },
  { value: 15.5, label: '中' },
  { value: 17, label: '大' },
  { value: 18.5, label: '特大' }
]
const FONTS = [
  { id: 'serif', label: '衬线', family: '"TeX Gyre Pagella", "Noto Serif SC", "Songti SC", serif' },
  { id: 'songti', label: '宋体', family: '"Songti SC", "SimSun", "STSong", "Noto Serif SC", serif' },
  { id: 'sans', label: '无衬线', family: '"Noto Sans SC", "Heiti SC", sans-serif' },
  { id: 'harmony', label: '鸿蒙黑体', family: '"HarmonyOS Sans SC", "Noto Sans SC", sans-serif' },
  { id: 'kai', label: '楷体', family: '"ChillKai", "Kaiti SC", "楷体", serif' },
  { id: 'ping', label: '苹方', family: '"PingFang SC", "Hiragino Sans GB", sans-serif' }
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
const ACCENTS = ACCENT_PRESETS
const THEMES = [
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
.reading-tabs { display: flex; align-items: center; gap: 18px; position: relative; margin: -16px -16px 14px; padding: 0 16px; border-bottom: 1px solid var(--c-line); }
.reading-tabs button { position: relative; z-index: 1; min-height: 44px; padding: 14px 0 10px; border-radius: 0; background: transparent; color: var(--c-sub); font-size: 13px; transition: color 160ms ease; }
.reading-tabs button::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--c-ink); transform: scaleX(0); transform-origin: left; transition: transform 220ms var(--motion-pop); }
.reading-tabs button:hover { color: var(--c-ink); }
.reading-tabs button.is-on { color: var(--c-ink); }
.reading-tabs button.is-on::after { transform: scaleX(1); }
.type-tabs { position: relative; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; padding: 3px; background: var(--c-field); border-radius: var(--radius-control); margin-bottom: 18px; }
.seg-thumb { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 9px) / 2); border-radius: calc(var(--radius-control) - 3px); background: var(--c-pop); box-shadow: 0 1px 3px color-mix(in srgb, var(--c-ink) 8%, transparent); transition: transform 280ms var(--motion-pop), scale 180ms var(--motion-snap); pointer-events: none; transform-origin: center; }
.seg-thumb.is-moving { scale: .98 1.1; }
.type-tabs button { position: relative; z-index: 1; min-height: 30px; border-radius: calc(var(--radius-control) - 3px); color: var(--c-sub); font-size: 12px; transition: color 160ms ease; }
.type-tabs button.is-on { background: transparent; color: var(--c-ink); box-shadow: none; }
.reading-pane { display: block; min-width: 0; }
.type-groups { display: grid; gap: 20px; }
.pane-enter-active { transition: opacity 150ms ease, transform 220ms var(--motion-pop), filter 160ms ease; }
.pane-leave-active { transition: opacity 90ms ease, transform 120ms var(--motion-snap), filter 90ms ease; }
.pane-enter-from { opacity: 0; transform: translateY(5px) scale(.992); filter: blur(1px); }
.pane-leave-to { opacity: 0; transform: translateY(2px); filter: blur(.5px); }
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
.accent-row { display: flex; align-items: center; gap: 10px; padding: 2px 0; }
.accent-swatch { position: relative; width: 26px; height: 26px; flex: none; border-radius: 50%; background: var(--swatch); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-ink) 12%, transparent); transition: transform 160ms var(--motion-snap), box-shadow 160ms var(--motion-snap); }
.accent-swatch:hover { transform: scale(1.09); }
.accent-swatch.is-on { box-shadow: 0 0 0 2px var(--c-pop), 0 0 0 3px var(--c-ink); }
.accent-swatch.is-on::after { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.10); }
.font-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.font-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 52px; padding: 4px; border-radius: var(--radius-control); background: transparent; color: var(--c-sub); transition: color 160ms ease, transform 180ms var(--motion-pop); }
.font-card:hover { background: transparent; color: var(--c-ink); }
.font-card:active { transform: scale(.97); }
.font-card.is-on { background: transparent; color: var(--c-accent); box-shadow: none; }
.font-sample { font-size: 19px; line-height: 1.1; font-weight: 500; color: var(--c-sub); }
.font-card.is-on .font-sample { color: var(--c-accent); }
.font-name { font-family: var(--font-sans); font-size: 10px; line-height: 1.2; white-space: nowrap; }
.type-range {
  width: 100%;
  height: 18px;
  margin: 2px 0 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.type-range::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--c-ink) 0 var(--range-progress, 50%), var(--c-line) var(--range-progress, 50%) 100%);
}
.type-range::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4.5px;
  border: 1px solid color-mix(in srgb, var(--c-ink) 16%, transparent);
  border-radius: 50%;
  background: var(--c-pop);
  box-shadow: 0 1px 3px #0002;
  transition: transform 160ms var(--motion-snap), box-shadow 160ms var(--motion-snap);
}
.type-range:hover::-webkit-slider-thumb { transform: scale(1.15); box-shadow: 0 2px 6px #0003; }
.type-range:active::-webkit-slider-thumb { transform: scale(1.05); }
.type-range::-moz-range-track { height: 3px; border-radius: 999px; background: var(--c-line); }
.type-range::-moz-range-progress { height: 3px; border-radius: 999px; background: var(--c-ink); }
.type-range::-moz-range-thumb { width: 12px; height: 12px; border: 1px solid color-mix(in srgb, var(--c-ink) 16%, transparent); border-radius: 50%; background: var(--c-pop); box-shadow: 0 1px 3px #0002; }
.type-range:hover::-moz-range-thumb { transform: scale(1.15); }
.type-range-leading { margin: 0 0 2px; }
.type-range:focus-visible { outline: none; }
.type-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px var(--c-active), 0 1px 3px #0002; }

.chip-icon { flex: none; }
.label-main { display: inline-flex; align-items: center; gap: 5px; }
.label-icon { flex: none; color: var(--c-faint); }
.type-group :deep(.select-menu-trigger) { width: 100%; min-height: 34px; padding: 8px 12px; justify-content: space-between; }
</style>
