<template>
  <div class="h-screen flex flex-col overflow-hidden">
    <!-- 顶部工具条：左侧是打开的文档，右侧是各功能入口 -->
    <div class="h-[52px] px-8 flex items-center justify-end gap-1.5 flex-shrink-0">
      <!-- 打开的文档：多开、切换、关掉（出现/消失也带一点过渡） -->
      <transition name="pop">
        <DocTabs
          v-if="tabItems.length > 1"
          class="mr-auto"
          :items="tabItems"
          :active="docId"
          @select="emit('select', $event)"
          @close="onCloseTab"
        />
      </transition>

      <!-- 搜索 -->
      <div class="relative">
        <div
          class="flex items-center gap-2 h-8 px-3 rounded-lg bg-[var(--c-field)] transition-all duration-200"
          :class="searchOpen ? 'w-[320px] bg-[var(--c-pop)] ring-1 ring-[var(--c-line)]' : 'w-[150px]'"
        >
          <PhMagnifyingGlass :size="13" class="text-[var(--c-faint)] shrink-0" />
          <input
            ref="searchInput"
            :value="keyword"
            class="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] text-[var(--c-ink)] placeholder:text-[var(--c-faint)]"
            placeholder="搜索"
            @focus="searchOpen = true"
            @input="emit('update:keyword', $event.target.value)"
            @keydown.esc="closeSearch"
          />
          <button v-if="keyword" class="text-[var(--c-faint)] hover:text-[var(--c-sub)]" @click="clearSearch">
            <PhX :size="12" />
          </button>
        </div>

        <div
          v-if="searchOpen && keyword.trim()"
          class="search-drop absolute right-0 top-[38px] w-[460px] max-h-[62vh] overflow-y-auto bg-[var(--c-pop)] rounded-xl shadow-[var(--c-pop-shadow)] p-2 z-50"
        >
          <p v-if="!results.length" class="text-[12px] text-[var(--c-faint)] px-3 py-4 text-center">
            没有匹配
          </p>
          <div v-for="r in results" :key="r.id" class="mb-1.5">
            <div class="flex items-center gap-2 px-3 py-1.5">
              <span class="text-[11.5px] text-ds">{{ r.title }}</span>
              <span class="text-[10.5px] text-[var(--c-faint)] tabular-nums">{{ r.hits.length }}</span>
            </div>
            <button
              v-for="(h, i) in r.hits.slice(0, 6)"
              :key="i"
              class="flex gap-3 w-full text-left px-3 py-1.5 rounded-lg hover:bg-[var(--c-hover)] transition-colors"
              @mousedown.prevent="onResultClick(r)"
            >
              <span
                class="text-[12px] leading-relaxed text-[var(--c-sub)] line-clamp-2"
                v-html="highlight(h.text, keyword)"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- 排版：宽度、字号、字体、强调面、段落、表格、字间距 -->
      <div class="relative">
        <button
          class="btn-icon"
          :class="{ 'is-active': open === 'type' }"
          title="排版"
          @click="toggle('type')"
        >
          <PhTextT :size="15" />
        </button>
        <transition name="pop">
          <div v-if="open === 'type'" class="pop-menu is-panel w-[252px]">
            <p class="type-label"><span class="label-main"><component :is="PhArrowsHorizontal" :size="12" class="label-icon" />正文宽度</span></p>
            <div class="type-row">
              <button
                v-for="w in WIDTHS"
                :key="w.value"
                class="type-chip"
                :class="{ 'is-on': reader.measure === w.value }"
                @click="pickWidth(w.value)"
              >
                <component v-if="w.icon" :is="w.icon" :size="13" class="chip-icon" />
                {{ w.label }}
              </button>
            </div>

            <p class="type-label"><span class="label-main"><component :is="PhTextT" :size="12" class="label-icon" />正文字号</span></p>
            <div class="type-row">
              <button
                v-for="s2 in SIZES"
                :key="s2.value"
                class="type-chip"
                :class="{ 'is-on': reader.size === s2.value }"
                @click="pickSize(s2.value)"
              >
                <component v-if="s2.icon" :is="s2.icon" :size="13" class="chip-icon" />
                {{ s2.label }}
              </button>
            </div>

            <p class="type-label"><span class="label-main"><component :is="PhTextAa" :size="12" class="label-icon" />正文字体</span></p>
            <div class="type-row">
              <button
                v-for="f in FONTS"
                :key="f.id"
                class="type-chip"
                :class="{ 'is-on': reader.font === f.id }"
                :style="{ fontFamily: f.stack }"
                @click="reader.font = f.id"
              >
                <component v-if="f.icon" :is="f.icon" :size="13" class="chip-icon" />
                {{ f.label }}
              </button>
            </div>

            <p class="type-label"><span class="label-main"><component :is="PhTextB" :size="12" class="label-icon" />中文加粗</span></p>
            <div class="type-row">
              <button
                v-for="w in STRONG_FACES"
                :key="w.id"
                class="type-chip"
                :class="{ 'is-on': reader.strongFace === w.id }"
                :style="{ fontWeight: w.weight }"
                @click="reader.strongFace = w.id"
              >
                <component v-if="w.icon" :is="w.icon" :size="13" class="chip-icon" />
                {{ w.label }}
              </button>
            </div>

            <p class="type-label"><span class="label-main"><component :is="PhTextItalic" :size="12" class="label-icon" />中文斜体</span></p>
            <div class="type-row">
              <button
                v-for="i2 in ITALIC_FACES"
                :key="i2.id"
                class="type-chip"
                :class="{ 'is-on': reader.italicFace === i2.id }"
                :style="i2.style"
                @click="reader.italicFace = i2.id"
              >
                <component v-if="i2.icon" :is="i2.icon" :size="13" class="chip-icon" />
                {{ i2.label }}
              </button>
            </div>

            <p class="type-label"><span class="label-main"><component :is="PhParagraph" :size="12" class="label-icon" />段落</span></p>
            <div class="type-row">
              <button
                v-for="p2 in PARA_STYLES"
                :key="p2.id"
                class="type-chip"
                :class="{ 'is-on': reader.paraStyle === p2.id }"
                @click="reader.paraStyle = p2.id"
              >
                <component v-if="p2.icon" :is="p2.icon" :size="13" class="chip-icon" />
                {{ p2.label }}
              </button>
            </div>

            <p class="type-label"><span class="label-main"><component :is="PhTable" :size="12" class="label-icon" />表格宽度</span></p>
            <div class="type-row">
              <button
                v-for="tw in TABLE_WIDTHS"
                :key="tw.id"
                class="type-chip"
                :class="{ 'is-on': reader.tableWidth === tw.id }"
                @click="reader.tableWidth = tw.id"
              >
                <component v-if="tw.icon" :is="tw.icon" :size="13" class="chip-icon" />
                {{ tw.label }}
              </button>
            </div>

            <p class="type-label"><span class="label-main"><component :is="PhTextAlignLeft" :size="12" class="label-icon" />表格对齐</span></p>
            <div class="type-row">
              <button
                v-for="ta in TABLE_ALIGNS"
                :key="ta.id"
                class="type-chip"
                :class="{ 'is-on': reader.tableAlign === ta.id }"
                @click="reader.tableAlign = ta.id"
              >
                <component v-if="ta.icon" :is="ta.icon" :size="13" class="chip-icon" />
                {{ ta.label }}
              </button>
            </div>

            <p class="type-label">
              <span class="label-main"><PhArrowsVertical :size="12" class="label-icon" />行距</span>
              <span class="tabular-nums text-[var(--c-faint)]">{{ reader.leading.toFixed(2) }}</span>
            </p>
            <div class="type-row">
              <button
                v-for="p in PACE_OPTIONS"
                :key="p.id"
                class="type-chip"
                :class="{ 'is-on': Math.abs(reader.leading - p.lh) < 0.02 }"
                @click="reader.leading = p.lh"
              >
                {{ p.label }}
              </button>
            </div>
            <input
              class="type-range"
              type="range"
              min="1.4"
              max="2.4"
              step="0.05"
              :value="reader.leading"
              @input="reader.leading = Number($event.target.value)"
            />

            <p class="type-label">
              <span class="label-main"><PhArrowsHorizontal :size="12" class="label-icon" />字间距</span>
              <span class="tabular-nums text-[var(--c-faint)]">{{ reader.tracking.toFixed(2) }}</span>
            </p>
            <input
              class="type-range"
              type="range"
              min="-0.02"
              max="0.12"
              step="0.01"
              :value="reader.tracking"
              @input="reader.tracking = Number($event.target.value)"
            />
          </div>
        </transition>
      </div>

      <!-- 外观：主题、缩放 -->
      <div class="relative">
        <button
          class="btn-icon"
          :class="{ 'is-active': open === 'look' }"
          title="外观"
          @click="toggle('look')"
        >
          <PhCircleHalf :size="15" />
        </button>
        <transition name="pop">
          <div v-if="open === 'look'" class="pop-menu is-panel w-[164px]">
            <p class="type-label"><span class="label-main"><component :is="PhCircleHalf" :size="12" class="label-icon" />主题</span></p>
            <div class="type-row">
              <button
                v-for="t in THEMES"
                :key="t.id"
                class="type-chip"
                :class="{ 'is-on': reader.theme === t.id }"
                @click="reader.theme = t.id"
              >
                <component v-if="t.icon" :is="t.icon" :size="13" class="chip-icon" />
                {{ t.label }}
              </button>
            </div>

            <p class="type-label">
              <span class="label-main"><PhMagnifyingGlass :size="12" class="label-icon" />缩放</span>
              <span class="tabular-nums text-[var(--c-faint)]">{{ reader.zoom }}%</span>
            </p>
            <div class="type-row">
              <button
                v-for="z in ZOOMS"
                :key="z.value"
                class="type-chip"
                :class="{ 'is-on': reader.zoom === z.value }"
                @click="reader.zoom = z.value"
              >
                <component v-if="z.icon" :is="z.icon" :size="13" class="chip-icon" />
                {{ z.value }}
              </button>
            </div>
          </div>
        </transition>
      </div>

      <!-- 导出：md 与 PDF -->
      <!-- 分享（原「导出」并进来了：对外链接、导出、打印都在这一个菜单里） -->
      <div v-if="!store.isGuest" class="relative">
        <button
          class="btn-icon"
          :class="{ 'is-active': open === 'share' }"
          title="分享"
          @click="toggle('share')"
        >
          <PhShareNetwork :size="15" />
        </button>
        <transition name="pop">
          <div v-if="open === 'share'" class="pop-menu is-panel w-[330px]">
            <p class="type-label">
              <span class="label-main"><PhShareNetwork :size="12" class="label-icon" />分享</span>
            </p>
            <div class="share-link-row">
              <input class="share-link-input" :value="guestLink" readonly @focus="$event.target.select()" />
              <button class="share-copy" @click="copyLink">{{ copied ? '已复制' : '复制' }}</button>
            </div>
            <div class="share-sep" />
            <button class="pop-item" @click="pickExport('md')">
              <span class="pop-label"><PhFileText :size="14" class="menu-icon" />导出 markdown</span>
            </button>
            <button class="pop-item" @click="pickExport('pdf')">
              <span class="pop-label"><PhPrinter :size="14" class="menu-icon" />打印 / 导出 PDF</span>
            </button>
          </div>
        </transition>
      </div>

      <!-- pdf 翻译：没翻过就起任务，翻好了就是「看译文 / 看原文」的开关 -->
      <button
        v-if="isPdf && !store.isGuest"
        class="btn-icon"
        :class="{ 'is-active': store.pdfView === 'translated' }"
        :title="translateTip"
        @click="onTranslate"
      >
        <PhSpinnerGap v-if="store.pdfTranslate.status === 'running'" :size="15" class="spin" />
        <PhTranslate v-else :size="15" />
      </button>

      <!-- 目录开关 -->
      <button
        class="btn-icon"
        :class="{ 'is-active': reader.tocOpen }"
        title="目录"
        @click="reader.tocOpen = !reader.tocOpen"
      >
        <PhListDashes :size="15" />
      </button>

    </div>

    <!-- 斜杠菜单里「插入文档」用的选择器 -->
    <DocPicker v-if="pickDoc" @close="pickDoc = false" @pick="onPickDoc" />

    <!-- 出错提示 -->
    <div
      v-if="error"
      class="mx-6 mb-1 px-3.5 py-2.5 rounded-lg bg-[var(--c-field)] ring-1 ring-[var(--c-line)] flex items-start gap-2.5 shrink-0"
    >
      <PhWarningCircle :size="15" class="text-[#d9534f] mt-[1px] shrink-0" />
      <span class="ui-font flex-1 text-[12.5px] leading-relaxed text-[#c0392b]">{{ error }}</span>
      <button class="ui-font text-[12px] text-[#c0392b] underline shrink-0" @click="emit('reload')">
        重新读取
      </button>
    </div>

    <!-- 正文：永远可编辑，没有阅读态和编辑态之分 -->
    <div
      id="main-scroll-container"
      ref="scroller"
      class="flex-1 min-h-0 overflow-y-auto print-area"
      :style="reader.readingStyle"
    >
      <!-- PDF：交给浏览器自带的阅读器，支持翻页和跳页（服务端带 Range） -->
      <iframe
        v-if="isPdf"
        ref="frameRef"
        class="pdf-frame"
        :src="pdfSrc"
        :title="meta.name || 'PDF'"
      />
      <MarkdownEditor
        v-else-if="loaded"
        :key="docId + ':' + epoch"
        :readonly="store.isGuest"
        @pick-doc="pickDoc = true"
        @open-doc="store.select($event)"
        :value="raw"
        :doc-id="docId"
        :doc-file="meta.file || ''"
        :style="reader.readingStyle"
        @update:value="emit('input', $event)"
        @canonize="emit('canonize', $event)"
      />
      <p v-else class="ui-font text-[13px] text-[var(--c-faint)] text-center pt-24">正在读取…</p>
    </div>

    <!-- 底栏 -->
    <div
      class="h-8 px-8 flex items-center gap-3 text-[11.5px] text-[var(--c-faint)] shrink-0 border-t border-[var(--c-line-soft)]"
    >
      <!-- pdf 没有正文可数，显示页数和体积 -->
      <template v-if="isPdf">
        <span class="ui-font tabular-nums">{{ pdfPages ? pdfPages + ' 页' : 'PDF' }}</span>
        <span v-if="meta.size" class="ui-font tabular-nums">{{ (meta.size / 1024 / 1024).toFixed(1) }} MB</span>
        <span v-if="store.pdfTranslate.status === 'running'" class="ui-font tabular-nums text-[var(--color-ds)]">
          翻译中 {{ store.pdfTranslate.progress }}%
        </span>
        <button
          v-else-if="store.pdfTranslate.status === 'done'"
          class="ui-font underline text-[var(--color-ds)]"
          @click="onTranslate"
        >
          {{ store.pdfView === 'translated' ? '正在看译文 · 点回原文' : '译文已就绪 · 点看译文' }}
        </button>
      </template>
      <template v-else>
        <span class="ui-font tabular-nums" :title="stats.tip">{{ stats.total }} 字</span>
        <span class="ui-font tabular-nums">{{ stats.lines }} 行</span>
      </template>
      <span class="ui-font ml-auto flex items-center gap-1.5">
        <a v-if="store.isGuest" class="ui-font text-[var(--c-faint)] hover:text-[var(--c-ink)] underline" href="/edit" title="切回编辑模式">只读预览 · 切到编辑</a>
        <PhSpinnerGap v-if="saving" :size="12" class="spin" />
        <span :class="saveStateClass">{{ saveStateText }}</span>
      </span>
    </div>


    <!--
      回到顶部：目录开着时它就在目录底部的进度条旁边，那里本来就是导航区，
      不压正文；目录收起时没有那块地方，才退回到右下角贴边。
    -->
    <transition name="pop">
      <button
        v-if="showTop && !reader.tocOpen"
        class="to-top absolute bottom-11 right-6 w-7 h-7 rounded-full bg-[var(--c-pop)] shadow-md ring-1 ring-[var(--c-line)] flex items-center justify-center text-[var(--c-faint)] hover:text-[var(--c-ink)] transition-colors"
        title="回到顶部 T"
        @click="scrollTop"
      >
        <PhArrowUp :size="13" />
      </button>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
