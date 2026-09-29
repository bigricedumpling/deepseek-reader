<template>
  <!--
    外壳底色必须走变量。
    这里原本写死 bg-white，它夹在 #app 和所有面板之间，把 body 的深色底整片盖住，
    于是切深色时只有编辑器内部变色，侧栏、工具条、目录、底栏全是白的。
  -->
  <div class="flex h-screen w-full overflow-hidden bg-[var(--c-surface)]">
    <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><filter id="reader-superellipse" x="-20%" y="-30%" width="140%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 12 -4"/></filter></defs></svg>
    <Sidebar
      :nodes="store.treeNodes"
      :current-path="store.currentPath"
      :width="reader.navWidth"
      @update:width="reader.navWidth = $event"
      :collapsed="reader.navCollapsed"
      @select="onSelect"
      @create-doc="askCreateDoc"
      @delete-doc="askDeleteDoc"
      @create-category="askCreateCategory"
      @delete-category="askDeleteCategory"
      @toggle-collapse="reader.navCollapsed = !reader.navCollapsed"
    />

    <main class="flex-1 flex flex-col h-full relative min-w-0">
      <!--
        只传文档本身的东西。阅读设置（字体/字号/主题/表格…）一律由组件自己读
        reader store，不再从这里下发——下发过一次 size，结果漏了，四档字号全失效。
      -->
      <DocView
        :doc-id="store.currentPath"
        :pdf-page="store.pdfPage"
        :pdf-pages="store.pdfPages"
        :meta="store.currentMeta"
        :html="store.currentHtml"
        :raw="store.currentRaw"
        :toc="store.currentToc"
        :scroll-top-signal="scrollTopSignal"
        :keyword="store.searchKeyword"
        :results="store.searchResults"
        :loaded="store.currentLoaded"
        @select="onSelect"
        :epoch="docEpoch"
        @canonize="onCanonize"
        @close-tab="onCloseTab"
        :dirty="store.isDirty"
        :saving="store.saving"
        :saved-at="store.savedAt"
        :error="store.error"
        @update:keyword="store.searchKeyword = $event"
        @input="onEdit"
        @jump="onJump"
        @create-doc="askCreateDocInCurrentLib"
        @reload="store.reload()"
      />
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
      @to-top="scrollTopSignal++"
      @go-page="store.pdfPage = $event"
    />

    <AccessDialog />
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
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
/* 页面加载时间：跟服务端的源码修改时间比对，判断手上这份页面是不是旧的 */
const pageLoadedAt = Date.now()
import AccessDialog from './components/AccessDialog.vue'
import Sidebar from './components/Sidebar.vue'
import DocView from './views/DocView.vue'
import TocPanel from './components/TocPanel.vue'
import AppDialog from './components/AppDialog.vue'
import { useDocsStore } from './stores/docs'
import { useReaderStore } from './stores/reader'
import { scrollToTarget } from './utils/scroll-target'
import { foldedKeys, unfoldKeys } from './utils/toc-fold'

const store = useDocsStore()
/** 当前这篇是不是 pdf：右栏显示它的书签目录，点击跳页 */
const isPdfDoc = computed(() => store.currentNode?.type === 'pdf')
/*
 * 阅读设置全部搬进了 reader store。
 * 这里只留布局相关的瞬态（目录里的回顶信号），它不需要持久化、也不跨组件共享语义。
 */
const reader = useReaderStore()

/** 目录里的回顶按钮靠这个计数通知正文区 */
const scrollTopSignal = ref(0)

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

/**
 * 做任何会离开当前文档的操作之前，先处理没保存的改动。
 * 返回 true 表示可以继续；保存失败或用户取消都返回 false，调用方必须检查。
 */
