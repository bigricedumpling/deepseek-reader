<template>
  <div class="document-shell h-screen flex flex-col overflow-hidden">
    <!-- 顶部工具条：左侧是打开的文档，右侧是各功能入口 -->
    <div class="reader-topbar h-[52px] px-8 flex items-center justify-end gap-1.5 flex-shrink-0">
      <!-- 多篇打开时显示标签；只看一篇时省去没有关闭按钮的孤立标签。 -->
      <div class="topbar-left mr-auto flex min-w-0 items-center gap-2">
        <DocTabs v-if="tabItems.length" :items="tabItems" :active="docId" @select="emit('select',$event)" @close="onCloseTab" @close-many="emit('close-tabs',$event)" />
      </div>
      <span v-if="store.restoredCopy" class="guest-access-note" title="独立恢复副本，修改不会影响原抽屉"><PhClockCounterClockwise :size="12" />恢复副本</span>
      <span v-if="store.isGuest && docId" class="guest-access-note" :title="isPreview ? '此文件提供预览' : store.currentReadonly ? '这篇文档仅供阅读' : '这篇文档允许访客编辑'"><component :is="isPreview?PhEye:store.currentReadonly?PhLock:PhPencilSimple" :size="12" />{{ isPreview ? '预览' : store.currentReadonly ? '只读' : '可编辑' }}</span>

      <span v-if="transientSaveText" class="doc-save-state ui-font" :class="saveStateClass">
        <PhSpinnerGap v-if="saving" :size="12" class="spin" />
        {{ transientSaveText }}
      </span>

      <div v-if="docId" class="relative">
        <button ref="moreButton" class="btn-icon" title="更多" aria-label="更多" :aria-expanded="!!open" :class="{ 'is-active': !!open }" @click="toggle('more')"><PhDotsThree :size="18" weight="bold" /></button>
        <transition name="pop">
          <div v-if="open === 'more'" class="pop-menu is-panel document-actions more-menu">
            <button v-if="!isPreview" class="pop-item" @click.stop="openSearch"><PhMagnifyingGlass :size="15" /><span>查找当前文档</span><kbd class="menu-shortcut">⌘F</kbd></button>
            <button v-if="!isPreview" class="pop-item" @click="open = 'reading'"><PhTextT :size="15" /><span>阅读设置</span><PhCaretRight :size="13" class="menu-tail" /></button>
            <div class="doc-options-divider" />
            <button v-if="!store.isGuest" ref="visibilityEntry" class="pop-item" @click="showVisibility"><component :is="meta.shared === false ? PhEyeSlash : PhEye" :size="15" /><span>{{ meta.shared === false ? '仅自己可见' : '已纳入分享范围' }}</span><PhCaretRight :size="13" class="menu-tail" /></button>
            <button v-if="canRevealInFinder" class="pop-item" @click="showInFinder"><PhFolderSimple :size="15" /> {{ fileManagerLabel() }}</button>
            <button v-if="!store.isGuest" class="pop-item" @click="open = ''; infoOpen = true"><PhInfo :size="15" /> 文档信息</button>
            <button v-if="!store.isGuest && !isPreview" class="pop-item" @click="open = ''; historyOpen = true"><PhClockCounterClockwise :size="15" /> 历史版本</button>
            <button v-if="isPdf && !store.isGuest && (store.pdfTranslationAvailable || store.pdfTranslate.status === 'done')" class="pop-item" :disabled="store.pdfTranslate.status === 'running'" @click="onTranslate(); open = ''">
              <PhTranslate :size="15" />
              <span>{{ store.pdfTranslate.status === 'running' ? '翻译中' : store.pdfTranslate.status === 'done' ? (store.pdfView === 'translated' ? '回到原文' : '查看译文') : '翻译 PDF' }}</span>
              <span v-if="store.pdfTranslate.status === 'running'" class="menu-tail tabular-nums">{{ store.pdfTranslate.progress }}%</span>
            </button>
            <div class="doc-options-divider" />
            <button class="pop-item" @click="open = 'export'"><PhExport :size="15" /><span>导出</span><PhCaretRight :size="13" class="menu-tail" /></button>
            <a v-if="embedded" class="pop-item" :href="browserUrl" target="_blank" rel="noopener noreferrer" @click="open = ''"><PhArrowSquareOut :size="15" /> 在浏览器打开</a>
            <div class="doc-options-divider" />
            <div class="more-stats ui-font">
              <template v-if="isH5"><span>H5</span><span v-if="meta.size">· {{ (meta.size / 1024).toFixed(0) }} KB</span></template>
              <template v-else-if="isPdf"><span>{{ pdfPages ? pdfPages + ' 页' : 'PDF' }}</span><span v-if="meta.size">· {{ (meta.size / 1024 / 1024).toFixed(1) }} MB</span><span v-if="store.pdfTranslate.status === 'running'">· 翻译中 {{ store.pdfTranslate.progress }}%</span></template>
              <template v-else><span>{{ stats.total }} 字</span><span>·</span><span>{{ stats.lines }} 行</span></template>
            </div>
            <p v-if="saveStateText && !error" class="more-save ui-font">{{ saveStateText }}</p>
            <button v-if="!isPdf" class="pop-item" :disabled="!showTop" @click="goTop"><PhArrowUp :size="15" /><span>回到顶部</span><kbd class="menu-shortcut">T</kbd></button>
          </div>
          <div v-else-if="open === 'reading'" class="pop-menu is-panel reading-panel">
            <ReadingSettings @close="open = 'more'" />
          </div>
          <div v-else-if="open === 'export'" class="pop-menu is-panel document-actions export-menu">
            <button class="pop-item" @click="open = 'more'"><PhCaretLeft :size="15" />导出</button>
            <div class="doc-options-divider" />
            <button v-if="!isPreview" class="pop-item" @click="pickExport('md')"><PhFileText :size="15" /> Markdown 文件</button>
            <button v-if="!isPreview" class="pop-item" @click="pickExport('html')"><PhFileText :size="15" /> 网页（含图片）</button>
            <button v-if="!isPreview" class="pop-item" @click="pickExport('pdf')"><PhPrinter :size="15" /> 打印 / 导出 PDF</button>
            <a v-else class="pop-item" :href="pdfSrc.split('#')[0]" target="_blank" rel="noopener" @click="open = ''"><PhArrowSquareOut :size="15" />打开原文件</a>
          </div>
          <div v-else-if="open === 'visibility'" class="pop-menu is-panel document-actions">
            <button ref="visibilityBack" class="pop-item" @click="backToActions"><PhCaretLeft :size="15" />分享范围</button>
            <div class="doc-options-divider" />
            <button class="doc-state" role="switch" :aria-checked="meta.shared !== false" aria-label="纳入分享范围" @click="changeAccess('shared')"><PhEye :size="15" /><span>纳入分享范围</span><span class="state-switch" :class="{ on: meta.shared !== false }" /></button>
            <p class="settings-scope">{{ meta.shared === false ? '仅自己可见。' : '此设置不生成或更新分享链接。' }}</p>
            <template v-if="meta.shared !== false">
              <button v-if="!isPreview" class="doc-state" role="switch" :aria-checked="!!meta.locked" :disabled="!!meta.lockedAt && meta.lockedAt !== docId" aria-label="访客只读" @click="changeAccess('locked')"><PhLock :size="15" /><span>访客只读</span><span class="state-switch" :class="{ on: meta.locked }" /></button>
              <p class="settings-scope">{{ meta.lockedAt && meta.lockedAt !== docId ? '由上级设为只读。' : '访客视角权限；分享副本始终只读。' }}</p>
            </template>
          </div>
        </transition>
      </div>

      <Teleport to="body">
        <transition name="pop">
          <div v-if="searchOpen" class="doc-search-wrap doc-search-floating" @mousedown.stop>
            <div class="doc-search-panel ui-font" role="search" aria-label="查找当前文档">
              <div class="doc-search-field"><PhMagnifyingGlass :size="14" /><input ref="searchInput" :value="keyword" placeholder="查找当前文档" @input="emit('update:keyword', $event.target.value)" @keydown.enter.prevent="results[0]?.hits[0] && onResultClick(results[0], results[0].hits[0])" @keydown.esc="closeSearch" /><button title="关闭查找" aria-label="关闭查找" @click="closeSearch"><PhX :size="16" /></button></div>
              <div v-if="keyword.trim()" class="doc-search-results">
                <p v-if="!results.length" class="search-scope">没有匹配</p>
                <template v-for="r in results" :key="r.id"><button v-for="(h,i) in r.hits.slice(0,20)" :key="i" class="search-hit" @click="onResultClick(r, h)"><span v-html="highlight(h.text, keyword)" /><small>第 {{ h.line }} 行{{ h.occurrence > 1 ? `，本行第 ${h.occurrence} 处` : '' }}</small></button></template>
              </div>
            </div>
          </div>
        </transition>
      </Teleport>
    </div>

    <!-- 斜杠菜单里插入文档用的选择器 -->
    <DocPicker v-if="pickDoc" @close="pickDoc = false" @pick="onPickDoc" />

    <ConflictDialog />
    <!-- 出错提示 -->
    <div
      v-if="error && !store.conflict"
      class="mx-6 mb-1 px-3.5 py-2.5 ui-round-control bg-[var(--c-field)] ring-1 ring-[var(--c-line)] flex items-start gap-2.5 shrink-0"
    >
      <PhWarningCircle :size="15" class="text-[#d9534f] mt-[1px] shrink-0" />
      <span class="ui-font flex-1 text-[12.5px] leading-relaxed text-[#c0392b]">{{ error }}</span>
      <button
        v-if="store.errorKind === 'save'"
        class="ui-font text-[12px] text-[#c0392b] underline shrink-0"
        @click="store.save()"
      >重试保存</button>
      <button
        v-else-if="store.errorKind === 'load'"
        class="ui-font text-[12px] text-[#c0392b] underline shrink-0"
        @click="emit('reload')"
      >重新读取</button>
      <button
        class="ui-font text-[12px] text-[#c0392b] underline shrink-0"
        :aria-label="store.errorKind === 'save' ? '关闭错误提示' : '知道了'"
        @click="store.clearError()"
      >{{ store.errorKind === 'save' || store.errorKind === 'load' ? '关闭' : '知道了' }}</button>
    </div>

    <!-- 正文：永远可编辑，没有阅读态和编辑态之分 -->
    <div
      id="main-scroll-container"
      ref="scroller"
      class="flex-1 min-h-0 overflow-y-auto no-scrollbar print-area"
      :style="pageStyle"
    >
      <!--
        PDF：交给浏览器自带的阅读器，支持翻页和跳页（服务端带 Range）。
        H5：整页渲染，保留它自己的布局，不套阅读器的行宽限制。
        两者都是成品文件，不经过 markdown 解析。
      -->
      <PdfPreview v-if="isPdf" :url="pdfSrc" :page="effectivePdfPage" @page="onPdfPageChange" @loaded="store.pdfPages=$event" @outline="store.pdfToc=$event.toc;store.pdfTocSource=$event.source" />
      <iframe
        v-if="isH5"
        ref="frameRef"
        :sandbox="isH5 ? 'allow-scripts' : undefined"
        class="pdf-frame"
        :src="pdfSrc"
        :title="meta.name || (isPdf ? 'PDF' : 'H5')"
      />
      <PageHeader v-if="loaded && !isPreview" />
      <MarkdownEditor
        v-if="loaded && !isPreview"
        :key="String(store.currentReadonly) + docId + ':' + epoch + ':' + store.contentEpoch + ':' + restoredEpoch"
        :readonly="store.currentReadonly"
        @pick-doc="pickDoc = true"
        @open-doc="emit('select', $event)"
        :value="raw"
        :doc-id="docId"
        :doc-file="meta.file || ''"
        :style="pageStyle"
        @update:value="emit('input', $event)"
        @canonize="emit('canonize', $event)"
        @restore="restoreContent"
        @rebuild="restoredEpoch++"
      />
      <div v-else-if="!isPreview && !docId && !store.loading" class="ui-font text-center pt-24 text-[var(--c-sub)]">
        <p class="text-[14px]">这个抽屉还没有文档</p>
        <button v-if="!store.isGuest" class="mt-4 text-[12px] text-ds hover:underline" @click="emit('create-doc')">新建第一篇文档</button>
      </div>
      <p v-else-if="!isPreview && error" class="ui-font text-[13px] text-[var(--c-faint)] text-center pt-24">读取失败，请点击上方重新读取</p>
      <p v-else-if="!isPreview" class="ui-font text-[13px] text-[var(--c-faint)] text-center pt-24">正在读取…</p>
    </div>


  </div>
  <DocumentInfo :open="infoOpen" :path="docId" @close="infoOpen=false" />
  <VersionHistory :open="historyOpen" :path="docId" :current-content="raw" :preserve-current="() => store.save()" @close="closeHistory" @restore="restoreContent"
        @rebuild="restoredEpoch++" />