// 弹层里那些小图标：宽度 / 加粗斜体 / 段落 / 表格 / 主题 / 缩放 / 导出 / pdf 翻译
import {
  PhMagnifyingGlass, PhTextAa, PhTextT, PhArrowsOutLineHorizontal,
  PhExport, PhListDashes, PhX, PhArrowUp, PhSpinnerGap, PhWarningCircle,
  PhCircleHalf, PhPrinter,
  PhArrowsInLineHorizontal, PhArrowsHorizontal, PhArrowsVertical, PhTextB, PhTextItalic,
  PhParagraph, PhTextIndent, PhTable, PhTextAlignLeft, PhTextAlignCenter, PhTextAlignRight,
  PhArrowsOutSimple, PhArrowsInSimple, PhSun, PhCoffee, PhMoon,
  PhFileText, PhTranslate, PhShareNetwork
} from '@phosphor-icons/vue'
import { highlight } from '../utils/markdown'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import { useReaderStore, WIDTH_OPTIONS, PACE_OPTIONS } from '../stores/reader'
import { useDocsStore } from '../stores/docs'
import DocTabs from '../components/DocTabs.vue'
import DocPicker from '../components/DocPicker.vue'
import { insertDocLink } from '../utils/editor-shortcuts'
import { useDocScroll } from '../composables/useDocScroll'
import { useExport } from '../composables/useExport'
import { API_BASE } from '../utils/api'

