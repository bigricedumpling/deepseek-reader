<template>
  <div class="document-shell h-full flex flex-col overflow-hidden" :class="{ 'chrome-collapsed': chromeCollapsed }">
    <Teleport to="#app-topbar-main" :disabled="!chromeCollapsed">
    <div class="doc-topbar" :class="{ 'in-topbar': chromeCollapsed }" :style="docTopbarStyle">
      <!-- 多篇打开时显示标签；只看一篇时省去没有关闭按钮的孤立标签。 -->
      <div v-if="docId || tabItems.length || store.libSwitch.active || libraryEmpty" class="topbar-left mr-auto flex min-w-0 items-center gap-2" :class="{ 'is-lib-hidden': !tabsShown }">
        <DocTabs v-if="tabItems.length" :key="'tabs-' + store.libSwitchKey" :items="tabItems" :active="docId" :class="{ 'is-topbar-tabs': chromeCollapsed }" @select="emit('select',$event)" @close="onCloseTab" @close-many="emit('close-tabs',$event)" @reorder="emit('reorder',$event)" />
        <span v-if="tabItems.length && docId" class="tab-plus-sep" aria-hidden="true" />
        <button v-if="docId || tabItems.length || libraryEmpty" ref="quickButton" class="doc-quick" :class="{ 'is-on': quickOpen }" :disabled="store.libSwitch.phase === 'out' || store.libSwitch.phase === 'loading'" title="最近文档 / 新建文档" aria-label="最近文档 / 新建文档" :aria-expanded="quickOpen" @click.stop="toggleQuick"><PhPlus :size="15" /></button>
      </div>
      <span v-if="store.restoredCopy" class="guest-access-note" title="独立恢复副本，修改不会影响原知识库"><PhClockCounterClockwise :size="12" />恢复副本</span>
      <span v-if="store.isGuest && docId" class="guest-access-note" :title="isPreview ? '此文件提供预览' : store.currentReadonly ? '这篇文档仅供阅读' : '这篇文档允许访客编辑'"><component :is="isPreview?PhEye:store.currentReadonly?PhLock:PhPencilSimple" :size="12" />{{ isPreview ? '预览' : store.currentReadonly ? '只读' : '可编辑' }}</span>

      <span v-if="transientSaveText" class="doc-save-state ui-font" :class="saveStateClass">
        <PhSpinnerGap v-if="saving" :size="12" class="spin" />
        {{ transientSaveText }}
      </span>

      <button v-if="showTranslate" class="doc-translate ui-font" :class="{ 'is-running': store.pdfTranslate.status === 'running', 'is-done': store.pdfTranslate.status === 'done' }" :title="translateTip" :aria-label="translateTip" @click="onTranslate">
        <PhSpinnerGap v-if="store.pdfTranslate.status === 'running'" :size="14" class="spin" />
        <PhTranslate v-else :size="14" />
        <span class="doc-translate-label">{{ translateLabel }}</span>
        <span v-if="store.pdfTranslate.status === 'running'" class="doc-translate-meter" aria-hidden="true"><i :style="{ width: translatePercent + '%' }" /></span>
        <span v-if="store.pdfTranslate.status === 'running'" class="doc-translate-pct tabular-nums">{{ translatePercent }}%</span>
      </button>

      <div v-if="docId" class="doc-tools" :class="{ 'is-embedded': reader.tocOpen }">
      <!-- 阅读设置常用，单独放在三点左侧 -->
      <div v-if="!isPreview" class="doc-reading">
        <button ref="readingButton" class="btn-icon" title="阅读设置" aria-label="阅读设置" :aria-expanded="open === 'reading'" :class="{ 'is-active': open === 'reading' }" @click="toggle('reading')"><svg class="reading-aa" viewBox="0 0 256 256" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M87.24,52.59a8,8,0,0,0-14.48,0l-64,136a8,8,0,1,0,14.48,6.81L39.9,160h80.2l16.66,35.4a8,8,0,1,0,14.48-6.81ZM47.43,144,80,74.79,112.57,144ZM200,96c-12.76,0-22.73,3.47-29.63,10.32a8,8,0,0,0,11.26,11.36c3.8-3.77,10-5.68,18.37-5.68,13.23,0,24,9,24,20v3.22A42.76,42.76,0,0,0,200,128c-22.06,0-40,16.15-40,36s17.94,36,40,36a42.73,42.73,0,0,0,24-7.25,8,8,0,0,0,16-.75V132C240,112.15,222.06,96,200,96Zm0,88c-13.23,0-24-9-24-20s10.77-20,24-20,24,9,24,20S213.23,184,200,184Z"/></svg></button>
        <Teleport to="body">
          <transition name="pop">
            <div v-if="open === 'reading'" class="pop-menu is-panel reading-panel reading-pop" :style="readingPopStyle">
              <ReadingSettings @close="closeReading" />
            </div>
          </transition>
        </Teleport>
      </div>

      <!-- 文档操作：放在这条顶栏的最右端，跟随文档标签一起搬 -->
      <div class="doc-more">
        <button ref="moreButton" class="btn-icon" title="更多" aria-label="更多" :aria-expanded="open === 'more' || open === 'export'" :class="{ 'is-active': open === 'more' || open === 'export' }" @click="toggle('more')"><PhDotsThree :size="18" weight="bold" /></button>
        <Teleport to="body">
        <transition name="pop">
          <div v-if="open === 'more'" class="pop-menu is-panel document-actions more-menu actions-pop" :style="actionsPopStyle">
            <button v-if="!isH5" class="pop-item" @click.stop="openSearch"><PhMagnifyingGlass :size="15" /><span>查找当前文档</span><kbd class="menu-shortcut">⌘F</kbd></button>
            <div class="doc-options-divider" />
            <button v-if="canRevealInFinder" class="pop-item" @click="showInFinder"><PhFolderSimple :size="15" /> {{ fileManagerLabel() }}</button>
            <button v-if="!store.isGuest" class="pop-item" @click="open = ''; infoOpen = true"><PhInfo :size="15" /> 文档信息</button>
            <button v-if="!store.isGuest && !isPreview" class="pop-item" @click="open = ''; historyOpen = true"><PhClockCounterClockwise :size="15" /> 历史版本</button>
            <div class="doc-options-divider" />
            <button class="pop-item" @click="open = 'export'"><PhExport :size="15" /><span>导出</span><PhCaretRight :size="13" class="menu-tail" /></button>
            <a v-if="embedded" class="pop-item" :href="browserUrl" target="_blank" rel="noopener noreferrer" @click="open = ''"><PhArrowSquareOut :size="15" /> 在浏览器打开</a>
            <div class="doc-options-divider" />
            <div class="more-stats ui-font">
              <template v-if="isH5"><span>H5</span><span v-if="meta.size">· {{ (meta.size / 1024).toFixed(0) }} KB</span></template>
              <template v-else-if="isPdf"><span>{{ pdfPages ? pdfPages + ' 页' : 'PDF' }}</span><span v-if="meta.size">· {{ (meta.size / 1024 / 1024).toFixed(1) }} MB</span></template>
              <template v-else><span>{{ stats.total }} 字</span><span>·</span><span>{{ stats.lines }} 行</span></template>
            </div>
            <p v-if="saveStateText && !error" class="more-save ui-font">{{ saveStateText }}</p>
          </div>
          <div v-else-if="open === 'export'" class="pop-menu is-panel document-actions export-menu actions-pop" :style="actionsPopStyle">
            <button class="pop-item" @click="open = 'more'"><PhCaretLeft :size="15" />导出</button>
            <div class="doc-options-divider" />
            <button v-if="!isPreview" class="pop-item" @click="pickExport('md')"><PhFileText :size="15" /> Markdown 文件</button>
            <button v-if="!isPreview" class="pop-item" @click="pickExport('html')"><PhFileText :size="15" /> 网页（含图片）</button>
            <button v-if="!isPreview" class="pop-item" @click="pickExport('pdf')"><PhPrinter :size="15" /> 打印 / 导出 PDF</button>
            <a v-else class="pop-item" :href="pdfSrc.split('#')[0]" target="_blank" rel="noopener" @click="open = ''"><PhArrowSquareOut :size="15" />打开原文件</a>
          </div>
        </transition>
        </Teleport>
      </div>
      </div>


      <Teleport to="body">
        <Transition name="pop">
          <div v-if="quickOpen" class="pop-menu quick-open-menu ui-font" :style="quickOpenStyle" @mousedown.stop>
            <p class="quick-open-label">最近打开</p>
            <button v-for="item in quickRecent" :key="item.file" type="button" class="quick-open-doc" @click="openRecent(item)">
              <ContentIcon v-if="item.icon" :value="item.icon" :size="16" class="quick-open-icon" />
              <PhFileText v-else :size="15" class="quick-open-icon" />
              <span class="quick-open-copy"><span class="quick-open-name">{{ item.name }}</span><small>{{ item.folder }}</small></span>
              <time>{{ item.time }}</time>
            </button>
            <p v-if="!quickRecent.length" class="quick-open-empty">还没有最近文档</p>
            <div class="quick-open-sep" />
            <button type="button" class="quick-open-new" :disabled="store.isGuest" @click="createFromQuick"><PhPlus :size="15" />新建文档</button>
          </div>
        </Transition>
      </Teleport>

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
    </Teleport>

    <!-- 斜杠菜单里插入文档用的选择器 -->
    <DocPicker v-if="pickDoc" @close="pickDoc = false" @pick="onPickDoc" />

    <ConflictDialog />
    <!-- 出错提示：浮在底部，不挤正文，也不挡住当前操作 -->
    <Teleport to="body">
      <Transition name="doc-notice">
        <div v-if="error && !store.conflict" class="doc-notice" role="alert">
          <PhWarningCircle :size="16" class="doc-notice-icon" />
          <div class="doc-notice-copy">
            <p>{{ error }}</p>
            <div v-if="store.errorKind === 'save' || store.errorKind === 'load'" class="doc-notice-actions">
              <button v-if="store.errorKind === 'save'" @click="store.save()">重试保存</button>
              <button v-else @click="emit('reload')">重新读取</button>
            </div>
          </div>
          <button class="doc-notice-close" :aria-label="store.errorKind === 'save' ? '关闭错误提示' : '知道了'" @click="store.clearError()"><PhX :size="14" /></button>
        </div>
      </Transition>
    </Teleport>

    <!-- 正文：永远可编辑，没有阅读态和编辑态之分 -->
    <div class="doc-body relative flex-1 min-h-0 flex flex-col">
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
      <div
        class="doc-content"
        :class="{ 'is-ready': loaded }"
        :key="String(docId) + ':' + (loaded ? '1' : '0')"
      >
      <PdfPreview ref="pdfPreview" v-if="isPdf" :url="pdfSrc" :page="effectivePdfPage" @page="onPdfPageChange" @loaded="store.pdfPages=$event" @outline="store.pdfToc=$event.toc;store.pdfTocSource=$event.source" />
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
        <p class="text-[14px]">这个知识库还没有文档</p>
        <button v-if="!store.isGuest" class="mt-4 text-[12px] text-ds hover:underline" @click="emit('create-doc')">新建第一篇文档</button>
      </div>
      <p v-else-if="!isPreview && error" class="ui-font text-[13px] text-[var(--c-faint)] text-center pt-24">读取失败，请点击上方重新读取</p>
      <p v-else-if="!isPreview" class="ui-font text-[13px] text-[var(--c-faint)] text-center pt-24">正在读取…</p>
      </div>
      </div>
    </div>


  </div>
  <DocumentInfo :open="infoOpen" :path="docId" @close="infoOpen=false" />
  <VersionHistory :open="historyOpen" :path="docId" :current-content="raw" :preserve-current="() => store.save()" @close="closeHistory" @restore="restoreContent" />