</template>

<script setup>
import {layoutText} from '../utils/column-format'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
// 弹层里那些小图标：宽度 / 加粗斜体 / 段落 / 表格 / 主题 / 缩放 / 导出 / pdf 翻译
import {
  PhMagnifyingGlass, PhTextAa, PhTextT, PhArrowsOutLineHorizontal,
  PhExport, PhArrowSquareOut, PhX, PhArrowUp, PhSpinnerGap, PhWarningCircle,
  PhCaretLeft, PhCaretRight, PhCircleHalf, PhPrinter, PhInfo, PhClockCounterClockwise,
  PhArrowsInLineHorizontal, PhArrowsHorizontal, PhArrowsVertical, PhTextB, PhTextItalic,
  PhParagraph, PhTextIndent, PhTable, PhTextAlignLeft, PhTextAlignCenter, PhTextAlignRight,
  PhArrowsOutSimple, PhArrowsInSimple, PhSun, PhCoffee, PhMoon,
  PhFileText, PhTranslate, PhPencilSimple, PhLock, PhEye, PhEyeSlash, PhDotsThree, PhFolderSimple
} from '@phosphor-icons/vue'
import { highlight } from '../utils/markdown'
import PdfPreview from '../components/PdfPreview.vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import { useReaderStore } from '../stores/reader'
import { useDocsStore } from '../stores/docs'
import DocTabs from '../components/DocTabs.vue'
import ReadingSettings from '../components/ReadingSettings.vue'
import ConflictDialog from '../components/ConflictDialog.vue'
import VersionHistory from '../components/VersionHistory.vue'
import DocumentInfo from '../components/DocumentInfo.vue'
import PageHeader from '../components/PageHeader.vue'
import DocPicker from '../components/DocPicker.vue'
import { insertDocLink } from '../utils/editor-shortcuts'
import { useDocScroll } from '../composables/useDocScroll'
import { useExport } from '../composables/useExport'
import { API_BASE } from '../utils/api'
import { fileManagerAvailable, fileManagerLabel, revealInFileManager } from '../utils/reveal'