function ensureSafe() {
  return new Promise((resolve) => {
    if (!store.isDirty) {
      if (store.saving) store.save().then(resolve)
      else resolve(true)
      return
    }
    ask({
      title: '有没保存的改动',
      message: '' + store.currentMeta.name + '改过还没保存。',
      confirmText: '保存并继续',
      altText: '丢弃改动',
      onConfirm: async () => {
        dialog.open = false
        // 保存失败就停在这里，不能带着未保存的内容走
        resolve(await store.save())
      },
      onAlt: () => {
        dialog.open = false
        store.discard()
        resolve(true)
      },
      onCancel: () => resolve(false)
    })
  })
}

/* ---------- 树结构操作 ---------- */

function askCreateCategory(parent) {
  const target = parent || ''
  ask({
    mode: 'prompt',
    title: target ? '在' + target + '下新建目录' : '在根目录下新建目录',
    placeholder: '目录名，例如 参考资料',
    confirmText: '创建',
    onConfirm: async (name) => {
      dialog.open = false
      await guard(() => store.createCategory(target, name))
    }
  })
}

function askDeleteCategory(folder) {
  ask({
    title: '删除目录' + folder.name + '',
    message:
      '整个目录会连同里面的东西一起挪到 .回收站，文件不会被真删掉，想找回随时可以。',
    confirmText: '删除',
    danger: true,
    onConfirm: async () => {
      dialog.open = false
      if (store.currentPath.startsWith(folder.path + '/') && !(await ensureSafe())) return
      await guard(() => store.deleteCategory(folder.path))
    }
  })
}
async function askCreateDoc(dir) {
  // 目录从哪来：根部按钮传当前知识库路径，目录行传它所在的目录。
  // 没传参时也**默认根目录** —— 以前会悄悄落到"当前文档所在目录"，
  // 于是按了根部的按钮、对话框里却写着在『笔试』下新建文档，很莫名其妙。
  const target = dir == null ? '' : dir
  // 先处理未保存的改动，再问名字，顺序反了会让人白填一次
  if (!(await ensureSafe())) return
  ask({
    mode: 'prompt',
    title: target ? '在' + target + '下新建文档' : '在根目录下新建文档',
    placeholder: '文档名（就是文件名）',
    confirmText: '创建',
    onConfirm: async (name) => {
      dialog.open = false
      await guard(() => store.createDoc(target, name))
    }
  })
}

function askCreateDocInCurrentLib() {
  return askCreateDoc(new URLSearchParams(location.search).get('lib') || '')
}