</template>

<script setup>
import {layoutText} from '../utils/column-format'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
// 弹层里那些小图标：宽度 / 加粗斜体 / 段落 / 表格 / 主题 / 缩放 / 导出 / pdf 翻译
import {
  PhMagnifyingGlass, PhArrowsOutLineHorizontal,
  PhExport, PhArrowSquareOut, PhX, PhSpinnerGap, PhWarningCircle,
  PhCaretLeft, PhCaretRight, PhCircleHalf, PhPrinter, PhInfo, PhClockCounterClockwise,
  PhArrowsInLineHorizontal, PhArrowsHorizontal, PhArrowsVertical, PhTextB, PhTextItalic,
  PhParagraph, PhTextIndent, PhTable, PhTextAlignLeft, PhTextAlignCenter, PhTextAlignRight,
  PhArrowsOutSimple, PhArrowsInSimple, PhSun, PhCoffee, PhMoon,
  PhFileText, PhTranslate, PhPencilSimple, PhLock, PhEye, PhDotsThree, PhFolderSimple, PhPlus
} from '../icons/remix'
import { highlight } from '../utils/markdown'
import PdfPreview from '../components/PdfPreview.vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import { useReaderStore } from '../stores/reader'
import { useDocsStore } from '../stores/docs'
import DocTabs from '../components/DocTabs.vue'
import ContentIcon from '../components/ContentIcon.vue'
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
const historyOpen=ref(false),moreButton=ref(null),readingButton=ref(null)
async function closeReading(){open.value='';await nextTick();readingButton.value?.focus()}
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
const docTopbarStyle=computed(()=>({
  paddingRight: reader.tocOpen ? Math.max(0, reader.tocWidth - 73) + 'px' : '0px',
  transition: reader.tocDragging ? 'none' : 'padding-right 380ms cubic-bezier(0.22,1,0.36,1) 70ms'
}))
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
  error: { type: String, default: '' },
  /** header + 标签是否在顶栏；展开动画结束前会短暂保持 true */
  chromeCollapsed: { type: Boolean, default: false }
})
const embedded = window.self !== window.top
const browserUrl = computed(() => {
  const path = String(props.docId || '').replace(/\.(md|pdf|html?)$/i, '')
  const url = new URL(API_BASE + '/' + (window.__readerPublicView ? 'onlyread' : 'doc') + (path ? '/' + path.split('/').map(encodeURIComponent).join('/') : '/'), location.origin)
  const lib = path.split('/')[0] || new URLSearchParams(location.search).get('lib')
  if (lib) url.searchParams.set('lib', lib)
  return url.toString()
})
const emit = defineEmits(['update:keyword', 'jump', 'input', 'reload', 'select', 'canonize', 'close-tab', 'close-tabs', 'create-doc', 'reorder'])
watch(() => props.chromeCollapsed, () => {
  if (!open.value) return
  nextTick(placePopovers)
  setTimeout(placePopovers, 260)
})