const reader = useReaderStore()
// pdf 翻译任务的状态住在 docs store 里，不必再经 App 转一手
const infoOpen=ref(false)
const historyOpen=ref(false),moreButton=ref(null),visibilityEntry=ref(null),visibilityBack=ref(null)
async function showVisibility(){open.value='visibility';await nextTick();visibilityBack.value?.focus()}
async function backToActions(){open.value='more';await nextTick();visibilityEntry.value?.focus()}
async function closeHistory(){historyOpen.value=false;await nextTick();moreButton.value?.focus()}
const restoredEpoch=ref(0)
function restoreContent(text){emit('input',text);restoredEpoch.value++}
const store = useDocsStore()
const canRevealInFinder = computed(() => !store.isGuest && fileManagerAvailable() && !!props.docId)
async function showInFinder() {
  open.value = ''
  try { await revealInFileManager(props.docId) }
  catch (error) { store.setError(error.message || error) }
}
const pageStyle=computed(()=>({...reader.readingStyle,...({narrow:{'--measure':'min(720px, 100%)'},wide:{'--measure':'min(1120px, 100%)'},full:{'--measure':'100%'}}[store.pageMeta.layout]||{})}))
/** 斜杠菜单里插入文档打开的选择器 */
const pickDoc = ref(false)
const { exportMarkdown, exportPdf, exportHtml } = useExport(() => props.meta, () => props.raw)

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
const embedded = window.self !== window.top
const browserUrl = computed(() => {
  const path = String(props.docId || '').replace(/\.(md|pdf|html?)$/i, '')
  const url = new URL(API_BASE + '/' + (window.__readerPublicView ? 'onlyread' : 'doc') + (path ? '/' + path.split('/').map(encodeURIComponent).join('/') : '/'), location.origin)
  const lib = path.split('/')[0] || new URLSearchParams(location.search).get('lib')
  if (lib) url.searchParams.set('lib', lib)
  return url.toString()
})
const emit = defineEmits(['update:keyword', 'jump', 'input', 'reload', 'select', 'canonize', 'close-tab', 'close-tabs', 'create-doc'])