const reader = useReaderStore()
// pdf 翻译任务的状态住在 docs store 里，不必再经 App 转一手
const store = useDocsStore()
/** 斜杠菜单里「插入文档」打开的选择器 */
const pickDoc = ref(false)
const { exportMarkdown, exportPdf } = useExport(() => props.meta, () => props.raw)

/*
 * 只接文档本身的东西。
 * 字体、字号、主题、表格这些阅读设置一律读 reader store —— 以前它们从这里往下发 props，
 * 结果 size 漏发了，四档字号全渲染成默认值，还不报错。
 */
const props = defineProps({
  docId: { type: String, default: '' },
  meta: { type: Object, required: true },
  raw: { type: String, default: '' },
  loaded: { type: Boolean, default: false },
  toc: { type: Array, default: () => [] },
  scrollTopSignal: { type: Number, default: 0 },
  keyword: { type: String, default: '' },
  results: { type: Array, default: () => [] },
  dirty: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  savedAt: { type: Number, default: 0 },
  /** 右栏点 pdf 目录时给过来的页码 */
  pdfPage: { type: Number, default: 1 },
  /** 这篇 pdf 共几页（底栏显示） */
  pdfPages: { type: Number, default: 0 },
  /** 重新挂载编辑器的信号（重排正文之后用） */
  epoch: { type: Number, default: 0 },
  error: { type: String, default: '' }
})
const emit = defineEmits(['update:keyword', 'jump', 'input', 'reload', 'select', 'canonize', 'close-tab'])