/** 当前这篇是不是 pdf：是就不挂编辑器，改挂浏览器自带的 pdf 阅读器 */
/* 成品文件：pdf 与 h5。两者都交给浏览器整页渲染，工具栏与页脚信息按类型分开。 */
const isPdf = computed(() => props.meta?.type === 'pdf')
const isH5 = computed(() => props.meta?.type === 'h5')
const isPreview = computed(() => isPdf.value || isH5.value)
/*
 * 换库转场：数据层给出 out/loading/in 阶段，这里只控制标签的可见性和
 * 外层玻璃条的宽度过渡，所以不会在 0ms 把整组标签硬切掉。
 */
const tabsShown = ref(true)

watch(
  () => [store.libSwitch.phase, store.libSwitch.animated],
  ([phase, animated]) => {
    if (!animated) { tabsShown.value = true; return }
    if (phase === 'out' || phase === 'loading') { tabsShown.value = false; return }
    if (phase === 'in') { nextTick(() => { tabsShown.value = true }); return }
    tabsShown.value = true
  }
)

/** 标签条要显示的东西：文件名（跟侧栏、磁盘一致）、有没有没落盘的改动 */
const libraryEmpty = computed(() => !store.loading && !store.allFiles.length)

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
const translatePercent = computed(() => Math.max(0, Math.min(100, Math.round(Number(store.pdfTranslate.progress) || 0))))
const showTranslate = computed(() => isPdf.value && !store.isGuest && (
  store.pdfTranslationAvailable ||
  store.pdfTranslate.status === 'running' ||
  store.pdfTranslate.status === 'done' ||
  store.pdfTranslate.status === 'failed'
))
const translateLabel = computed(() => {
  const t = store.pdfTranslate
  if (t.status === 'running') return '翻译中'
  if (t.status === 'done') return store.pdfView === 'translated' ? '看原文' : '看译文'
  if (t.status === 'failed') return '重试翻译'
  return '翻译 PDF'
})
const translateTip = computed(() => {
  const t = store.pdfTranslate
  if (t.status === 'running') return '正在翻译 ' + translatePercent.value + '%'
  if (t.status === 'done') return store.pdfView === 'translated' ? '回到原文' : '查看译文'
  if (t.status === 'failed') return t.error || '翻译失败，点击重试'
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
const pdfPreview = ref(null)
const quickButton = ref(null)
const quickOpen = ref(false)
const quickOpenStyle = ref({})
const open = ref('')
const searchOpen = ref(false)
const narrow = ref(false)
const readingPopStyle = ref(null)
const actionsPopStyle = ref(null)
let narrowQuery = null
function syncNarrow(event) { narrow.value = event.matches }

/*
 * 阅读设置和文档菜单都挂到 body。
 * 只看 z-index 不够：顶栏本身在 .app-topbar 的堆叠上下文里，
 * 它下面的正文一旦有更高的层，菜单就会整块被盖住。挂到 body 后，
 * 再用按钮的屏幕坐标定位，既保持贴住按钮，也永远压在最上面。
 */
function placePopovers() {
  if (narrow.value) {
    readingPopStyle.value = null
    actionsPopStyle.value = null
    return
  }
  const rb = readingButton.value, mb = moreButton.value
  if (rb) {
    const r = rb.getBoundingClientRect()
    readingPopStyle.value = {
      top: Math.round(r.bottom + 6) + 'px',
      right: Math.max(12, Math.round(window.innerWidth - r.right)) + 'px'
    }
  }
  if (mb) {
    const r = mb.getBoundingClientRect()
    actionsPopStyle.value = {
      top: Math.round(r.bottom + 6) + 'px',
      right: Math.max(12, Math.round(window.innerWidth - r.right)) + 'px'
    }
  }
}


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
  props.error ? 'is-error' : props.saving ? 'is-saving' : props.dirty ? 'is-dirty' : 'is-saved'
)

/* ---------- 工具条 ---------- */

const currentLibName = computed(() => {
  try { return new URLSearchParams(location.search).get('lib') || '' } catch { return '' }
})
function quickTime(at) {
  const diff = Math.max(0, Date.now() - Number(at || 0))
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + ' 分钟'
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + ' 小时'
  const d = new Date(at)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
const quickRecent = computed(() => {
  const lib = currentLibName.value
  return (store.recentDocs || [])
    .filter(item => !lib || item.file === lib || item.file.startsWith(lib + '/'))
    .map(item => {
      const node = store.allFiles.find(file => file.file === item.file)
      if (!node) return null
      const rel = lib && item.file.startsWith(lib + '/') ? item.file.slice(lib.length + 1) : item.file
      const parts = rel.split('/')
      parts.pop()
      return {
        file: item.file,
        name: node.name || rel.split('/').pop()?.replace(/\.(md|pdf|html?)$/i, '') || item.file,
        folder: parts.join(' / ') || '根目录',
        icon: node.meta?.icon || '',
        time: quickTime(item.at)
      }
    })
    .filter(Boolean)
    .slice(0, 6)
})
function closeQuick() { quickOpen.value = false }
function toggleQuick() {
  if (quickOpen.value) { closeQuick(); return }
  open.value = ''
  closeSearch()
  const rect = quickButton.value?.getBoundingClientRect()
  if (rect) {
    quickOpenStyle.value = {
      top: Math.round(rect.bottom + 6) + 'px',
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 292)) + 'px'
    }
  }
  quickOpen.value = true
}
function openRecent(item) {
  closeQuick()
  emit('select', item.file)
}
function createFromQuick() {
  if (store.isGuest) return
  closeQuick()
  emit('create-doc')
}