/** 当前这篇是不是 pdf：是就不挂编辑器，改挂浏览器自带的 pdf 阅读器 */
/* 成品文件：pdf 与 h5。两者都交给浏览器整页渲染，工具栏与页脚信息按类型分开。 */
const isPdf = computed(() => props.meta?.type === 'pdf')
const isH5 = computed(() => props.meta?.type === 'h5')
const isPreview = computed(() => isPdf.value || isH5.value)
/** 标签条要显示的东西：文件名（跟侧栏、磁盘一致）、有没有没落盘的改动 */
const tabItems = computed(() =>
  store.tabs.map((file) => ({
    file,
    name: store.allFiles.find((f) => f.file === file)?.name || file.split('/').pop().replace(/\.(md|pdf|html?)$/i, ''),
    icon: store.allFiles.find(f=>f.file===file)?.meta?.icon || '',
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
  const rel = isPdf.value && store.pdfView === 'translated' && store.pdfTranslate.output
    ? store.pdfTranslate.output
    : (props.meta?.file || '')
  return API_BASE + '/api/file?path=' + encodeURIComponent(rel)
})

// H5 保持独立沙箱，不授予 same-origin。由阅读器代办明确的本库文档跳转，
// 避免沙箱内导航丢失 SameSite 管理会话；不把文件内容或凭据回传给 H5。
function onPreviewAction(event) {
  if (!isH5.value || event.source !== frameRef.value?.contentWindow) return
  const data = event.data
  if (!data || data.type !== 'reader-preview-open' || typeof data.path !== 'string') return
  const rel = data.path
  const lib = String(props.meta?.file || '').split('/')[0]
  if (!lib || !rel.startsWith(lib + '/') || rel.includes('\\') || rel.includes('\0') || rel.split('/').some(part => !part || part.startsWith('.'))) return
  if (data.kind === 'document' && store.allFiles.some(file => file.file === rel)) {
    emit('select', rel)
  }
}
onMounted(() => window.addEventListener('message', onPreviewAction))
onBeforeUnmount(() => window.removeEventListener('message', onPreviewAction))

/** 翻译按钮的提示语与动作 */
const translateTip = computed(() => {
  const t = store.pdfTranslate
  if (t.status === 'running') return '正在翻译 ' + t.progress + '%'
  if (t.status === 'done') return store.pdfView === 'translated' ? '看原文' : '看译文'
  return '翻译 PDF'
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

// 译文是原文一页、译文一页交替的（36 页 = 18 页原文 + 18 页译文），
// 所以看译文时目录里的第 n 页要跳到第 2n-1 页，翻页后反算回逻辑页码。
const effectivePdfPage = computed(() => {
  const n = props.pdfPage || 1
  return store.pdfView === 'translated' ? n * 2 - 1 : n
})
function onPdfPageChange(page) {
  store.pdfPage = store.pdfView === 'translated' ? Math.ceil(page / 2) : page
}

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
  const text = layoutText(props.raw)
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
    tip: '汉字 ' + cjk + '，西文词 ' + words
  }
})

const transientSaveText = computed(() => {
  if (props.error) return { save: '保存失败', load: '打开失败' }[store.errorKind] || '操作失败'
  if (props.saving) return '保存中'
  if (props.dirty) return '待保存'
  return ''
})
const saveStateText = computed(() => {
  if (transientSaveText.value) return transientSaveText.value
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

function changeAccess(key) {
  if (key === 'locked' && props.meta.lockedAt && props.meta.lockedAt !== props.docId) return
  const value = key === 'shared' ? props.meta.shared === false : !props.meta.locked
  store.requestAccess(props.docId, { [key]: value }, key === 'shared' ? (value ? '纳入分享范围' : '仅自己可见') : (value ? '设为访客只读' : '允许访客编辑'))
}
function openSearch() {
  open.value = ''
  searchOpen.value = true
  nextTick(() => searchInput.value?.focus())
}
function toggle(name) {
  open.value = open.value === name ? '' : name
}
function goTop() {
  open.value = ''
  scrollTop()
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
  else if(kind==='html')exportHtml().catch(e=>{store.setError(e.message)})
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
function onResultClick(r, hit) {
  searchOpen.value = false
  emit('jump', { id: r.id, keyword: props.keyword, hit })
}

/* ---------- 滚动 ---------- */
/*
 * 回顶按钮的显隐、T 键、切文档记住读到哪，都在 useDocScroll 里。
 * 它会在正文异步渲染期间逐帧重试，这里只负责把目标位置落到容器上。
 */
const { showTop, scrollTop } = useDocScroll({
  scroller,
  docId: computed(() => props.docId),
  scrollTopSignal: computed(() => props.scrollTopSignal),
  onRestore: (pos) => {
    if (scroller.value) scroller.value.scrollTop = pos
  }
})

/* 点空白处收起弹层与搜索下拉 */
function onDocClick(e) {
  if (open.value && !e.target.closest('.pop-menu, .btn-icon')) open.value = ''
  if (searchOpen.value && !e.target.closest('.doc-search-wrap')) closeSearch()
}
function onFindKey(e) { if(e.key==='Escape' && open.value){ e.preventDefault();if(open.value==='visibility')backToActions();else{open.value='';moreButton.value?.focus()}return } if (!isPreview.value && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); openSearch() } }
function onOverlayOpen() { open.value = ''; closeSearch() }
watch(() => props.docId, () => { open.value=''; closeSearch(); emit('update:keyword', '') })
onMounted(() => { document.addEventListener('click', onDocClick); document.addEventListener('keydown', onFindKey); window.addEventListener('reader-overlay-open', onOverlayOpen) })
onBeforeUnmount(() => { document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onFindKey); window.removeEventListener('reader-overlay-open', onOverlayOpen) })
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
  border: 1px solid var(--c-line);
  border-radius: var(--radius-surface);
  corner-shape: superellipse(2);
  box-shadow: var(--c-pop-shadow);
}
.pop-menu.is-panel {
  padding: 16px;
}
.type-panel { width: min(304px, calc(100vw - 24px)); max-height: calc(100dvh - 68px); overflow-y: auto; scrollbar-width: thin; }
.look-panel { width: 232px; max-height: calc(100dvh - 68px); overflow-y: auto; scrollbar-width: thin; }
.type-tabs { display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:3px;margin-bottom:10px;background:var(--c-field);border-radius:var(--radius-control); }
.type-tabs button { min-height:30px;border-radius:calc(var(--radius-control) - 3px);color:var(--c-sub);font-size:12px; }
.type-tabs button.is-on { background:var(--c-pop);color:var(--c-ink);box-shadow:0 1px 3px color-mix(in srgb,var(--c-ink) 8%,transparent); }
.pop-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 7px 11px;
  border-radius: var(--radius-control);
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
  color: var(--c-accent);
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
  color: var(--c-accent);
}
/* 排版面板 */
.type-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--c-sub);
  margin: 13px 0 7px;
}
.type-label:first-child { margin-top: 0; }
.type-row {
  display: grid;
  gap: 6px;
}
.type-row.columns-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.type-row.columns-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.type-row.columns-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.type-section-break {
  height: 1px;
  margin: 15px 0 2px;
  background: var(--c-line-soft);
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
  border-radius: var(--radius-control);
  background: var(--c-field);
  font-size: 11px;
  color: var(--c-sub);
  outline: none;
}
.share-copy {
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-control);
  background: var(--c-accent);
  color: var(--c-on-accent);
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
  justify-content: center;
  min-width: 0;
  min-height: 31px;
  gap: 5px;
  padding: 5px 7px;
  border-radius: var(--radius-control);
  font-size: 12px;
  line-height: 1.3;
  white-space: nowrap;
  color: var(--c-text);
  background: var(--c-chip);
  transition: background 0.14s ease, color 0.14s ease, transform 0.1s ease;
}
.type-chip:hover { background: var(--c-chip-hover); color: var(--c-ink); }
.type-chip:active { transform: scale(0.96); }
.type-chip.is-on {
  color: var(--c-accent);
  background: var(--c-active);
}
.font-choices .type-chip { justify-content: flex-start; padding-inline: 10px; }
.font-sample { flex: none; font-size: 15px; line-height: 1; }
/* 弹层里的小图标：默认淡色，选中或悬停时跟着文字变 */
.chip-icon {
  flex-shrink: 0;
  color: var(--c-faint);
}
.type-chip:hover .chip-icon {
  color: var(--c-ink);
}
.type-chip.is-on .chip-icon {
  color: var(--c-accent);
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
  margin: 9px 0 2px;
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
  background: var(--c-accent);
  cursor: pointer;
  transition: transform 0.12s ease;
}
.type-range::-webkit-slider-thumb:hover { transform: scale(1.15); }
@media (max-width: 640px) {
  .type-panel, .look-panel {
    position: fixed;
    inset: 58px 12px auto;
    width: auto;
    max-height: calc(100dvh - 70px);
  }
}

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
.document-actions{width:min(260px,calc(100vw - 24px))}.document-actions .pop-item svg{flex:none}.menu-tail{margin-left:auto}
.document-actions.more-menu{width:min(300px,calc(100vw - 24px))}
.reading-panel{width:min(344px,calc(100vw - 24px));max-height:calc(100dvh - 68px);overflow-y:auto;scrollbar-width:thin}
.doc-save-state{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;white-space:nowrap;padding:0 4px}
.more-stats{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:10px 11px 3px;font-size:11px;color:var(--c-faint)}
.more-save{margin:0;padding:1px 11px 8px;font-size:11px;color:var(--c-faint)}
.menu-shortcut{margin-left:auto;font:11px var(--font-sans);color:var(--c-faint)}
.doc-search-wrap.doc-search-floating{position:fixed;top:56px;right:16px;left:auto;z-index:140;width:min(360px,calc(100vw - 32px))}
.doc-search-floating .doc-search-panel{position:static;width:100%}
.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
</style>

