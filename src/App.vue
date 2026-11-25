<template>
  <!--
    外壳底色必须走变量。
    这里原本写死 bg-white，它夹在 #app 和所有面板之间，把 body 的深色底整片盖住，
    于是切深色时只有编辑器内部变色，侧栏、工具条、目录、底栏全是白的。
  -->
  <div class="flex h-screen w-full overflow-hidden bg-[var(--c-surface)]">
    <!--
      知识库列表是整窗最左列：在顶栏和侧栏之外，占满高度。
      这样它、顶栏、文档侧栏是三层，而不是把列表塞到顶栏下面。
    -->
    <div id="app-lib-panel-slot" class="lib-panel-slot"></div>

    <div class="app-main-col relative flex-1 min-w-0 flex flex-col" :class="{ 'is-browsing-files': !reader.navCollapsed, 'is-gallery-open': galleryOpen, 'is-resizing-nav': navDragging }">
    <!--
      知识库列表在整窗最左列，这条顶栏从它右侧开始。
      chrome 在顶栏时这一行才展开：侧栏 header 和文档标签都 Teleport 进来，
      合成一条横跨文档区的顶栏。展开时高度为 0，header 归侧栏、标签归文档区。
    -->
    <div id="workspace-gallery-slot" ref="gallerySlot" class="workspace-gallery-slot" :inert="!galleryOpen"></div>
    <div class="workspace-reader" :inert="galleryOpen">
    <header class="app-topbar" :class="{ 'is-open': chromeCollapsed }">
      <div id="app-topbar-left" ref="topbarLeftEl" class="min-w-0" :style="topbarLeftStyle"></div>
      <div id="app-topbar-main" class="flex-1 min-w-0 flex items-center"></div>
    </header>
    <div v-if="topbarReady" class="flex-1 min-h-0 flex">
    <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><filter id="reader-superellipse" x="-20%" y="-30%" width="140%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 12 -4"/></filter></defs></svg>
    <Sidebar
      ref="sidebarRef"
      :nodes="store.treeNodes"
      :current-path="store.currentPath"
      :width="reader.navWidth"
      @update:width="reader.navWidth = $event"
      @update:dragging="setNavDragging"
      :collapsed="reader.navCollapsed"
      :chrome-collapsed="chromeCollapsed"
      :chrome-compact="chromeCompact"
      :chrome-expanding="chromeExpanding"
      @select="onSelect"
      @find-result="openLibraryMatch"
      @delete-doc="askDeleteDoc"
      @delete-category="askDeleteCategory"
      @toggle-collapse="toggleNav"
      :gallery-present="galleryPresent"
      @gallery-change="setGalleryOpen"
      @return-to-reading="returnToReading"
    />

    <main class="flex-1 flex flex-col h-full relative min-w-0">
      <!--
        只传文档本身的东西。阅读设置（字体/字号/主题/表格…）一律由组件自己读
        reader store，不再从这里下发——下发过一次 size，结果漏了，四档字号全失效。
      -->
      <DocView ref="docView"
        :active="!galleryOpen"
        :doc-id="store.currentPath"
        :chrome-collapsed="chromeCollapsed"
        :pdf-page="store.pdfPage"
        :pdf-pages="store.pdfPages"
        :meta="store.currentMeta"
        :raw="store.currentRaw"
        :toc="store.currentToc"
        :loaded="store.currentLoaded"
        @select="onSelect"
        @close-tab="onCloseTab"
        @close-tabs="onCloseTabs"
        @reorder="onReorderTabs"
        :dirty="store.isDirty"
        :saving="store.saving"
        :saved-at="store.savedAt"
        :error="store.error"
        @input="onEdit"
        @create-doc="askCreateDocInCurrentLib"
        @reload="store.reload()"
        @open-outline="openDocumentOutline"
      />
      <RailToc @open="openDocumentOutline" />
    </main>

    <TocPanel
      :toc="isPdfDoc ? store.pdfToc : store.currentToc"
      :pdf="isPdfDoc"
      :note="isPdfDoc && store.pdfTocSource === 'text' ? '按正文标题识别' : ''"
      :toc-error="isPdfDoc ? store.pdfTocError : ''"
      :doc-key="store.currentPath"
      :collapsed="!reader.tocOpen"
      :width="reader.tocWidth"
      @update:collapsed="reader.tocOpen = !$event"
      @update:width="reader.tocWidth = $event"
      @update:dragging="reader.tocDragging = $event"
      @go-page="store.pdfPage = $event"
    />

    </div>
    </div>
    </div>

    <AppDialog
      :open="dialog.open"
      :mode="dialog.mode"
      :title="dialog.title"
      :message="dialog.message"
      :placeholder="dialog.placeholder"
      :initial="dialog.initial"
      :confirm-text="dialog.confirmText"
      :alt-text="dialog.altText"
      :danger="dialog.danger"
      @confirm="dialog.onConfirm"
      @alt="dialog.onAlt && dialog.onAlt()"
      @cancel="closeDialog"
    />

    <!--
      开发时的代码看门狗：改了源码但页面还是旧的（热更新断了、或者编辑器实例没重建），
      这种状态在界面上完全看不出来，会让人以为改动没生效。发现源码变新就提示，点一下刷新。
    -->
    <transition name="pop">
      <button v-if="staleCode" class="stale-toast ui-font" @click="reloadNow">
        代码已更新，点这里刷新
      </button>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