/** 当前这篇是不是 pdf：是就不挂编辑器，改挂浏览器自带的 pdf 阅读器 */
const isPdf = computed(() => props.meta?.type === 'pdf')
/** 标签条要显示的东西：文件名（跟侧栏、磁盘一致）、有没有没落盘的改动 */
/** 别人那条链接（带 token） */
const guestLink = computed(() => store.guestLink())
const copied = ref(false)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(guestLink.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  } catch {
    /* 剪贴板不给用就自己选中复制 */
  }
}

const tabItems = computed(() =>
  store.tabs.map((file) => ({
    file,
    name: store.allFiles.find((f) => f.file === file)?.name || file.split('/').pop().replace(/\.(md|pdf)$/i, ''),
    dirty: file === props.docId && props.dirty
  }))
)

/*
 * 关标签交给 App 做，这里只上报"要关哪个"。
 *
 * 早先是这里先 store.closeTab 再 emit select —— 顺序反了：标签先消失，随后切文档时
 * 如果保存失败或被用户取消（ensureSafe 会拦），就会出现"标签没了、文档还在看"的错位。
 * 现在由 App 先确认能安全离开，再删标签、再切。
 */
function onPickDoc(doc) {
  pickDoc.value = false
  insertDocLink(doc.name, doc.file, props.meta?.file || props.docId)
}