function askDeleteDoc(doc) {
  const editingThis = doc.file === store.currentPath && store.isDirty
  ask({
    title: '删除文档' + doc.name + '',
    message:
      '文件不会被真删掉，会从 ' + doc.file + ' 挪到 .回收站 里，想找回随时可以。' +
      (editingThis ? '\n\n注意：这篇正文有改动还没保存，删掉之后这些改动也没了。' : ''),
    confirmText: '删除',
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
    ask({ title: '没成功', message: String(e.message || e), confirmText: '知道了' })
  }
}

/**
 * 按编辑器规范重排这篇（真丢内容、用户在有损黄条上主动点的）。
 *
 * 有损时编辑器不能自动保存，否则会静默改写正文；但用户可以让它"一次性对齐规范"：
 * 把还原后的文本写回磁盘，这篇从此就能富文本编辑。所以这里要先确认、再写、写完重读。
 */
function onCanonize(text) {
  const file = store.currentPath
  const name = store.currentNode?.name || store.currentPath
  ask({
    title: '按编辑器规范重排《' + name + '》？',
    message: '就是把这篇按编辑器能表达的写法重写一遍 —— 上面列出的差异行会全部落到磁盘上。改完这篇就能用富文本编辑，之后不再提示。',
    confirmText: '重排并保存',
    onConfirm: () => {
      dialog.open = false
      if (store.currentPath !== file) return
      store.updateContent(text)
      guard(async () => {
        if (!(await store.save())) throw new Error(store.error || '保存失败')
        // 重排完重新挂一次编辑器：黄条才会消失（:key 不变的话组件是复用的）
        docEpoch.value++
        await store.select(store.currentPath)
      })
    }
  })
}

/** 换一个"重新挂载编辑器"的信号：重排、重新读取之后靠它让黄条重新判断 */
const docEpoch = ref(0)

/* ---------- 切换与保存 ---------- */

async function onSelect(file) {
  if (file === store.currentPath) return
  clearTimeout(saveTimer)
  if (!(await ensureSafe())) return
  await store.select(file)
}

/**
 * 关掉一个标签。
 *
 * 关的是当前这篇时，**先确认能安全离开（该存先存），再删标签、再切到邻居** ——
 * 顺序反过来的话，保存失败或被取消时标签已经没了，界面会自相矛盾。
 */
async function onCloseTab(file) {
  clearTimeout(saveTimer)
  if (file === store.currentPath && !(await ensureSafe())) return
  const next = store.closeTab(file)
  if (next && next !== store.currentPath) await store.select(next)
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
  () => [store.currentPath, store.currentRaw, store.isDirty, store.saving],
  ([path, raw, dirty, saving]) => {
    clearTimeout(saveTimer)
    if (!dirty) failedSave = null
    if (!dirty || saving) return
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
  const meta = e.metaKey || e.ctrlKey
  if (meta && e.key.toLowerCase() === 'k') {
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
     *   3. 只按文件名 —— 分享出去的旧链接，在文件夹改名之后还能打开，
     *      不然"上周发给别人的链接"一改名就全废了。
     */
    const strip = (f) => f.replace(/\.(md|pdf)$/i, '')
    const tail = (f) => f.split('/').pop()
    const hit =
      store.allFiles.find((f) => f.file === routed) ||
      store.allFiles.find((f) => strip(f.file) === routed) ||
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
    if (w < 900) reader.navCollapsed = true
  } else {
    const crossed = (px) => lastW >= px && w < px
    if (crossed(1180) && reader.tocOpen) reader.tocOpen = false
    if (crossed(900) && !reader.navCollapsed) reader.navCollapsed = true
  }
  lastW = w
}
fitViewport()
window.addEventListener('resize', fitViewport)

onBeforeUnmount(() => {
  window.removeEventListener('resize', fitViewport)
  clearInterval(staleTimer)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

function onBeforeUnload(e) {
  if (!store.isDirty) return
  e.preventDefault()
  e.returnValue = ''
}

function focusSearch() {
  const el = document.querySelector('input[placeholder="查找当前文档"]')
  if (el) {
    el.focus()
    el.select?.()
  }
}

async function onJump({ id, keyword, hit }) {
  // 当前文档内定位不会离开编辑器，不应因为尚未自动保存而弹出离开确认。
  if (id !== store.currentPath && !(await ensureSafe())) return
  await jumpTo(id, keyword, hit)
}

function findSearchBlock(root, keyword, ordinal) {
  const needle = keyword.toLocaleLowerCase()
  let seen = 0, first = null
  for (const block of root.children) {
    if (block.classList.contains('prosemirror-virtual-cursor')) continue
    const text = block.textContent.toLocaleLowerCase()
    let at = text.indexOf(needle)
    while (at >= 0) {
      if (!first) first = block
      if (seen++ === ordinal) return block
      at = text.indexOf(needle, at + needle.length)
    }
  }
  return first
}

async function jumpTo(id, keyword, hit) {
  if (id !== store.currentPath) await store.select(id)
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const root = document.getElementById('main-scroll-container')
    const editor = root?.querySelector('.ProseMirror')
    if (!editor || !keyword) continue
    const block = findSearchBlock(editor, keyword, hit?.ordinal ?? 0)
    if (!block) continue
    if (block.classList.contains('reader-folded')) {
      unfoldKeys(Object.keys(foldedKeys()))
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    scrollToTarget(root, block)
    block.classList.add('search-flash')
    setTimeout(() => block.classList.remove('search-flash'), 1600)
    return
  }
}
</script>