/* 页面加载时间：跟服务端的源码修改时间比对，判断手上这份页面是不是旧的 */
const pageLoadedAt = Date.now()
import Sidebar from './components/Sidebar.vue'
import DocView from './views/DocView.vue'
import TocPanel from './components/TocPanel.vue'
import RailToc from './components/RailToc.vue'
import AppDialog from './components/AppDialog.vue'
import { useDocsStore } from './stores/docs'
import { useReaderStore } from './stores/reader'
import { findRoutedDocument } from './utils/routes.js'
const docView = ref(null)

const store = useDocsStore()
const galleryOpen = ref(false)
const gallerySlot = ref(null)
const galleryPresent = ref(false)
let galleryRequest = 0
async function setGalleryOpen(open) {
  const request = ++galleryRequest
  galleryOpen.value = open
  if (open) {
    galleryPresent.value = true
    return
  }
  // Keep the outgoing gallery and its scroll position until the reversible CSS transition finishes.
  await nextTick()
  await Promise.allSettled((gallerySlot.value?.getAnimations() || []).map(animation => animation.finished))
  if (request === galleryRequest) galleryPresent.value = false
}
const topbarReady = ref(false)
onMounted(() => { topbarReady.value = true })
/** 当前这篇是不是 pdf：右栏显示它的书签目录，点击跳页 */
const isPdfDoc = computed(() => store.currentNode?.type === 'pdf')
/*
 * 阅读设置全部搬进了 reader store。
 * 这里只留布局相关的瞬态（目录里的回顶信号），它不需要持久化、也不跨组件共享语义。
 */
const reader = useReaderStore()

/* 顶栏常驻：侧栏展开/收起只改变左段宽度，不再把 header 和标签搬回文档区。 */
const chromeCollapsed = ref(true)
/** 收起的静止态：header 用内容宽度，不是整条侧栏宽度 */
const chromeCompact = ref(reader.navCollapsed)
/** 动画期间给 #app-topbar-left 的显式宽度；空表示按状态取 auto / 侧栏宽度 */
const chromeWidth = ref('')
const chromeExpanding = ref(false)
const topbarLeftStyle = computed(() => ({
  width: chromeWidth.value || (reader.navCollapsed ? 'auto' : reader.navWidth + 'px')
}))
const topbarLeftEl = ref(null)
let navChange = 0
const navDragging = ref(false)
function setNavDragging(active) {
  navDragging.value = active
  if (active) {
    // A drag can take over while the sidebar is still opening.
    navChange++
    chromeWidth.value = ''
    chromeCompact.value = false
    chromeExpanding.value = false
  }
}

async function toggleNav() {
  const change = ++navChange
  const closing = !reader.navCollapsed
  if (mobileFileView() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reader.navCollapsed = closing
    chromeCompact.value = closing
    chromeExpanding.value = false
    chromeWidth.value = ''
    return
  }

  const slot = topbarLeftEl.value
  const start = slot?.getBoundingClientRect().width || reader.navWidth
  const end = closing ? (sidebarRef.value?.compactHeaderWidth() || reader.navWidth) : reader.navWidth
  chromeCompact.value = false
  chromeExpanding.value = !closing
  chromeWidth.value = start + 'px'
  reader.navCollapsed = closing
  await nextTick()
  if (change !== navChange) return

  void slot?.offsetWidth
  chromeWidth.value = end + 'px'
  await nextTick()
  if (change !== navChange) return
  // On reversal, only the last request can hand the width back to auto.
  const panel = document.querySelector('.app-sidebar > aside')
  const widths = [slot, panel].flatMap(el => el?.getAnimations() || [])
    .filter(animation => animation.transitionProperty === 'width')
  await Promise.allSettled(widths.map(animation => animation.finished))
  if (change !== navChange) return
  chromeCompact.value = closing
  chromeExpanding.value = false
  chromeWidth.value = ''
}
function collapseNavNow(immediate = false) {
  if (immediate || reader.navCollapsed) {
    navChange++
    chromeCollapsed.value = true
    chromeCompact.value = true
    chromeExpanding.value = false
    chromeWidth.value = ''
    if (immediate) reader.navCollapsed = true
    return
  }
  /* 光标拖窄窗口时也走同一套收起过渡，避免顶栏和标签先跳一下。 */
  toggleNav()
}