function onCloseTab(file) {
  emit('close-tab', file)
}

/** 看原文还是看译文：译文是双语的、页号跟原文一致，所以目录跳页照样能用 */
const pdfSrc = computed(() => {
  const rel = store.pdfView === 'translated' && store.pdfTranslate.output
    ? store.pdfTranslate.output
    : (props.meta?.file || '')
  return API_BASE + '/api/file?path=' + encodeURIComponent(rel)
})

/** 翻译按钮的提示语与动作 */
const translateTip = computed(() => {
  const t = store.pdfTranslate
  if (t.status === 'running') {
    const pages = store.pdfPages ? '共 ' + store.pdfPages + ' 页，' : ''
    return '正在翻译 ' + t.progress + '%（' + pages + '大约每页 10 秒，可以继续看别的）'
  }
  if (t.status === 'done') return store.pdfView === 'translated' ? '看原文' : '看译文'
  return '翻译这篇 pdf（后台跑，几分钟）'
})

function onTranslate() {
  const t = store.pdfTranslate
  if (t.status === 'done') {
    store.pdfView = store.pdfView === 'translated' ? 'source' : 'translated'
    return
  }
  if (t.status === 'running') return
  store.startTranslate()
}
const frameRef = ref(null)

/**
 * 右栏点了目录：让 iframe 跳到那一页。
 * 同源 iframe 直接改 hash，Chrome 自带的阅读器会跳页，不用把整份 pdf 重新下一遍。
 */
