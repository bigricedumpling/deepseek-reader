<template>
  <div class="editor-shell">
    <div v-if="lossy" class="lossy-note ui-font">
      <p>
        这篇里有编辑器逐字还原不了的结构，所以改成了源码编辑：内容照常编辑和自动保存，
        只是看到的是 markdown 原文（不这么做会静默改写你的正文）。
      </p>
      <p class="lossy-actions">
        <button class="lossy-btn" @click="showDiff = !showDiff">
          {{ showDiff ? '收起差异' : '差在哪' }}
        </button>
        <button v-if="!readonly" class="lossy-btn is-primary" @click="emit('canonize', roundTripText)">
          按编辑器规范重排这篇
        </button>
        <span v-if="!readonly" class="lossy-hint">重排 = 接受上面列出的差异（会改写磁盘上的这份文件），之后这篇就能富文本编辑</span>
      </p>
      <ul v-if="showDiff" class="lossy-diff">
        <li v-for="d in diff" :key="d.line">
          <span class="lossy-line">第 {{ d.line }} 行</span>
          <span class="lossy-side is-before">- {{ d.original === null ? '（没有这一行）' : d.original }}</span>
          <span class="lossy-side is-after">+ {{ d.out === null ? '（编辑器会删掉）' : d.out }}</span>
        </li>
      </ul>
    </div>
    <textarea
      v-if="lossy"
      ref="srcEl"
      class="src-editor"
      :value="value"
      :readonly="readonly"
      spellcheck="false"
      @input="onSourceInput"
    />
    <div v-show="!lossy" ref="host" class="crepe-host"></div>

    <!-- 块左侧那个六点手柄，点一下弹出来的「转为」菜单 -->
    <BlockTypeMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :groups="menu.groups"
      @pick="onMenuPick"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Crepe } from '@milkdown/crepe'
import { renderMermaidSvg } from '../utils/mermaid'
import { normalizeMarkdown, diffLines, isCosmeticOnly } from '../utils/markdown-normalize'
import { editorShortcuts, applyBlockKind, blockKindOf } from '../utils/editor-shortcuts'
import { editorFold, bindFoldView, refreshFolds } from '../utils/editor-fold'
import { foldKey, isFolded, isFoldable, setFoldable, toggleFold, foldState, foldDoc } from '../utils/toc-fold'
import BlockTypeMenu from './BlockTypeMenu.vue'
import { editorViewCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'

/*
 * 编辑器是在 onMounted 里建出来的实例，组件热更新不会重建它 ——
 * 改了下面这段逻辑，页面上完全看不出变化。所以只要这个组件被热更新，就整页刷新。
 */
if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload())
}
import { useMermaidPreview } from '../composables/useMermaidPreview'
import { useTableColumnWidths } from '../composables/useTableColumnWidths'
import { languages as cmLanguages } from '@codemirror/language-data'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import '../styles/editor-crepe.css'

const props = defineProps({
  value: { type: String, default: '' },
  /* 用来按文档存列宽，换文档不会串 */
  /** 访客只读：编辑器不接收输入 */
  readonly: { type: Boolean, default: false },
  docId: { type: String, default: '' },
  /** 文档在仓库里的相对路径，列宽旁路文件用它做键 */
  docFile: { type: String, default: '' }
})
const emit = defineEmits(['update:value', 'lossy', 'canonize', 'pick-doc', 'open-doc'])

const host = ref(null)
const srcEl = ref(null)

const mermaid = useMermaidPreview({ host, renderSvg: renderMermaidSvg })
const colw = useTableColumnWidths({
  host,
  docId: computed(() => props.docId),
  docFile: computed(() => props.docFile)
})
/** 这篇有没有编辑器表达不了的结构，有就走源码编辑 */
const lossy = ref(false)
/** 有损时：还原后的文本（用户点"按编辑器规范重排"就写它）与差异行 */
const roundTripText = ref('')
const diff = ref([])
const showDiff = ref(false)
let crepe = null
let observer = null
/**
 * 用户有没有真的动过这篇。
 * 绝对不能在没动过的情况下回写：编辑器把 markdown 解析再序列化，
 * 会改掉一些写法（`---` 变 `***`，表格补空格对齐，URL 包成尖括号），
 * 一旦自动保存把这种结果写回去，原文就被重排了。
 */
