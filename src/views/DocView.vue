<template>
  <div class="h-screen flex flex-col overflow-hidden">
    <!-- 顶部工具条：左侧是打开的文档，右侧是各功能入口 -->
    <div class="reader-topbar h-[52px] px-8 flex items-center justify-end gap-1.5 flex-shrink-0">
      <!-- 多篇打开时显示标签；只看一篇时省去没有关闭按钮的孤立标签。 -->
      <DocTabs v-if="tabItems.length" class="mr-auto" :items="tabItems" :active="docId" @select="emit('select',$event)" @close="onCloseTab" />
      <span v-if="store.restoredCopy" class="guest-access-note" title="独立恢复副本，修改不会影响原知识库"><PhClockCounterClockwise :size="12" />恢复副本</span>
      <span v-if="store.isGuest && docId" class="guest-access-note" :title="isPreview ? '此文件提供预览' : store.currentReadonly ? '这篇文档仅供阅读' : '这篇文档允许访客编辑'"><component :is="isPreview?PhEye:store.currentReadonly?PhLock:PhPencilSimple" :size="12" />{{ isPreview ? '预览' : store.currentReadonly ? '只读' : '可编辑' }}</span>

      <div v-if="!isPreview" ref="searchWrap" class="doc-search-wrap" :style="{ '--search-available': searchPanelWidth + 'px' }">
        <button class="btn-icon" title="查找当前文档" aria-label="查找当前文档" :aria-expanded="searchOpen" @click="toggleDocSearch"><PhMagnifyingGlass :size="15" /></button>
        <transition name="pop">
        <div v-if="searchOpen" class="doc-search-panel ui-font" role="search" aria-label="查找当前文档">
          <div class="doc-search-field"><PhMagnifyingGlass :size="14" /><input ref="searchInput" :value="keyword" placeholder="查找当前文档" @input="emit('update:keyword', $event.target.value)" @keydown.esc="closeSearch" /><button title="关闭查找" aria-label="关闭查找" @click="closeSearch"><PhX :size="16" /></button></div>
          <div v-if="keyword.trim()" class="doc-search-results">
            <p v-if="!results.length" class="search-scope">没有匹配</p>
            <template v-for="r in results" :key="r.id"><button v-for="(h,i) in r.hits.slice(0,20)" :key="i" class="search-hit" @click="onResultClick(r, h)"><span v-html="highlight(h.text, keyword)" /><small>第 {{ h.line }} 行{{ h.occurrence > 1 ? `，本行第 ${h.occurrence} 处` : '' }}</small></button></template>
          </div>
        </div>
        </transition>
      </div>

      <!-- 阅读偏好仅用于 Markdown；PDF 使用自己的阅读控件 -->
      <div v-if="!isPreview" class="relative">
        <button
          class="btn-icon"
          :class="{ 'is-active': open === 'type' }"
          title="排版"
          @click="toggle('type')"
        >
          <PhTextT :size="15" />
        </button>
        <transition name="pop">
          <div v-if="open === 'type'" class="pop-menu is-panel type-panel">

            <div class="type-tabs" role="tablist" aria-label="排版设置">
              <button v-for="section in [{ id: 'text', label: '文字' }, { id: 'paragraph', label: '段落' }, { id: 'table', label: '表格' }]" :key="section.id" role="tab" :aria-selected="typeSection === section.id" :class="{ 'is-on': typeSection === section.id }" @click="typeSection = section.id">{{ section.label }}</button>
            </div>
            <div v-if="typeSection === 'paragraph'">
            <p class="type-label"><span class="label-main"><component :is="PhArrowsHorizontal" :size="12" class="label-icon" />正文宽度</span></p>
            <div class="type-row columns-3">
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
            </div>
            <div v-if="typeSection === 'text'">

            <p class="type-label"><span class="label-main"><component :is="PhTextT" :size="12" class="label-icon" />正文字号</span></p>
            <div class="type-row columns-4">
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
            <div class="type-row columns-2 font-choices">
              <button
                v-for="f in FONTS"
                :key="f.id"
                class="type-chip"
                :class="{ 'is-on': reader.font === f.id }"
                :title="f.hint || f.label"
                @click="reader.font = f.id"
              >
                <span class="font-sample" :style="{ fontFamily: f.stack }">文</span>
                {{ f.label }}
              </button>
            </div>
            <p class="type-label"><span class="label-main"><component :is="PhTextB" :size="12" class="label-icon" />中文加粗</span></p>
            <div class="type-row columns-2">
              <button
                v-for="w in STRONG_FACES"
                :key="w.id"
                class="type-chip"
                :class="{ 'is-on': reader.strongFace === w.id }"
                @click="reader.strongFace = w.id"
              >
                <component v-if="w.icon" :is="w.icon" :size="13" class="chip-icon" />
                {{ w.label }}
              </button>
            </div>

            <p class="type-label"><span class="label-main"><component :is="PhTextItalic" :size="12" class="label-icon" />中文斜体显示</span></p>
            <div class="type-row columns-2">
              <button
                v-for="i2 in ITALIC_FACES"
                :key="i2.id"
                class="type-chip"
                :class="{ 'is-on': reader.italicFace === i2.id }"
                @click="reader.italicFace = i2.id"
              >
                <component v-if="i2.icon" :is="i2.icon" :size="13" class="chip-icon" />
                {{ i2.label }}
              </button>
            </div>

            </div>
            <div v-if="typeSection === 'paragraph'">
            <p class="type-label"><span class="label-main"><component :is="PhParagraph" :size="12" class="label-icon" />段落样式</span></p>
            <div class="type-row columns-2">
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
            </div>
            <div v-if="typeSection === 'table'">

            <p class="type-label"><span class="label-main"><component :is="PhTable" :size="12" class="label-icon" />表格宽度</span></p>
            <div class="type-row columns-2">
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
            <div class="type-row columns-3">
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
            </div>
            <div v-if="typeSection === 'paragraph'">

            <p class="type-label">
              <span class="label-main"><PhArrowsVertical :size="12" class="label-icon" />行距</span>
              <span class="tabular-nums text-[var(--c-faint)]">{{ reader.leading.toFixed(2) }}</span>
            </p>
            <div class="type-row columns-3">
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
              aria-label="行距"
              min="1.4"
              max="2.4"
              step="0.05"
              :value="reader.leading"
              @input="reader.leading = Number($event.target.value)"
            />

            <p class="type-label">
              <span class="label-main"><PhArrowsHorizontal :size="12" class="label-icon" />字间距</span>
              <span class="tabular-nums text-[var(--c-faint)]">{{ reader.tracking.toFixed(2) }} em</span>
            </p>
            <input
              class="type-range"
              type="range"
              aria-label="字间距"
              min="-0.02"
              max="0.12"
              step="0.01"
              :value="reader.tracking"
              @input="reader.tracking = Number($event.target.value)"
            />
            </div>
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
          <div v-if="open === 'look'" class="pop-menu is-panel look-panel">

            <p class="type-label"><span class="label-main"><component :is="PhCircleHalf" :size="12" class="label-icon" />主题</span></p>
            <div class="type-row columns-2">
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

            <p v-if="!isPreview" class="type-label">
              <span class="label-main"><PhMagnifyingGlass :size="12" class="label-icon" />Markdown 阅读缩放</span>
              <span class="tabular-nums text-[var(--c-faint)]">{{ reader.zoom }}%</span>
            </p>
            <div v-if="!isPreview" class="type-row columns-3">
              <button
                v-for="z in ZOOMS"
                :key="z.value"
                class="type-chip"
                :class="{ 'is-on': reader.zoom === z.value }"
                @click="reader.zoom = z.value"
              >
                <component v-if="z.icon" :is="z.icon" :size="13" class="chip-icon" />
                {{ z.label }}
              </button>
            </div>
          </div>
        </transition>
      </div>

      <div v-if="docId" class="relative">
        <button ref="exportButton" class="btn-icon" title="文档操作" aria-label="文档操作" :aria-expanded="['access', 'visibility'].includes(open)" :class="{ 'is-active': ['access', 'visibility'].includes(open) }" @click="toggle('access')"><PhDotsThree :size="18" weight="bold" /></button>
        <transition name="pop">
        <div v-if="open === 'access'" class="pop-menu is-panel document-actions">
          <template v-if="!store.isGuest">
            <button ref="visibilityEntry" class="pop-item" @click="showVisibility"><component :is="meta.shared === false ? PhEyeSlash : PhEye" :size="15" /><span>{{ meta.shared === false ? '仅自己可见' : '已纳入分享范围' }}</span><PhCaretRight :size="13" class="menu-tail" /></button>
            <div class="doc-options-divider" />
          </template>
          <button v-if="canRevealInFinder" class="pop-item" @click="showInFinder"><PhFolderSimple :size="15" /> {{ fileManagerLabel() }}</button>
          <button v-if="!store.isGuest" class="pop-item" @click="open='';infoOpen=true"><PhInfo :size="15" /> 文档信息</button>
          <button v-if="!store.isGuest && !isPreview" class="pop-item" @click="open=''; historyOpen=true"><PhClockCounterClockwise :size="15" /> 历史版本</button>
          <div class="doc-options-divider" />
          <p class="menu-section-label">导出</p>
          <button v-if="!isPreview" class="pop-item" @click="pickExport('md')"><PhFileText :size="15" /> Markdown 文件</button>
          <button v-if="!isPreview" class="pop-item" @click="pickExport('html')"><PhFileText :size="15" /> 网页（含图片）</button>
          <button v-if="!isPreview" class="pop-item" @click="pickExport('pdf')"><PhPrinter :size="15" /> 打印 / 导出 PDF</button>
          <a v-else class="pop-item" :href="pdfSrc.split('#')[0]" target="_blank" rel="noopener"><PhArrowSquareOut :size="15" />打开原文件</a>
        </div>
        <div v-else-if="open === 'visibility'" class="pop-menu is-panel document-actions">
          <button ref="visibilityBack" class="pop-item" @click="backToActions"><PhCaretLeft :size="15" />分享范围</button>
          <div class="doc-options-divider" />
          <button class="doc-state" role="switch" :aria-checked="meta.shared !== false" aria-label="纳入分享范围" @click="changeAccess('shared')"><PhEye :size="15" /><span>纳入分享范围</span><span class="state-switch" :class="{on:meta.shared !== false}" /></button>
          <p class="settings-scope">{{ meta.shared === false ? '仅自己可见。' : '此设置不生成或更新分享链接。' }}</p>
          <template v-if="meta.shared !== false">
            <button v-if="!isPreview" class="doc-state" role="switch" :aria-checked="!!meta.locked" :disabled="!!meta.lockedAt && meta.lockedAt !== docId" aria-label="访客只读" @click="changeAccess('locked')"><PhLock :size="15" /><span>访客只读</span><span class="state-switch" :class="{on:meta.locked}" /></button>
            <p class="settings-scope">{{ meta.lockedAt && meta.lockedAt !== docId ? '由上级设为只读。' : '访客视角权限；分享副本始终只读。' }}</p>
          </template>
        </div>
        </transition>
      </div>

      <!-- pdf 翻译：没翻过就起任务，翻好了就是看译文 / 看原文的开关 -->
      <button
        v-if="isPdf && !store.isGuest && (store.pdfTranslationAvailable || store.pdfTranslate.status==='done')"
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
      <a v-if="embedded" class="btn-icon open-in-browser" :href="browserUrl" target="_blank" rel="noopener noreferrer" title="在浏览器打开当前文档" aria-label="在浏览器打开当前文档"><PhArrowSquareOut :size="17" /></a>

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
      <button class="ui-font text-[12px] text-[#c0392b] underline shrink-0" @click="emit('reload')">
        重新读取
      </button>
    </div>

    <!-- 正文：永远可编辑，没有阅读态和编辑态之分 -->
    <div
      id="main-scroll-container"
      ref="scroller"
      class="flex-1 min-h-0 overflow-y-auto print-area"
      :style="pageStyle"
    >
      <!--
        PDF：交给浏览器自带的阅读器，支持翻页和跳页（服务端带 Range）。
        H5：整页渲染，保留它自己的布局，不套阅读器的行宽限制。
        两者都是成品文件，不经过 markdown 解析。
      -->
      <PdfPreview v-if="isPdf" :url="pdfSrc" :page="pdfPage" @page="store.pdfPage=$event" @loaded="store.pdfPages=$event" @outline="store.pdfToc=$event.toc;store.pdfTocSource=$event.source" />
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
        @open-doc="store.select($event)"
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

    <!-- 底栏 -->
    <div
      v-if="docId"
      class="reader-bottombar h-8 px-8 flex items-center gap-3 text-[11.5px] text-[var(--c-faint)] shrink-0 border-t border-[var(--c-line-soft)]"
    >
      <!-- h5 没有页数可数，只报体积 -->
      <template v-if="isH5">
        <span class="ui-font tabular-nums">H5</span>
        <span v-if="meta.size" class="ui-font tabular-nums">{{ (meta.size / 1024).toFixed(0) }} KB</span>
      </template>
      <!-- pdf 没有正文可数，显示页数和体积 -->
      <template v-else-if="isPdf">
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
          {{ store.pdfView === 'translated' ? '正在看译文，点回原文' : '译文已就绪，点看译文' }}
        </button>
      </template>
      <template v-else>
        <span class="ui-font tabular-nums" :title="stats.tip">{{ stats.total }} 字</span>
        <span class="ui-font tabular-nums">{{ stats.lines }} 行</span>
      </template>
      <span class="ui-font ml-auto flex items-center gap-1.5">
        <span v-if="store.currentReadonly" class="ui-font text-[var(--c-faint)]">只读</span>
        <PhSpinnerGap v-if="saving" :size="12" class="spin" />
        <span :class="saveStateClass">{{ saveStateText }}</span>
      </span>
      <button v-if="!isPdf" class="status-to-top" :disabled="!showTop" title="回到顶部 T" @click="scrollTop"><PhArrowUp :size="15"/></button>
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
  PhExport, PhListDashes, PhArrowSquareOut, PhX, PhArrowUp, PhSpinnerGap, PhWarningCircle,
  PhCaretLeft, PhCaretRight, PhCircleHalf, PhPrinter, PhInfo, PhClockCounterClockwise,
  PhArrowsInLineHorizontal, PhArrowsHorizontal, PhArrowsVertical, PhTextB, PhTextItalic,
  PhParagraph, PhTextIndent, PhTable, PhTextAlignLeft, PhTextAlignCenter, PhTextAlignRight,
  PhArrowsOutSimple, PhArrowsInSimple, PhSun, PhCoffee, PhMoon,
  PhFileText, PhTranslate, PhPencilSimple, PhLock, PhEye, PhEyeSlash, PhDotsThree, PhFolderSimple
} from '@phosphor-icons/vue'
import { highlight } from '../utils/markdown'
import PdfPreview from '../components/PdfPreview.vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import { useReaderStore, WIDTH_OPTIONS, PACE_OPTIONS } from '../stores/reader'
import { useDocsStore } from '../stores/docs'
import DocTabs from '../components/DocTabs.vue'
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
const historyOpen=ref(false),exportButton=ref(null),visibilityEntry=ref(null),visibilityBack=ref(null)
async function showVisibility(){open.value='visibility';await nextTick();visibilityBack.value?.focus()}
async function backToActions(){open.value='access';await nextTick();visibilityEntry.value?.focus()}
async function closeHistory(){historyOpen.value=false;await nextTick();exportButton.value?.focus()}
const restoredEpoch=ref(0)
function restoreContent(text){emit('input',text);restoredEpoch.value++}
const store = useDocsStore()
const canRevealInFinder = computed(() => !store.isGuest && fileManagerAvailable() && !!props.docId)
async function showInFinder() {
  open.value = ''
  try { await revealInFileManager(props.docId) }
  catch (error) { store.error = String(error.message || error) }
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
  const path = String(props.docId || '').replace(/\.(md|pdf)$/i, '')
  const url = new URL(API_BASE + '/' + (window.__readerPublicView ? 'onlyread' : 'doc') + (path ? '/' + path.split('/').map(encodeURIComponent).join('/') : '/'), location.origin)
  const lib = path.split('/')[0] || new URLSearchParams(location.search).get('lib')
  if (lib) url.searchParams.set('lib', lib)
  return url.toString()
})
const emit = defineEmits(['update:keyword', 'jump', 'input', 'reload', 'select', 'canonize', 'close-tab', 'create-doc'])