watch(
  () => props.pdfPage,
  (n) => {
    const f = frameRef.value
    if (!f || !n) return
    // 译文是「原文一页、译文一页」交替的（36 页 = 18 页原文 + 18 页译文），
    // 所以看译文时目录里的第 n 页要跳到第 2n-1 页，落在原文那面上。
    const page = store.pdfView === 'translated' ? n * 2 - 1 : n
    try {
      if (f.contentWindow) f.contentWindow.location.hash = '#page=' + page
      else f.src = pdfSrc.value + '#page=' + page
    } catch {
      f.src = pdfSrc.value + '#page=' + page
    }
  }
)

/* 宽度三档定义在 reader store 里，那边算阅读宽度时也要用同一份 */
const WIDTHS = WIDTH_OPTIONS.map((w, i) => ({
  ...w,
  icon: [PhArrowsInLineHorizontal, PhArrowsOutLineHorizontal, PhArrowsHorizontal][i]
}))

const SIZES = [
  { value: 14, label: '小' },
  { value: 15.5, label: '中' },
  { value: 17, label: '大' },
  { value: 18.5, label: '特大' }
]

const FONTS = [
  {
    id: 'serif',
    label: '衬线',
    stack: '"TeX Gyre Pagella", "Noto Serif SC", "Songti SC", serif'
  },
  {
    id: 'sans',
    label: '无衬线',
    stack: '"Noto Sans SC", "Heiti SC", -apple-system, sans-serif'
  },
  { id: 'kai', label: '楷体', stack: '"ChillKai", "Kaiti SC", STKaiti, serif' },
  { id: 'ping', label: '苹方', stack: '"PingFang SC", "Hiragino Sans GB", sans-serif' }
]