let userTyped = false
/**
 * 编辑器创建时原文的快照。
 * 不能拿 props.value 做比对基准——它会被父组件更新掉，
 * 而表格单元格的合并必须跟"最初的原文"比才准。
 */
const baseline = props.value


/** 比较往返结果时忽略空白差异，只看内容有没有实质变化 */
function normalize(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
}

onMounted(async () => {
  crepe = new Crepe({
    root: host.value,
    defaultValue: props.value,
    featureConfigs: {
      [Crepe.Feature.Toolbar]: {
        buildToolbar: (builder) => {
          const groups = builder.build()
          builder.clear()
          builder.addGroup('block-type', '块格式').addItem('block-type', {
            label: '转换格式',
            icon: '<span class="block-type-label">转换格式 <span aria-hidden="true">⌄</span></span>',
            active: () => false,
            onRun: () => openSelectionMenu()
          })
          for (const group of groups) {
            const target = builder.addGroup(group.key, group.label)
            for (const item of group.items) target.addItem(item.key, item)
          }
        }
      },
      [Crepe.Feature.Placeholder]: {
        text: '打斜杠 / 插入标题、表格、代码块',
        mode: 'block'
      },
      [Crepe.Feature.BlockEdit]: {
        /*
         * 斜杠菜单里多一组：插入本知识库的其他文档。
         * 插进去的是一条普通的 markdown 链接，点击时由 editor-shortcuts 的
         * "内部链接"分支接住 —— 开成工具内部的标签页，不是浏览器标签页。
         */
        buildMenu: (builder) => {
          builder.addGroup('reader', '本知识库').addItem('doc-link', {
            label: '插入文档',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M10.75 6a.75.75 0 0 0-1.5 0v4.25H5a.75.75 0 0 0 0 1.5h4.25V16a.75.75 0 0 0 1.5 0v-4.25H15a.75.75 0 0 0 0-1.5h-4.25V6Z"/><path d="M6.75 3h10.5A2.75 2.75 0 0 1 20 5.75v12.5A2.75 2.75 0 0 1 17.25 21H6.75A2.75 2.75 0 0 1 4 18.25V5.75A2.75 2.75 0 0 1 6.75 3Zm0 1.5c-.69 0-1.25.56-1.25 1.25v12.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V5.75c0-.69-.56-1.25-1.25-1.25H6.75Z"/></svg>',
            onRun: () => emit('pick-doc')
          })
        },
        // 只给 label 不给 icon，图标会沿用默认的
        textGroup: {
          label: '基础',
          text: { label: '正文' },
          h1: { label: '一级标题' },
          h2: { label: '二级标题' },
          h3: { label: '三级标题' },
          h4: { label: '四级标题' },
          h5: { label: '五级标题' },
          h6: { label: '六级标题' },
          quote: { label: '引用' },
          divider: { label: '分割线' }
        },
        listGroup: {
          label: '列表',
          bulletList: { label: '无序列表' },
          orderedList: { label: '有序列表' },
          taskList: { label: '待办列表' }
        },
        advancedGroup: {
          label: '插入',
          image: { label: '图片' },
          codeBlock: { label: '代码块' },
          table: { label: '表格' },
          math: { label: '公式' }
        }
      },
      [Crepe.Feature.CodeMirror]: {
        // 挂上 CodeMirror 的语言包，代码块才有语法高亮。按语言惰性加载，不写的那种不下载
        languages: cmLanguages,
        previewToggleText: (previewOnly) => (previewOnly ? '编辑' : '预览')
      }
    }
  })

  // 编辑快捷键：改块类型、整块上移下移、列表缩进
  // 访客（分享链接进来的人）是只读的：编辑器层面直接关掉，不靠前端藏按钮
  if (props.readonly) crepe.setReadonly(true)
  crepe.editor.use(editorShortcuts({ docId: props.docId, onOpenDoc: (path) => emit('open-doc', path) }))
  // 正文里的标题折叠（跟右侧目录共用一份折叠状态）
  crepe.editor.use(editorFold())

  crepe.on((listener) => {
    listener.markdownUpdated((_ctx, md, prev) => {
      if (!userTyped || lossy.value) return
      if (md === prev) return
      // 先把 Crepe 的外观改动还原掉再交出去，否则会把整篇文档重排后存回磁盘
      // spacing:false —— 保存时**不能**把原文的空行排布套回来，
      // 否则用户删掉的空行会被偷偷恢复（"删除会回退"就是这么来的）。
      // 空行还原只在下面那次往返检查里用。
      emit('update:value', normalizeMarkdown(md, baseline, { spacing: false }))
    })
  })

  await crepe.create()

  // 折叠装饰要能跟着目录那边的操作重画
  bindFoldView(viewOf())

  /*
   * 块手柄上的委托：手柄是 Crepe 自己造的 DOM，点它不会走 Vue 的事件，
   * 所以在宿主上捕获一层。第一个按钮是「加号」（加点下面插入新块），
   * 第二个是六点拖拽手柄 —— 单击它弹「转为」菜单，拖动就还给 Crepe 去挪块。
   */
  host.value?.addEventListener('pointerdown', onHandleDown, true)
  host.value?.addEventListener('click', onHandleClick, true)
  host.value?.addEventListener('click', onHeadingClick, true)
  document.addEventListener('pointerdown', onDocDown, true)
  document.addEventListener('keydown', onDocKey)
  window.addEventListener('scroll', onDocScroll, true)

  // 开发期把编辑器和原文快照暴露出来，方便查往返到底差在哪
  if (import.meta.env.DEV) {
    window.__fold = {
      state: () => ({ doc: foldDoc.value, folds: foldState.value }),
      refresh: () => refreshFolds(),
      view: () => viewOf()
    }
    window.__crepe = crepe
    window.__baseline = baseline
    window.__normalize = normalizeMarkdown
    window.__col = {
      parts: colw.tableParts,
      apply: colw.render,
      load: colw.load
    }
  }

  // 报告一次往返结果：解析再序列化之后跟原文差多少，差得多就提醒用户
  // 原样过一遍编辑器再还原，如果回不到原文，说明这篇里有编辑器表达不了的结构
  // （最典型的是表格单元格里的 <br>），这篇就不能自动保存，否则会静默损坏原文
  const roundTrip = normalizeMarkdown(crepe.getMarkdown(), baseline)
  const differs = roundTrip.replace(/\s+$/, '') !== String(baseline).replace(/\s+$/, '')
  // 只有格式写法不同才让富文本继续工作；真正有内容差异时保留源码编辑。
  // 打开文档本身绝不自动改写磁盘内容。
  lossy.value = !props.readonly && differs && !isCosmeticOnly(baseline, roundTrip)
  emit('lossy', lossy.value)
  if (lossy.value) {
    roundTripText.value = roundTrip
    diff.value = diffLines(baseline, roundTrip, 6)
  }

  // 只有真的敲了键盘、粘贴或拖放，才算用户编辑过
  for (const ev of ['keydown', 'paste', 'cut', 'drop', 'beforeinput']) {
    host.value.addEventListener(ev, () => { userTyped = true }, true)
  }

  /*
   * 代码块重画和表格列宽都要跟着 DOM 变动走。
   * 列宽用更短的等待：拖拽时要跟手，mermaid 要等异步渲染，两者节奏不一样。
   */
  observer = new MutationObserver(() => {
    mermaid.schedule()
    colw.schedule()
  })
  observer.observe(host.value, { childList: true, subtree: true, characterData: true })
  mermaid.schedule()

  // 表格列宽：把这篇存过的取回来，再挂上拖拽
  colw.load()
  if (!props.readonly) colw.attach()
})