/** 侧栏公开方法：搜索、新建与宽度测量 */
const sidebarRef = ref(null)

/* ---------- 弹窗 ---------- */

const dialog = reactive({
  open: false,
  mode: 'confirm',
  title: '',
  message: '',
  placeholder: '',
  initial: '',
  confirmText: '确定',
  altText: '',
  danger: false,
  onConfirm: () => {},
  onAlt: null,
  onCancel: null
})

function ask(opts) {
  Object.assign(dialog, {
    mode: 'confirm',
    message: '',
    placeholder: '',
    initial: '',
    confirmText: '确定',
    altText: '',
    danger: false,
    onConfirm: () => {},
    onAlt: null,
    onCancel: null
  }, opts)
  dialog.open = true
}

function closeDialog() {
  const cb = dialog.onCancel
  dialog.open = false
  if (cb) cb()
}

/* ---------- 树结构操作 ---------- */

function askDeleteCategory(folder) {
  ask({
    title: '将文件夹移入回收站？',
    message: folder.path + '\n\n文件夹里的内容也会移入回收站。',
    confirmText: '移入回收站',
    danger: true,
    onConfirm: async () => {
      dialog.open = false
      if (store.currentPath.startsWith(folder.path + '/') && !(await store.saveBeforeNavigation())) return
      await guard(() => store.deleteCategory(folder.path))
    }
  })
}
function askCreateDocInCurrentLib() {
  /* 空知识库里的“新建第一篇”也走侧栏就地输入，不弹命名框 */
  return sidebarRef.value?.startCreate?.('doc')
}

function askDeleteDoc(doc) {
  const editingThis = doc.file === store.currentPath && store.isDirty
  ask({
    title: '将文档移入回收站？',
    message: doc.file + (editingThis ? '\n\n继续删除会丢弃尚未保存的修改。' : ''),
    confirmText: '移入回收站',
    danger: true,
    onConfirm: async () => {
      dialog.open = false
      await guard(() => store.deleteDoc(doc.file))
    }
  })
}

async function guard(fn) {
  try {
    await fn()
  } catch (e) {
    if (!store.conflict) ask({ title: '没成功', message: String(e.message || e), confirmText: '知道了' })
  }
}

/* ---------- 切换与保存 ---------- */

function onReorderTabs(files) {
  store.reorderTabs(files)
}

const mobileFileView = () => window.matchMedia('(max-width:720px)').matches
async function openDocumentOutline() {
  reader.tocOpen = true
  await nextTick()
  const outline = document.getElementById('document-outline')
  const target = outline?.querySelector('.toc-item.is-active') || outline?.querySelector('.toc-collapse-chip')
  target?.focus({ preventScroll: true })
}

function returnToReading() {
  if (reader.navCollapsed || !mobileFileView()) return
  collapseNavNow(true)
  nextTick(() => document.querySelector('.doc-tab.is-active .doc-tab-main, .sidebar-toggle')?.focus({ preventScroll: true }))
}

async function onSelect(file) {
  if (await store.select(file)) returnToReading()
}

async function onCloseTabs(files) {
  const targets = new Set(files)
  const available = store.tabs.filter(file => store.tabIcons.has(file))
  const remaining = available.filter(file => !targets.has(file))
  if (!remaining.length) return
  if (targets.has(store.currentPath)) {
    const index = available.indexOf(store.currentPath)
    const next = available.slice(index + 1).find(file => !targets.has(file)) || remaining.at(-1)
    if (!(await store.select(next))) return
  }
  for (const file of targets) {
    if (file !== store.currentPath) store.closeTab(file)
  }
}

function onCloseTab(file) {
  return onCloseTabs([file])
}

/* ---------- 自动保存 ---------- */

/**
 * 用户一停手就存。正文改动写进 store 之后，防抖 800ms 落盘。
 * 不再有编辑态和阅读态之分，所以也不需要有保存按钮。
 */
let saveTimer = null
let failedSave = null

function onEdit(text) {
  store.updateContent(text)
}