function openSearch() {
  open.value = ''
  if (isPdf.value) {
    pdfPreview.value?.openSearch()
    return
  }
  if (isH5.value) return
  searchOpen.value = true
  nextTick(() => searchInput.value?.focus())
}
function toggle(name) {
  open.value = open.value === name ? '' : name
  if (open.value) nextTick(placePopovers)
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
 * 切文档记住读到哪，在 useDocScroll 里。
 * 它会在正文异步渲染期间逐帧重试，这里只负责把目标位置落到容器上。
 */
useDocScroll({
  scroller,
  docId: computed(() => props.docId),
  onRestore: (pos) => {
    if (scroller.value) scroller.value.scrollTop = pos
  }
})

/* 点空白处收起弹层与搜索下拉 */
function onDocClick(e) {
  if (open.value && !e.target.closest('.pop-menu, .btn-icon')) open.value = ''
  if (searchOpen.value && !e.target.closest('.doc-search-wrap')) closeSearch()
  if (quickOpen.value && !e.target.closest('.quick-open-menu, .doc-quick')) closeQuick()
}
function onFindKey(e) {
  if (e.key === 'Escape' && quickOpen.value) { e.preventDefault(); closeQuick(); return }
  if(e.key==='Escape' && open.value){
    e.preventDefault()
    if(open.value==='reading')closeReading()
    else{open.value='';moreButton.value?.focus()}
    return
  }
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'f' || isH5.value) return
  e.preventDefault()
  openSearch()
}
function onOverlayOpen() { open.value = ''; closeSearch(); closeQuick() }
watch(() => props.docId, () => { open.value=''; closeSearch(); closeQuick(); emit('update:keyword', '') })
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onFindKey)
  window.addEventListener('reader-overlay-open', onOverlayOpen)
  narrowQuery = window.matchMedia('(max-width: 640px)')
  narrow.value = narrowQuery.matches
  narrowQuery.addEventListener('change', syncNarrow)
  window.addEventListener('resize', placePopovers)
  window.addEventListener('resize', closeQuick)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onFindKey)
  window.removeEventListener('reader-overlay-open', onOverlayOpen)
  narrowQuery?.removeEventListener('change', syncNarrow)
  window.removeEventListener('resize', placePopovers)
  window.removeEventListener('resize', closeQuick)
})
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
  .reading-panel, .document-actions {
    position: fixed;
    top: 58px !important;
    right: 12px !important;
    left: 12px !important;
    bottom: auto;
    inset: 58px 12px auto;
    width: auto !important;
    max-height: calc(100dvh - 70px);
    z-index: var(--layer-dialog-menu) !important;
  }
  .doc-search-wrap.doc-search-floating {
    top: 58px;
    left: 12px;
    right: 12px;
    width: auto;
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
.doc-topbar{pointer-events:none;height:40px;flex-shrink:0;display:flex;align-items:center;gap:6px;min-width:0;padding:0 12px;background:transparent}
.doc-topbar.in-topbar{flex:1 1 auto;padding:0}
.doc-topbar > *{pointer-events:auto}
.doc-tools{position:relative;isolation:isolate;display:flex;align-items:center;gap:1px;flex:none;height:32px;padding:3px;border:0;border-radius:18px;corner-shape:superellipse(2)}
.doc-tools::before{content:'';position:absolute;inset:0;z-index:0;border-radius:inherit;corner-shape:inherit;background-color:var(--topbar-glass-bg);box-shadow:var(--topbar-glass-shadow);pointer-events:none;transition:background-color 180ms cubic-bezier(.22,1,.36,1) 140ms,box-shadow 180ms cubic-bezier(.22,1,.36,1) 140ms}
/* 模糊单独一层：只淡不透明度，避免 backdrop-filter 在 Safari 里直接跳变，也不影响外框边界。 */
.doc-tools::after{content:'';position:absolute;inset:0;z-index:-1;border-radius:inherit;corner-shape:inherit;background:transparent;-webkit-backdrop-filter:blur(12px) saturate(1.04);backdrop-filter:blur(12px) saturate(1.04);pointer-events:none;opacity:1;transition:opacity 180ms cubic-bezier(.22,1,.36,1) 140ms}
.doc-tools>*{position:relative;z-index:1}
.doc-tools:hover::before{background-color:var(--topbar-glass-bg-hover)}
/* 目录展开后 Aa/… 落进面板，玻璃外壳最后溶掉；收起时先回壳。 */
.doc-tools.is-embedded::before{background-color:transparent;box-shadow:0 2px 8px rgb(0 0 0 / 0),0 1px 2px rgb(0 0 0 / 0),inset 0 1px 0 rgb(255 255 255 / 0),inset 0 -1px 0 rgb(0 0 0 / 0);transition:background-color 200ms cubic-bezier(.4,0,.2,1) 220ms,box-shadow 200ms cubic-bezier(.4,0,.2,1) 220ms}
.doc-tools.is-embedded::after{opacity:0;transition:opacity 200ms cubic-bezier(.4,0,.2,1) 220ms}
.doc-tools.is-embedded .doc-reading .btn-icon:hover,
.doc-tools.is-embedded .doc-more .btn-icon:hover{background:color-mix(in srgb,var(--c-ink) 5%,transparent)!important;color:var(--c-ink)}
.doc-tools .doc-reading,.doc-tools .doc-more{flex:none}
.doc-tools .doc-reading .btn-icon,.doc-tools .doc-more .btn-icon{width:26px;height:26px;border-radius:7px}
.doc-tools .doc-reading .btn-icon:hover,.doc-tools .doc-more .btn-icon:hover{background:transparent!important;color:var(--c-ink)}
.doc-tools .doc-reading .btn-icon.is-active,.doc-tools .doc-more .btn-icon.is-active{background:transparent;color:var(--c-accent)}
.doc-tools .doc-more .btn-icon{opacity:1}
.tab-plus-sep{flex:none;width:1px;height:10px;border-radius:1px;background:color-mix(in srgb,var(--c-ink) 14%,transparent)}
.doc-quick{display:grid;place-items:center;flex:none;width:28px;height:28px;border-radius:12px;corner-shape:superellipse(2);color:var(--c-sub);opacity:.58;transition:transform 160ms var(--motion-snap),color 140ms ease,opacity 140ms ease}
.doc-quick:hover,.doc-quick.is-on{color:var(--c-ink);opacity:1;transform:translateY(-1px)}
.doc-quick:disabled{pointer-events:none;transform:none}
.doc-topbar .topbar-left{transition:transform 280ms var(--motion-ease),opacity 280ms ease;will-change:transform,opacity}
.doc-topbar .topbar-left.is-lib-hidden{transform:translateY(-10px);opacity:0;pointer-events:none;transition:transform 200ms var(--motion-snap),opacity 200ms ease}
.doc-content.is-ready{animation:doc-content-in 240ms var(--motion-ease) both}
@keyframes doc-content-in{from{opacity:0}to{opacity:1}}
@media(prefers-reduced-motion:reduce){.doc-content.is-ready{animation:none}}
@media(prefers-reduced-motion:reduce){.doc-topbar .topbar-left,.doc-topbar .topbar-left.is-lib-hidden{transition:none!important;transform:none!important;opacity:1!important}}
.document-shell.chrome-collapsed :deep(.page-header:not(.has-cover)){padding-top:56px}
.doc-topbar.in-topbar .topbar-left{height:32px;padding:2px 4px;border-radius:18px;corner-shape:superellipse(2);background:var(--topbar-glass-bg);-webkit-backdrop-filter:blur(12px) saturate(1.04);backdrop-filter:blur(12px) saturate(1.04);box-shadow:var(--topbar-glass-shadow);gap:6px}
.doc-topbar.in-topbar .doc-tabs{flex:1 1 auto;min-width:0}
.doc-topbar.in-topbar .doc-quick{width:28px;height:28px;border-radius:12px;corner-shape:superellipse(2);background:transparent;box-shadow:none;color:color-mix(in srgb,var(--c-ink) 55%,transparent);opacity:1;transition:transform 160ms var(--motion-snap),color 140ms ease}
.doc-topbar.in-topbar .doc-quick:hover,.doc-topbar.in-topbar .doc-quick.is-on{color:var(--c-ink);transform:translateY(-1px)}
.doc-topbar.in-topbar .doc-quick:disabled{pointer-events:none;transform:none}
.quick-open-menu{position:fixed;z-index:180;width:284px;padding:6px;background:var(--c-pop);border:1px solid var(--c-line);border-radius:12px;box-shadow:var(--c-pop-shadow)}
.quick-open-label{margin:4px 8px 5px;color:var(--c-faint);font-size:10.5px;letter-spacing:.02em}
.quick-open-doc{display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px;border-radius:7px;text-align:left;color:var(--c-text)}
.quick-open-doc:hover{background:var(--c-hover);color:var(--c-ink)}
.quick-open-icon{flex:none;color:var(--c-sub)}
.quick-open-copy{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.quick-open-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--c-ink)}
.quick-open-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:var(--c-faint)}
.quick-open-doc time{flex:none;font-size:10px;color:var(--c-faint);white-space:nowrap}
.quick-open-empty{margin:0;padding:10px 8px;font-size:11.5px;color:var(--c-faint)}
.quick-open-sep{height:1px;margin:5px 6px;background:var(--c-line-soft)}
.quick-open-new{display:flex;align-items:center;gap:8px;width:100%;padding:8px;border-radius:7px;color:var(--c-text);font-size:12px}
.quick-open-new:hover{background:var(--c-hover);color:var(--c-ink)}
.quick-open-new:disabled{opacity:.4;cursor:default}
.app-topbar{background:transparent}
.doc-reading{position:relative;flex:none}
.reading-aa{display:block;flex:none}
.doc-more{position:relative;flex:none}
.doc-more .btn-icon{color:var(--c-faint);opacity:.75}
.doc-more .btn-icon:hover,.doc-more .btn-icon.is-active{opacity:1;background:var(--c-hover)}
.reading-panel{width:min(344px,calc(100vw - 24px));max-height:calc(100dvh - 68px);overflow-y:auto;scrollbar-width:thin;z-index:var(--layer-dialog-menu)!important}
.reading-pop,.actions-pop{position:fixed;transform-origin:top right}
.reading-pop.pop-enter-active,.actions-pop.pop-enter-active{transition:opacity 240ms ease,transform 460ms var(--motion-pop),filter 280ms ease!important}
.reading-pop.pop-leave-active,.actions-pop.pop-leave-active{transition:opacity 220ms ease,transform 300ms var(--motion-snap),filter 200ms ease!important}
.reading-pop.pop-enter-from,.actions-pop.pop-enter-from{opacity:0;transform:translateY(-14px) scale(.93,.86);filter:blur(1.5px)}
.reading-pop.pop-leave-to,.actions-pop.pop-leave-to{opacity:0;transform:translateY(-10px) scale(.96,.92);filter:blur(1px)}
.document-actions{z-index:var(--layer-dialog-menu)!important}
.doc-save-state{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;white-space:nowrap;padding:0 4px;color:var(--c-sub);transition:color 160ms ease}
.doc-save-state.is-dirty{color:var(--c-sub)}
.doc-save-state.is-dirty::before{content:'';width:4px;height:4px;border-radius:50%;background:var(--c-accent);flex:none}
.doc-save-state.is-saving{color:var(--c-accent)}
.doc-save-state.is-error{color:#a55752}
.doc-translate{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px;border-radius:8px;border:1px solid transparent;color:var(--c-sub);font-size:11.5px;white-space:nowrap;flex:none;transition:background 140ms ease,color 140ms ease}
.doc-translate:hover{background:var(--c-hover);color:var(--c-ink)}
.doc-translate.is-running{color:var(--c-accent);background:var(--c-active)}
.doc-translate.is-done{color:var(--c-accent)}
.doc-translate-meter{width:42px;height:3px;border-radius:2px;background:color-mix(in srgb,var(--c-accent) 16%,transparent);overflow:hidden;flex:none}
.doc-translate-meter i{display:block;height:100%;border-radius:inherit;background:var(--c-accent);transition:width 240ms ease}
.doc-translate-pct{font-size:10.5px;color:var(--c-accent);min-width:29px;text-align:right}
.doc-notice{position:fixed;left:50%;bottom:max(22px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2400;width:min(440px,calc(100vw - 28px));display:flex;align-items:flex-start;gap:9px;padding:10px 10px 10px 12px;background:var(--c-pop);border:1px solid var(--c-line);border-radius:14px;box-shadow:0 6px 24px rgb(0 0 0 / .12);corner-shape:superellipse(2)}
.doc-notice-icon{flex:none;margin-top:1px;color:var(--c-sub)}
.doc-notice-copy{flex:1;min-width:0;max-height:min(180px,40vh);overflow:auto}
.doc-notice-copy p{margin:0;color:var(--c-text);font-size:12.5px;line-height:1.55;overflow-wrap:anywhere}
.doc-notice-actions{display:flex;gap:14px;margin-top:5px}
.doc-notice-actions button{font-size:11.5px;color:var(--c-accent);font-weight:500}
.doc-notice-actions button:hover{text-decoration:underline;text-underline-offset:2px}
.doc-notice-close{flex:none;display:grid;place-items:center;width:24px;height:24px;border-radius:6px;color:var(--c-faint)}
.doc-notice-close:hover{background:var(--c-hover);color:var(--c-ink)}
.doc-notice-enter-active,.doc-notice-leave-active{transition:opacity 160ms ease,transform 200ms var(--motion-snap)}
.doc-notice-enter-from,.doc-notice-leave-to{opacity:0;transform:translate(-50%,8px) scale(.985)}
@media(max-width:640px){.doc-translate{padding:0 6px}.doc-translate-label,.doc-translate-meter{display:none}}
.more-stats{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:10px 11px 3px;font-size:11px;color:var(--c-faint)}
.more-save{margin:0;padding:1px 11px 8px;font-size:11px;color:var(--c-faint)}
.menu-shortcut{margin-left:auto;font:11px var(--font-sans);color:var(--c-faint)}
.doc-search-wrap.doc-search-floating{position:fixed;top:44px;right:14px;left:auto;z-index:140;width:min(330px,calc(100vw - 28px))}
.doc-search-floating .doc-search-panel{position:static;width:100%}
.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
</style>

<style scoped>
.doc-search-wrap { position:relative }
.doc-search-panel { position:absolute;right:0;top:38px;width:min(330px,var(--search-available));padding:6px 7px;background:var(--c-pop);border:1px solid var(--surface-menu-border);border-radius:12px;box-shadow:var(--surface-menu-shadow);z-index:80 }
.doc-search-field { display:flex;align-items:center;gap:6px;min-height:32px;padding:0 3px }.doc-search-field input { min-width:0;flex:1;outline:none;background:transparent;font-size:12px;padding:5px 0 }.doc-search-field button{width:24px;height:24px;display:grid;place-items:center;border-radius:6px;color:var(--c-faint)}.doc-search-field button:hover{background:var(--c-hover);color:var(--c-ink)}
.search-scope { font-size:10.5px;line-height:1.6;color:var(--c-faint);padding:6px 4px }
.doc-search-results { max-height:45vh;overflow:auto }.search-hit { display:block;width:100%;text-align:left;font-size:11.5px;line-height:1.65;padding:6px;border-radius:6px }.search-hit:hover{background:var(--c-hover)}
.search-hit small { display:block; font-size:9.5px; color:var(--c-faint) }
.pop-item:disabled { opacity:.5;cursor:default }
@media(max-width:640px){ .reader-topbar{padding-left:8px!important;padding-right:8px!important;gap:2px!important}.single-doc-title{max-width:25vw} }
.document-actions{width:min(260px,calc(100vw - 24px))}.document-actions .pop-item svg{flex:none}.menu-tail{margin-left:auto}.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
</style>

<style scoped>
.doc-state-pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}.doc-state{display:flex;align-items:center;gap:6px;padding:10px 5px;font-size:11px;color:var(--c-sub);border-radius:var(--radius-control)}.doc-state:hover{background:var(--c-hover)}.doc-state:disabled{opacity:.65;cursor:default}.state-switch{width:22px;height:13px;border-radius:var(--radius-surface);background:var(--c-line);position:relative;margin-left:auto;flex-shrink:0}.state-switch:after{content:'';position:absolute;width:9px;height:9px;left:2px;top:2px;background:var(--c-pop);border-radius:50%;box-shadow:0 1px 2px #0002}.state-switch.on{background:var(--c-accent)}.state-switch.on:after{left:11px}.doc-options-divider{height:1px;background:var(--c-line);margin:6px 0}
.document-actions{width:min(260px,calc(100vw - 24px))}.document-actions .pop-item svg{flex:none}.menu-tail{margin-left:auto}.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
</style>

<style scoped>.guest-access-note{gap:4px;flex-shrink:0;display:inline-flex;align-items:center;min-height:24px;padding:2px 9px;border-radius:var(--radius-control);corner-shape:superellipse(2);background:var(--c-field);color:var(--c-sub);font:11px var(--font-sans)}@media(max-width:640px){.guest-access-note{padding-inline:6px}}.document-actions{width:min(260px,calc(100vw - 24px))}.document-actions .pop-item svg{flex:none}.menu-tail{margin-left:auto}.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
</style>

<style scoped>.open-in-browser{flex:none;margin-left:3px;color:var(--c-faint)}.open-in-browser:hover{background:var(--c-hover);color:var(--c-ink);text-decoration:none}.open-in-browser:focus-visible{outline:2px solid var(--c-accent);outline-offset:2px}.document-actions{width:min(260px,calc(100vw - 24px))}.document-actions .pop-item svg{flex:none}.menu-tail{margin-left:auto}.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
</style>

<style scoped>
.type-tabs{grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:18px}.type-groups{display:grid;gap:20px}.type-group{display:grid;gap:8px;min-width:0}.type-group .type-label{margin:0;min-height:16px}.type-group .type-range{margin:4px 0 0}.type-group :deep(.select-menu-trigger){width:100%;min-height:34px;padding:8px 12px;justify-content:space-between}.type-chip{min-height:32px}.reader-bottombar{border:0;background:var(--c-panel)}
</style>