/* ------------------------------------------------------------------ *
 * 块左侧手柄：单击弹出「转为」菜单
 *
 * 以前改块类型只有两条路：打斜杠菜单（只能在新块上用）、和 ⌘⌥1/2/3 快捷键（得先知道）。
 * 结果就是「已经有的一段正文想改成二级标题/代码块」根本找不到入口。
 * 六点手柄本来就浮在每一块的左边，让它顺手把这件事做了。
 * ------------------------------------------------------------------ */
const menu = ref(null)
let handleDown = null

function viewOf() {
  try {
    return crepe?.editor?.ctx?.get(editorViewCtx) || null
  } catch {
    return null
  }
}

function closeMenu() {
  menu.value = null
}

/** 与加粗等操作共用 Crepe 浮窗，保留其维护的编辑器选区。 */
function openSelectionMenu() {
  const view = viewOf()
  if (!view || props.readonly || lossy.value) return
  if (menu.value) { closeMenu(); return }
  const button = host.value?.querySelector('[data-toolbar-item="block-type"]')
  const rect = button?.getBoundingClientRect()
  if (!rect) return
  const anchor = view.state.selection.$from
  const block = anchor.depth ? view.nodeDOM(anchor.before(anchor.depth)) : null
  const foldInfo = foldInfoOf(block)
  menu.value = {
    x: Math.max(8, Math.min(rect.left, window.innerWidth - 186)),
    y: rect.bottom + 6,
    groups: menuGroups(blockKindOf(view.state), foldInfo),
    foldInfo
  }
}