/** 当前这篇是不是 pdf：是就不挂编辑器，改挂浏览器自带的 pdf 阅读器 */
/* 成品文件：pdf 与 h5。两者都交给浏览器整页渲染，工具栏与页脚信息按类型分开。 */
const isPdf = computed(() => props.meta?.type === 'pdf')
const isH5 = computed(() => props.meta?.type === 'h5')
const isPreview = computed(() => isPdf.value || isH5.value)
/** 标签条要显示的东西：文件名（跟侧栏、磁盘一致）、有没有没落盘的改动 */
const tabItems = computed(() =>
  store.tabs.map((file) => ({
    file,
    name: store.allFiles.find((f) => f.file === file)?.name || file.split('/').pop().replace(/\.(md|pdf)$/i, ''),
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
    store.select(rel)
  }
}
onMounted(() => window.addEventListener('message', onPreviewAction))
onBeforeUnmount(() => window.removeEventListener('message', onPreviewAction))

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
    // 译文是原文一页、译文一页交替的（36 页 = 18 页原文 + 18 页译文），
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
  { id: 'harmony', label: '鸿蒙黑体', hint: 'HarmonyOS Sans SC', stack: '"HarmonyOS Sans SC", "Noto Sans SC", sans-serif' },
  { id: 'kai', label: '楷体', stack: '"ChillKai", "Kaiti SC", STKaiti, serif' },
  { id: 'ping', label: '苹方', stack: '"PingFang SC", "Hiragino Sans GB", sans-serif' }
]

/* 中文加粗面：中文排版传统里强调靠换更重的字面，不是加大字号 */
const STRONG_FACES = [
  { id: 'black', label: '特黑', weight: 900 },
  { id: 'bold', label: '标准加粗', weight: 600 }
]

/* 中文斜体面：中文的斜体不做倾斜变形，换楷体是传统做法 */
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

/* 表格宽度：默认用满可用宽度，宽表才不会被压得每列都很窄 */
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

const scroller = ref(null)
const searchInput = ref(null)
const searchWrap = ref(null)
const searchPanelWidth = ref(360)
let searchResizeObserver
function updateSearchPanelWidth() {
  const wrap = searchWrap.value?.getBoundingClientRect()
  const main = searchWrap.value?.closest('main')?.getBoundingClientRect()
  if (!wrap || !main) return
  searchPanelWidth.value = Math.max(120, Math.min(360, Math.floor(wrap.right - main.left - 12)))
}
/* 窄屏下搜索先收成图标，点了才展开——顶栏在手机上放不下一个常驻输入框 */
const mobileSearchOpen = ref(false)
function openMobileSearch() {
  mobileSearchOpen.value = true
  nextTick(() => searchInput.value?.focus())
}
function closeMobileSearch() {
  mobileSearchOpen.value = false
}
const open = ref('')
const typeSection = ref('text')
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

function changeAccess(key) {
  if (key === 'locked' && props.meta.lockedAt && props.meta.lockedAt !== props.docId) return
  const value = key === 'shared' ? props.meta.shared === false : !props.meta.locked
  store.requestAccess(props.docId, { [key]: value }, key === 'shared' ? (value ? '纳入分享范围' : '仅自己可见') : (value ? '设为访客只读' : '允许访客编辑'))
}
function toggleDocSearch() {
  searchOpen.value = !searchOpen.value
  if (searchOpen.value) nextTick(() => { updateSearchPanelWidth(); searchInput.value?.focus() })
}
function toggle(name) {
  open.value = open.value === name || (name === 'access' && open.value === 'visibility') ? '' : name
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
  else if(kind==='html')exportHtml().catch(e=>{store.error=e.message})
  else exportPdf()
}
function closeSearch() {
  searchOpen.value = false
  mobileSearchOpen.value = false
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
 * 这里只把还原位置要等 DOM 落定这个界面侧的事接过来。
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
  if (searchOpen.value && !e.target.closest('.doc-search-wrap')) closeSearch()
}
function onFindKey(e) { if(e.key==='Escape' && open.value){ e.preventDefault();if(open.value==='visibility')backToActions();else{open.value='';exportButton.value?.focus()}return } if (!isPreview.value && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); searchOpen.value = true; nextTick(() => { updateSearchPanelWidth(); searchInput.value?.focus() }) } }
function onOverlayOpen() { open.value = ''; closeSearch() }
watch(() => props.docId, () => { open.value=''; closeSearch(); emit('update:keyword', '') })
onMounted(() => { document.addEventListener('click', onDocClick); document.addEventListener('keydown', onFindKey); window.addEventListener('reader-overlay-open', onOverlayOpen); window.addEventListener('resize', updateSearchPanelWidth); searchResizeObserver = new ResizeObserver(updateSearchPanelWidth); if (searchWrap.value) searchResizeObserver.observe(searchWrap.value.closest('main')); updateSearchPanelWidth() })
onBeforeUnmount(() => { document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onFindKey); window.removeEventListener('reader-overlay-open', onOverlayOpen); window.removeEventListener('resize', updateSearchPanelWidth); searchResizeObserver?.disconnect() })
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
  color: var(--color-ds);
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
  background: var(--color-ds);
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
.document-actions{width:min(260px,calc(100vw - 24px))}.document-actions .pop-item svg{flex:none}.menu-tail{margin-left:auto}.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
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
.doc-state-pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}.doc-state{display:flex;align-items:center;gap:6px;padding:10px 5px;font-size:11px;color:var(--c-sub);border-radius:var(--radius-control)}.doc-state:hover{background:var(--c-hover)}.doc-state:disabled{opacity:.65;cursor:default}.state-switch{width:22px;height:13px;border-radius:var(--radius-surface);background:var(--c-line);position:relative;margin-left:auto;flex-shrink:0}.state-switch:after{content:'';position:absolute;width:9px;height:9px;left:2px;top:2px;background:var(--c-pop);border-radius:50%;box-shadow:0 1px 2px #0002}.state-switch.on{background:var(--color-ds)}.state-switch.on:after{left:11px}.doc-options-divider{height:1px;background:var(--c-line);margin:6px 0}
.document-actions{width:min(260px,calc(100vw - 24px))}.document-actions .pop-item svg{flex:none}.menu-tail{margin-left:auto}.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
</style>

<style scoped>.status-to-top{display:grid;place-items:center;width:26px;height:24px;background:var(--c-field);border-radius:var(--radius-surface)}.status-to-top:hover{background:var(--c-chip-hover)}.status-to-top:disabled{opacity:.35;cursor:default}.guest-access-note{gap:4px;flex-shrink:0;display:inline-flex;align-items:center;min-height:24px;padding:2px 9px;border-radius:var(--radius-control);corner-shape:superellipse(2);background:var(--c-field);color:var(--c-sub);font:11px var(--font-sans)}@media(max-width:640px){.guest-access-note{padding-inline:6px}}.document-actions{width:min(260px,calc(100vw - 24px))}.document-actions .pop-item svg{flex:none}.menu-tail{margin-left:auto}.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
</style>

<style scoped>.open-in-browser{flex:none;margin-left:3px;color:var(--c-faint)}.open-in-browser:hover{background:var(--c-hover);color:var(--c-ink);text-decoration:none}.open-in-browser:focus-visible{outline:2px solid var(--color-ds);outline-offset:2px}.document-actions{width:min(260px,calc(100vw - 24px))}.document-actions .pop-item svg{flex:none}.menu-tail{margin-left:auto}.menu-section-label,.settings-scope{font-size:11px;color:var(--c-sub);line-height:1.6;margin:4px 10px 10px}.menu-section-label{margin:10px 11px 3px}.document-actions .doc-state{width:100%;padding:10px 11px;font-size:12px}
</style>