<style scoped>
.doc-search-wrap { position:relative }
.doc-search-panel { position:absolute;right:0;top:38px;width:min(360px,var(--search-available));padding:12px;background:var(--c-pop);border:1px solid var(--c-line);border-radius:var(--radius-surface);box-shadow:var(--c-pop-shadow);z-index:80 }
.doc-search-field { display:flex;align-items:center;gap:8px }.doc-search-field input { min-width:0;flex:1;outline:none;background:transparent;font-size:13px;padding:7px 0 }
.search-scope { font-size:11px;line-height:1.6;color:var(--c-faint);padding:8px 5px }
.doc-search-results { max-height:50vh;overflow:auto }.search-hit { display:block;width:100%;text-align:left;font-size:12px;line-height:1.7;padding:8px;border-radius:var(--radius-control) }.search-hit:hover{background:var(--c-hover)}
.search-hit small { display:block; font-size:10px; color:var(--c-faint) }
.pop-item:disabled { opacity:.5;cursor:default }
@media(max-width:640px){ .reader-topbar{padding-left:8px!important;padding-right:8px!important;gap:2px!important}.single-doc-title{max-width:25vw} }
.document-actions{width:min(260px,calc(100vw - 24px))}.document-actions .pop-item svg{flex:none}.menu-tail{margin-left:auto}.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
</style>