/** 手柄纵向中心落在哪个顶级块上（手柄永远贴在某一块的左侧） */
function topBlockAtRow(clientY) {
  const pm = host.value?.querySelector('.ProseMirror')
  if (!pm) return null
  for (const child of pm.children) {
    const r = child.getBoundingClientRect()
    if (clientY >= r.top - 3 && clientY <= r.bottom + 3) return child
  }
  return null
}

/** 顶级标题的折叠键：跟目录面板、正文装饰用的是同一套（级别|文字|同名第几个） */
function foldInfoOf(el) {
  if (!el || !/^H[1-6]$/.test(el.tagName)) return null
  const pm = el.parentElement
  if (!pm || !pm.classList.contains('ProseMirror')) return null
  const level = Number(el.tagName.slice(1))
  const next = el.nextElementSibling
  const text = el.textContent.trim()
  let nth = 0
  for (const child of pm.children) {
    if (child === el) break
    if (new RegExp('^H' + level + '$').test(child.tagName) && child.textContent.trim() === text) nth++
  }
  const key = foldKey(level, text, nth)
  const hasSection = !!next && (!/^H[1-6]$/.test(next.tagName) || Number(next.tagName.slice(1)) > level)
  return { key, folded: isFolded(key), foldable: isFoldable(key), hasSection }
}

function menuGroups(cur, foldInfo) {
  const badge = (t) => t
  const groups = [
    {
      label: '转为',
      items: [
        { key: 'paragraph', label: '正文', icon: badge('¶') },
        ...[1, 2, 3, 4, 5, 6].map((n) => ({
          key: 'h' + n,
          label: ['一', '二', '三', '四', '五', '六'][n - 1] + '级标题',
          icon: badge('H' + n)
        }))
      ]
    },
    {
      label: '块',
      items: [
        { key: 'blockquote', label: '引用', icon: badge('❝') },
        { key: 'code_block', label: '代码块', icon: badge('{}') }
      ]
    },
    {
      label: '列表',
      items: [
        { key: 'bullet_list', label: '无序列表', icon: badge('•') },
        { key: 'ordered_list', label: '有序列表', icon: badge('1.') },
        { key: 'task_list', label: '待办列表', icon: badge('☐') }
      ]
    }
  ]
  for (const g of groups) {
    for (const it of g.items) it.active = it.key === cur
  }
  if (foldInfo) {
    groups.push({
      label: '标题类型',
      items: [
        { key: foldInfo.foldable ? 'make_plain' : 'make_foldable',
          label: foldInfo.foldable ? '转为普通标题' : '转为折叠标题',
          icon: badge(foldInfo.foldable ? 'H' : '▾') },
        ...(foldInfo.foldable && foldInfo.hasSection ? [{
          key: foldInfo.folded ? 'unfold' : 'fold',
          label: foldInfo.folded ? '展开这一节' : '收起这一节',
          icon: badge(foldInfo.folded ? '▸' : '▾')
        }] : [])
      ]
    })
  }
  return groups
}