// 监听脏标记而不是挂在编辑器的 input 上：不管改动从哪来，停手就落盘
watch(
  () => [store.currentPath, store.currentRaw, store.isDirty, store.saving, store.conflict?.path],
  ([path, raw, dirty, saving, conflictPath]) => {
    clearTimeout(saveTimer)
    if (!dirty) failedSave = null
    if (!dirty || saving || path === conflictPath) return
    if (failedSave?.path === path && failedSave?.raw === raw) return
    saveTimer = setTimeout(async () => {
      if (store.isDirty && !store.saving && store.currentPath === path) {
        failedSave = { path, raw }
        if (await store.save()) failedSave = null
      }
    }, 800)
  }
)


/* ---------- 快捷键 ---------- */

function onKey(e) {
  if (e.defaultPrevented) return
  const meta = e.metaKey || e.ctrlKey
  if (galleryOpen.value && meta && ['k', 'f'].includes(e.key.toLowerCase())) {
    if (document.querySelector('[aria-modal="true"]')) return
    e.preventDefault()
    const input = document.querySelector('#workspace-gallery-slot input[type="search"]')
    input?.focus()
    input?.select()
    return
  }
  if (meta && e.key.toLowerCase() === 'k') {
    // 弹窗打开时不要把焦点抢到后面的侧栏搜索
    if (document.querySelector('[aria-modal="true"]')) return
    e.preventDefault()
    focusSearch()
  }
  if (meta && e.key.toLowerCase() === 's') {
    e.preventDefault()
    store.save()
  }
}

/* ---------- 代码看门狗（只在开发态跑） ---------- */

const staleCode = ref(false)
let staleTimer = null

function reloadNow() {
  window.location.reload()
}

/** 地址栏里的 /edit/<路径> 或 /onlyread/<路径>（不带扩展名） */
function routedDocPath() {
  try {
    // 部署在子路径时先剥掉 BASE，再匹配 /edit/… 或 /onlyread/…
    const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
    const full = decodeURI(location.pathname)
    const rest = base && full.startsWith(base) ? full.slice(base.length) : full
    /*
     * 同样不锚定开头：站点可能挂在子路径下，见 store 里 routedDocPath 的说明。
     *
     * 文档路径这一段要用 decodeURIComponent：路径里的斜杠会被编码成 %2F，
     * 而 decodeURI 有意不还原它，拿着 %2F 去比对目录里的路径永远匹配不上。
     * 只解这一段，不要解整条 pathname。
     */
    const m = rest.match(/\/(?:doc|edit|onlyread)\/(.+)$/)
    return m ? decodeURIComponent(m[1]).replace(/\/+$/, '') : ''
  } catch {
    return ''
  }
}

function watchForStaleCode() {
  if (!import.meta.env.DEV) return
  staleTimer = setInterval(async () => {
    try {
      const res = await fetch(API_BASE + '/api/build', { cache: 'no-store' })
      const json = await res.json()
      // 源码比页面新 1 秒以上，说明这份页面是旧的
      if (json.ok && json.data.mtime > pageLoadedAt + 1000) staleCode.value = true
    } catch {
      /* 服务没起来就当没事 */
    }
  }, 15000)
}

onMounted(async () => {
  // 系统主题变化的监听在 reader store 里，这里不再重复挂
  // 先挂监听再加载，否则加载期间 ⌘S 和关闭提醒是失效的
  window.addEventListener('keydown', onKey)
  window.addEventListener('beforeunload', onBeforeUnload)
  await store.loadAll()

  /*
   * 地址栏点名的那一篇，在这里**最后再对一次**。
   *
   * store 内部有两处自动选取（上次读过的、第一篇），它们有自己的兜底逻辑，
   * 前面在 store 里加判断被它们盖掉过。放在最外层、所有初始化之后对一次最稳：
   * 打开 /edit/调研/数据调研 就直接落在那一篇，而不是"上次读到的那篇"。
   */
  const routed = routedDocPath()
  if (routed) {
    /*
     * 三种认法，越往后越宽松：
     *   1. 完整路径（带扩展名）
     *   2. 不带扩展名的路径
     *   3. 只按文件名 —— 早先发出去的只读链接，在文件夹改名之后还能打开，
     *      不然"上周发给别人的链接"一改名就全废了。
     */
    const strip = (f) => f.replace(/\.(md|pdf|html?)$/i, '')
    const tail = (f) => f.split('/').pop()
    const hit =
      findRoutedDocument(store.allFiles, routed) ||
      store.allFiles.find((f) => strip(tail(f.file)) === tail(routed))
    if (hit && store.currentPath !== hit.file) await store.select(hit.file)
  }

  // 开发期把 store 暴露出来，方便无头浏览器跑回归
  if (import.meta.env.DEV) window.__reader = store
})
watchForStaleCode()