/* 中文加粗面：中文排版传统里强调靠换更重的字面，不是加大字号 */
const STRONG_FACES = [
  { id: 'black', label: '特黑', weight: 900 },
  { id: 'bold', label: '加粗', weight: 600 }
]

/* 中文斜体面：中文的斜体不做倾斜变形，换楷体是传统做法 */
const ITALIC_FACES = [
  { id: 'kai', label: '楷体', style: { fontFamily: '"ChillKai", serif' } },
  { id: 'none', label: '不替换', style: {} }
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

/* 表格宽度：默认用满可用宽度，宽表才不会被压得每列都很窄 */
const TABLE_WIDTHS = [
  { id: 'full', label: '铺满', icon: PhArrowsOutSimple },
  { id: 'measure', label: '同正文', icon: PhArrowsInSimple }
]

const TABLE_ALIGNS = [
  { id: 'left', label: '左', icon: PhTextAlignLeft },
  { id: 'center', label: '中', icon: PhTextAlignCenter },
  { id: 'right', label: '右', icon: PhTextAlignRight }
]

const PARA_STYLES = [
  { id: 'space', label: '段距式', icon: PhParagraph },
  { id: 'indent', label: '缩进式', icon: PhTextIndent }
]

const scroller = ref(null)
const searchInput = ref(null)
const open = ref('')
const searchOpen = ref(false)


/* ---------- 保存状态 ---------- */

/**
 * 字数。
 *
 * 以前直接数 raw.length，把 #、*、|、表格分隔行这些 markdown 记号也算成字，
 * 表格多的文档能虚报两成。现在先剥掉记号：汉字按字算、西文按词算。
 */
function isCJK(ch) {
  const c = ch.codePointAt(0)
  return (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3040 && c <= 0x30ff)
}

const stats = computed(() => {
  const text = String(props.raw || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1 ')
    .replace(/^[>\s]*[-*+]\s+/gm, ' ')
    .replace(/^\|[\s\-:|]+\|$/gm, ' ')
    .replace(/[#*_~|`]/g, ' ')
  let cjk = 0
  for (const ch of text) if (isCJK(ch)) cjk++
  const words = (text.match(/[A-Za-z0-9][A-Za-z0-9'._-]*/g) || []).length
  return {
    total: cjk + words,
    lines: String(props.raw || '').split('\n').length,
    tip: '汉字 ' + cjk + ' · 西文词 ' + words
  }
})

const saveStateText = computed(() => {
  if (props.error) return '保存失败'
  if (props.saving) return '保存中'
  if (props.dirty) return '待保存'
  if (props.savedAt) {
    const d = new Date(props.savedAt)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return '已保存 ' + hh + ':' + mm
  }
  return ''
})
const saveStateClass = computed(() =>
  props.error ? 'text-[#d9534f]' : props.dirty ? 'text-[#c9a227]' : 'text-[var(--c-faint)]'
)

/* ---------- 工具条 ---------- */

function toggle(name) {
  open.value = open.value === name ? '' : name
}
function pickWidth(v) {
  reader.measure = v
  open.value = ''
}
function pickSize(v) {
  reader.size = v
  open.value = ''
}
function pickExport(kind) {
  open.value = ''
  if (kind === 'md') exportMarkdown()
  else exportPdf()
}
function closeSearch() {
  searchOpen.value = false
  searchInput.value?.blur()
}
function clearSearch() {
  emit('update:keyword', '')
  searchInput.value?.focus()
}
function onResultClick(r) {
  searchOpen.value = false
  emit('jump', { id: r.id, keyword: props.keyword })
}

/* ---------- 滚动 ---------- */
/*
 * 回顶按钮的显隐、T 键、切文档记住读到哪，都在 useDocScroll 里。
 * 这里只把「还原位置要等 DOM 落定」这个界面侧的事接过来。
 */
const { showTop, scrollTop } = useDocScroll({
  scroller,
  docId: computed(() => props.docId),
  scrollTopSignal: computed(() => props.scrollTopSignal),
  onRestore: (pos) => {
    nextTick(() => {
      // 正文是异步进来的，等一帧再落，否则滚了个空容器
      setTimeout(() => {
        if (!scroller.value) return
        scroller.value.scrollTop = pos
        showTop.value = scroller.value.scrollTop > 420
      }, 120)
    })
  }
})

/* 点空白处收起弹层与搜索下拉 */
function onDocClick(e) {
  if (open.value && !e.target.closest('.pop-menu, .btn-icon')) open.value = ''
  if (searchOpen.value && !e.target.closest('input, .search-drop')) searchOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<style scoped>
/*
 * 弹层。
 *
 * 内边距写在这里，不要靠模板上的 p-3：scoped 样式会编译成 .pop-menu[data-v-xxx]，
 * 特异性比 Tailwind 的单类高一档，模板上写多少都会被这里的 4px 盖掉。
 * is-panel 是标题加一排选项芯片的那种，要松一些；列表型菜单贴边就够。
 */
.pop-menu {
  position: absolute;
  right: 0;
  top: 34px;
  z-index: 40;
  padding: 6px;
  background: var(--c-pop);
  border-radius: 10px;
  box-shadow: var(--c-pop-shadow);
}
.pop-menu.is-panel {
  padding: 15px 16px 16px;
}
.pop-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 7px 11px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--c-text);
  transition: background 0.12s, color 0.12s, transform 0.12s;
}
.pop-hint {
  font-size: 11px;
  color: var(--c-faint);
  font-variant-numeric: tabular-nums;
  transition: color 0.12s;
}
.pop-item.is-on .pop-hint {
  color: var(--color-ds);
  opacity: 0.6;
}
.pop-item:hover {
  background: var(--c-hover);
  color: var(--c-ink);
}
.pop-item:active {
  transform: scale(0.98);
}
.pop-item.is-on {
  color: var(--color-ds);
}
/* 排版面板 */
.type-label {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--c-faint);
  letter-spacing: 0.04em;
  margin: 10px 0 5px;
}
.type-label:first-child { margin-top: 0; }
.type-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
/* 分享菜单：链接一行 + 说明 + 分隔线 */
.share-link-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.share-link-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 9px;
  border-radius: 7px;
  background: var(--c-field);
  font-size: 11px;
  color: var(--c-sub);
  outline: none;
}
.share-copy {
  height: 28px;
  padding: 0 10px;
  border-radius: 7px;
  background: var(--color-ds);
  color: #fff;
  font-size: 11.5px;
  flex-shrink: 0;
}
.share-sep {
  height: 1px;
  background: var(--c-line-soft);
  margin: 8px 0 4px;
}

.type-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--c-text);
  background: var(--c-chip);
  transition: background 0.14s ease, color 0.14s ease, transform 0.1s ease;
}
.type-chip:hover { background: var(--c-chip-hover); color: var(--c-ink); }
.type-chip:active { transform: scale(0.96); }
.type-chip.is-on {
  color: var(--color-ds);
  background: var(--c-active);
}
/* 弹层里的小图标：默认淡色，选中或悬停时跟着文字变 */
.chip-icon {
  flex-shrink: 0;
  color: var(--c-faint);
}
.type-chip:hover .chip-icon {
  color: var(--c-ink);
}
.type-chip.is-on .chip-icon {
  color: var(--color-ds);
}
.menu-icon {
  flex-shrink: 0;
  color: var(--c-faint);
}
/* 图标和文字必须并排：光写 <span> 不行，图标是块级的，会掉到下一行 */
.pop-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pop-item:hover .menu-icon {
  color: var(--c-ink);
}
.label-icon {
  opacity: 0.75;
}
.label-main {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.type-range {
  width: 100%;
  height: 4px;
  margin-top: 2px;
  appearance: none;
  border-radius: 2px;
  background: var(--c-chip);
  outline: none;
}
.type-range::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-ds);
  cursor: pointer;
  transition: transform 0.12s ease;
}
.type-range::-webkit-slider-thumb:hover { transform: scale(1.15); }

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