function openBlockMenu(handleEl) {
  const view = viewOf()
  if (!view) return
  const hr = handleEl.getBoundingClientRect()
  const el = topBlockAtRow(hr.top + hr.height / 2)
  if (!el) return
  // 先把光标放进这一块，后面的命令都基于选区
  let pos = 0
  try {
    pos = view.posAtDOM(el, 0)
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1))))
  } catch {
    return
  }
  const foldInfo = foldInfoOf(el)
  const W = 176
  const H = 470
  menu.value = {
    x: Math.max(8, Math.min(hr.right + 10, window.innerWidth - W - 8)),
    y: Math.max(8, Math.min(hr.top, window.innerHeight - H)),
    groups: menuGroups(blockKindOf(view.state), foldInfo),
    el,
    foldInfo
  }
}

function onHandleDown(e) {
  if (props.readonly) return
  const toolbarItem = e.target?.closest?.('[data-toolbar-item]')
  if (toolbarItem && toolbarItem.dataset.toolbarItem !== 'block-type') userTyped = true
  const handle = e.target?.closest?.('.milkdown-block-handle')
  if (!handle) return
  const items = handle.querySelectorAll('.operation-item')
  handleDown = {
    x: e.clientX,
    y: e.clientY,
    // 第二个按钮才是六点拖拽手柄；第一个是「下面插入一块」的加号
    drag: !!e.target.closest('.operation-item') && e.target.closest('.operation-item') === items[1]
  }
}

function onHandleClick(e) {
  if (props.readonly) return
  const handle = e.target?.closest?.('.milkdown-block-handle')
  if (!handle || !handleDown) return
  const moved = Math.abs(e.clientX - handleDown.x) > 5 || Math.abs(e.clientY - handleDown.y) > 5
  const isDrag = handleDown.drag
  handleDown = null
  // 拖过就是在挪块，不弹菜单
  if (!isDrag || moved) return
  e.preventDefault()
  e.stopPropagation()
  openBlockMenu(handle)
}

function onHeadingClick(e) {
  const heading = e.target?.closest?.('.ProseMirror > h1, .ProseMirror > h2, .ProseMirror > h3, .ProseMirror > h4, .ProseMirror > h5, .ProseMirror > h6')
  if (!heading || e.clientX > heading.getBoundingClientRect().left + 22) return
  const info = foldInfoOf(heading)
  if (!info) return
  e.preventDefault()
  e.stopPropagation()
  toggleFold(info.key)
}

function onDocDown(e) {
  if (e.target?.closest?.('.bt-menu, [data-toolbar-item="block-type"]')) return
  if (menu.value) closeMenu()
}

/*
 * 滚动时菜单要跟着走（它用的是固定定位，锚点一动就错位了），所以干脆关掉。
 * 但菜单自己内部滚动（条目多、窗口矮）不能算 —— 那一下会先把菜单关掉，
 * 点下去的坐标就落到正文上了，看起来就是「点了没反应」。
 */
function onDocScroll(e) {
  if (!menu.value) return
  const t = e.target
  if (t && t.nodeType === 1 && t.closest && t.closest('.bt-menu')) return
  closeMenu()
}

function onDocKey(e) {
  if (e.key === 'Escape') closeMenu()
}

async function onMenuPick(kind) {
  const view = viewOf()
  const info = menu.value?.foldInfo
  closeMenu()
  if (!view) return
  if (kind === 'fold' || kind === 'unfold') {
    if (info) toggleFold(info.key)
    return
  }
  if (kind === 'make_foldable' || kind === 'make_plain') {
    if (!info) return
    try {
      await setFoldable(info.key, kind === 'make_foldable')
    } catch (e) {
      window.alert(String(e.message || e))
    }
    return
  }
  userTyped = true
  applyBlockKind(view, kind)
}

function onSourceInput(e) {
  emit('update:value', e.target.value)
}

onBeforeUnmount(async () => {
  host.value?.removeEventListener('pointerdown', onHandleDown, true)
  host.value?.removeEventListener('click', onHandleClick, true)
  host.value?.removeEventListener('click', onHeadingClick, true)
  document.removeEventListener('pointerdown', onDocDown, true)
  document.removeEventListener('keydown', onDocKey)
  window.removeEventListener('scroll', onDocScroll, true)
  observer?.disconnect()
  mermaid.stop()
  colw.detach()
  try {
    await crepe?.destroy()
  } catch {
    /* 卸载时编辑器可能已经拆了，忽略 */
  }
  crepe = null
})
</script>