/*
 * 视口不够宽时先收右栏（目录），再不够就收左栏（侧栏）——
 * 只在"跨过阈值"那一下动手，之后你手动展开就不管了，免得跟你抢。
 */
/*
 * 首次进入直接按当前宽度定，不能只等"从宽变窄"那一下——
 * 那样用窄窗口或半屏打开时会一直挤着不收。
 */
let lastW = null
function fitViewport() {
  const w = window.innerWidth
  if (lastW === null) {
    if (w < 1180) reader.tocOpen = false
    if (w < 900) collapseNavNow(true)
  } else {
    const crossed = (px) => lastW >= px && w < px
    if (crossed(1180) && reader.tocOpen) reader.tocOpen = false
    if (crossed(900) && !reader.navCollapsed) collapseNavNow()
  }
  lastW = w
}
fitViewport()
window.addEventListener('resize', fitViewport)

onBeforeUnmount(() => {
  window.removeEventListener('resize', fitViewport)
  navChange++
  clearInterval(staleTimer)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

function onBeforeUnload(e) {
  if (!store.isDirty) return
  e.preventDefault()
  e.returnValue = ''
}

/**
 * Cmd+K 找的是"哪篇文档"，交给侧栏的文档搜索；
 * 当前文档内查找是 Cmd+F，由 DocView 自己处理。
 */
function focusSearch() {
  if (sidebarRef.value?.expandAndSearch) {
    sidebarRef.value.expandAndSearch()
    return
  }
  // 兜底：侧栏方法不可用时，聚焦已经展开的当前文档搜索框
  const el = document.querySelector('input[placeholder="查找当前文档"]')
  if (el) {
    el.focus()
    el.select?.()
  }
}

async function openLibraryMatch(hit) {
  if (!(await store.select(hit.file))) return
  returnToReading()
  await nextTick()
  await docView.value?.showLibraryHit(hit)
}
</script>

<style scoped>
.lib-panel-slot {
  display: flex;
  height: 100%;
  flex-shrink: 0;
  min-width: 0;
}
.app-main-col { --workspace-topbar-height: 48px; }
.app-main-col.is-resizing-nav #app-topbar-left,
.app-main-col.is-resizing-nav :deep(.app-sidebar > aside) { transition:none; }
.app-topbar {
  height: 0;
  padding: 0;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
}
.app-topbar.is-open {
  height: var(--workspace-topbar-height);
  pointer-events: none;
  /* 左内边距保持 0：header 自己带 10px，和侧栏里的位置完全重合 */
  padding: 0 10px 0 0;
  overflow: visible;
  /* Document and panel headers keep their own backgrounds beneath this shared row. */
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
}
/* Reading and browsing occupy independent planes. The incoming view takes focus
   immediately; an interrupted transition reverses from its current opacity. */
.workspace-reader {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  z-index: 0;
  opacity: 1;
  visibility: visible;
}
.workspace-gallery-slot {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  background: var(--c-surface);
  opacity: 0;
  visibility: hidden;
}
.is-gallery-open > .workspace-gallery-slot { opacity: 1; visibility: visible; }
.is-gallery-open > .workspace-reader { opacity: 0; visibility: hidden; }
@media (prefers-reduced-motion: no-preference) {
  .workspace-gallery-slot {
    transform: translateY(4px);
    transition: opacity 120ms ease-in, transform 160ms var(--motion-ease), visibility 0s linear 160ms;
  }
  .is-gallery-open > .workspace-gallery-slot {
    transform: none;
    transition: opacity 170ms ease-out 30ms, transform 200ms var(--motion-ease) 30ms, visibility 0s;
  }
  .workspace-reader { transition: opacity 150ms ease-out 30ms, visibility 0s; }
  .is-gallery-open > .workspace-reader { transition: opacity 120ms ease-in, visibility 0s linear 120ms; }
}
#app-topbar-left {
  pointer-events: auto;
  flex: 0 0 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  /* 宽度动画和侧栏同步，收起态宽度由内容撑开 */
  transition: width 0.22s cubic-bezier(0,0,.2,1);
}
@media screen and (max-width:720px) {
  .app-main-col.is-browsing-files #app-topbar-left { width:100% !important; }
  .app-main-col.is-browsing-files :is(#app-topbar-main, main),
  .app-main-col.is-browsing-files :deep(.toc-panel) { display:none; }
}
#app-topbar-main {
  pointer-events: none;
  display: flex;
  align-items: center;
}
</style>