<style scoped>
.doc-state-pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}.doc-state{display:flex;align-items:center;gap:6px;padding:10px 5px;font-size:11px;color:var(--c-sub);border-radius:var(--radius-control)}.doc-state:hover{background:var(--c-hover)}.doc-state:disabled{opacity:.65;cursor:default}.state-switch{width:22px;height:13px;border-radius:var(--radius-surface);background:var(--c-line);position:relative;margin-left:auto;flex-shrink:0}.state-switch:after{content:'';position:absolute;width:9px;height:9px;left:2px;top:2px;background:var(--c-pop);border-radius:50%;box-shadow:0 1px 2px #0002}.state-switch.on{background:var(--c-accent)}.state-switch.on:after{left:11px}.doc-options-divider{height:1px;background:var(--c-line);margin:6px 0}
.document-actions{width:min(260px,calc(100vw - 24px))}.document-actions .pop-item svg{flex:none}.menu-tail{margin-left:auto}.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
</style>

<style scoped>.status-to-top{display:grid;place-items:center;width:26px;height:24px;background:var(--c-field);border-radius:var(--radius-surface)}.status-to-top:hover{background:var(--c-chip-hover)}.status-to-top:disabled{opacity:.35;cursor:default}.guest-access-note{gap:4px;flex-shrink:0;display:inline-flex;align-items:center;min-height:24px;padding:2px 9px;border-radius:var(--radius-control);corner-shape:superellipse(2);background:var(--c-field);color:var(--c-sub);font:11px var(--font-sans)}@media(max-width:640px){.guest-access-note{padding-inline:6px}}.document-actions{width:min(260px,calc(100vw - 24px))}.document-actions .pop-item svg{flex:none}.menu-tail{margin-left:auto}.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
</style>

<style scoped>.open-in-browser{flex:none;margin-left:3px;color:var(--c-faint)}.open-in-browser:hover{background:var(--c-hover);color:var(--c-ink);text-decoration:none}.open-in-browser:focus-visible{outline:2px solid var(--c-accent);outline-offset:2px}.document-actions{width:min(260px,calc(100vw - 24px))}.document-actions .pop-item svg{flex:none}.menu-tail{margin-left:auto}.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
</style>

<style scoped>
.type-tabs{grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:18px}.type-groups{display:grid;gap:20px}.type-group{display:grid;gap:8px;min-width:0}.type-group .type-label{margin:0;min-height:16px}.type-group .type-range{margin:4px 0 0}.type-group :deep(.select-menu-trigger){width:100%;min-height:34px;padding:8px 12px;justify-content:space-between}.type-chip{min-height:32px}.reader-bottombar{border:0;background:var(--c-panel)}
</style>
