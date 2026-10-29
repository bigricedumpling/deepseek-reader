<template>
  <div class="editor-shell">
    <p v-if="uploadError" class="lossy-note ui-font flex items-start gap-2" role="alert">
      <span class="flex-1">图片未保存：{{ uploadError }}</span>
      <button class="lossy-btn" aria-label="关闭图片错误提示" @click="uploadError = ''">×</button>
    </p>
    <p v-if="actionError" class="lossy-note ui-font flex items-start gap-2" role="alert">
      <span class="flex-1">{{ actionError }}</span>
      <button class="lossy-btn" aria-label="关闭错误提示" @click="actionError = ''">×</button>
    </p>
    <div v-if="hasTransientImages" class="lossy-note ui-font" role="alert">
      这篇有 {{ transientImageCount }} 张图片只记录了浏览器临时地址。正文和图片位置仍在，原图需从截图重新选择。
      <details v-if="!readonly" class="mt-2">
        <summary>按原位置逐张替换图片</summary>
        <div v-for="item in transientImages" :key="item.src" class="my-1 flex items-center gap-2">
          <span>第 {{ item.index }} 张，第 {{ item.line }} 行</span>
          <button class="lossy-btn" @click="chooseReplacement(item.src)">选择原图</button>
        </div>
      </details>
      <input ref="replacementInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" @change="replaceImage" />
    </div>
    <textarea
      v-if="lossy && !readonly"
      ref="srcEl"
      class="src-editor"
      aria-label="Markdown 内容"
      :value="value"
      :readonly="readonly"
      spellcheck="false"
      @input="onSourceInput"
    />
    <MarkdownReading v-if="lossy && readonly" :value="value" />
    <div v-show="!lossy" ref="host" class="crepe-host"></div>

    <FormulaEditor v-if="formula" :value="formula.node.attrs.value" @close="formula=null" @save="saveFormula" />
    <RawBlockEditor v-if="rawBlock" :value="rawBlock.node.attrs.value" @close="rawBlock=null" @save="saveRawBlock" />
    <!-- 块左侧那个六点手柄，点一下弹出来的转为菜单 -->
    <Transition name="editor-pop">
      <BlockTypeMenu
        v-if="menu"
        :x="menu.x"
        :y="menu.y"
        :groups="menu.groups"
        @pick="onMenuPick"
      />
    </Transition>
    <IconPicker v-if="calloutPicker" :anchor="calloutPicker.anchor" :save="saveCalloutIcon" @close="calloutPicker=null" />
    <Transition name="editor-pop"><TextStyleMenu v-if="styleMenu" :x="styleMenu.x" :y="styleMenu.y" :color="styleMenu.color" :highlight="styleMenu.highlight" @pick="onStylePick" /></Transition>
    <EditorContextMenu v-if="contextMenu" :x="contextMenu.x" :y="contextMenu.y" :label="contextMenu.kind === 'image' ? '图片操作' : '编辑操作'" :items="contextItems" @select="onContextPick" @close="closeContextMenu(true)" />
    <input ref="imageReplaceInput" type="file" accept="image/*" class="hidden" @change="onImageReplace" />
    <Teleport to="body">
      <Transition name="editor-pop">
        <div v-if="imageTools" class="reader-image-tools" :style="{ left: imageTools.x + 'px', top: imageTools.y + 'px' }" @pointerenter="cancelImageHide" @pointerleave="scheduleImageHide" @mousedown.stop.prevent>
          <button type="button" title="查看大图" aria-label="查看大图" @click="imageAction('preview')"><PhArrowsOutSimple :size="16" /></button>
          <button v-if="!readonly" type="button" title="添加图注" aria-label="添加图注" @click="imageAction('caption')"><PhPencilLine :size="16" /></button>
          <button v-if="!readonly" type="button" title="替换图片" aria-label="替换图片" @click="imageAction('replace')"><PhArrowClockwise :size="16" /></button>
          <button type="button" title="复制图片地址" aria-label="复制图片地址" @click="imageAction('copy')"><PhCopy :size="16" /></button>
          <button type="button" title="下载图片" aria-label="下载图片" @click="imageAction('download')"><PhExport :size="16" /></button>
          <span v-if="!readonly" class="reader-image-tool-sep" />
          <button v-if="!readonly" type="button" class="is-danger" title="删除图片" aria-label="删除图片" @click="imageAction('delete')"><PhTrash :size="16" /></button>
        </div>
      </Transition>
    </Teleport>
    <Teleport to="body">
      <Transition name="editor-pop">
        <div v-if="docLinkCard" class="reader-doc-card" :style="{ left: docLinkCard.x + 'px', top: docLinkCard.y + 'px' }" role="status">
          <component :is="docLinkCard.kind === 'pdf' ? PhFilePdf : docLinkCard.kind === 'h5' ? PhFileHtml : PhFileText" :size="19" class="reader-doc-card-icon" />
          <div class="reader-doc-card-copy">
            <strong>{{ docLinkCard.label }}</strong>
            <small>{{ docLinkCard.path }}</small>
          </div>
        </div>
      </Transition>
    </Teleport>
    <Teleport to="body">
      <div v-if="imagePreview" class="reader-image-lightbox" @click.self="closeImagePreview">
        <button type="button" class="reader-lightbox-close" aria-label="关闭大图" @click="closeImagePreview"><PhX :size="20" /></button>
        <figure>
          <img :src="imagePreview.src" :alt="imagePreview.caption || ''" />
          <figcaption v-if="imagePreview.caption">{{ imagePreview.caption }}</figcaption>
        </figure>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, onMounted, onBeforeUnmount } from 'vue'
import { Crepe } from '@milkdown/crepe'
import { renderMermaidSvg } from '../utils/mermaid'
import { normalizeMarkdown, isCosmeticOnly } from '../utils/markdown-normalize'
import { editorShortcuts, applyBlockKind, blockKindOf, resolveDocHref } from '../utils/editor-shortcuts'
import { editorFold, bindFoldView, refreshFolds } from '../utils/editor-fold'
import { foldKey, isFolded, isFoldable, setFoldable, toggleFold, foldState, foldDoc } from '../utils/toc-fold'
import BlockTypeMenu from './BlockTypeMenu.vue'
import TextStyleMenu from './TextStyleMenu.vue'
import EditorContextMenu from './EditorContextMenu.vue'
import IconPicker from './IconPicker.vue'
import MarkdownReading from './MarkdownReading.vue'
import RawBlockEditor from './RawBlockEditor.vue'
import FormulaEditor from './FormulaEditor.vue'
import { PhArrowsOutSimple, PhArrowClockwise, PhArrowSquareOut, PhClipboard, PhCopy, PhExport, PhFileHtml, PhFilePdf, PhFileText, PhPencilLine, PhScissors, PhSquaresFour, PhTrash, PhX } from '../icons/remix'
import { remixIcons } from '../icons/remix-data'
import { preservedRemark, preservedSchema, editableHtmlSchema, configurePreservedMarkdown } from '../utils/editor-preserved'
import { inlineStyleRemark, textColorMark, highlightMark, underlineMark, configureInlineStyleMarkdown } from '../utils/inline-style'
import { columnsRemark, columnSchema, columnsSchema, columnsDrag } from '../utils/editor-columns'
import { imagePaste } from '../utils/editor-images'
import { richBlockRemark, richBlockSchema, calloutSchema, calloutKeys, calloutValue, richMarkdown } from '../utils/rich-blocks'
import { editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { AllSelection, TextSelection } from '@milkdown/kit/prose/state'
import { API_BASE, assetUrl } from '../utils/api'

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
const emit = defineEmits(['update:value', 'lossy', 'canonize', 'restore', 'pick-doc', 'open-doc', 'rebuild'])

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
const uploadError = ref('')
/** 非图片操作（折叠设置、内容块）失败时的提示，别混进“图片未保存”里 */
const actionError = ref('')
const replacementInput = ref(null)
const newImageInput = ref(null)
const imageReplaceInput = ref(null)
const contextMenu = ref(null)
const contextItems = ref([])
const imageTools = ref(null)
const imagePreview = ref(null)
const docLinkCard = ref(null)
let imageHideTimer = 0
let docCardHideTimer = 0
let imageReplaceTarget = null
let replacementSrc = ''
let newImagePosition = 0
let newImageBaseline = ''
const transientImages = computed(() => {
  const source = String(props.value)
  return [...source.matchAll(/!\[[^\]]*\]\((blob:[^)]+)\)/g)].map((match, index) => ({
    src: match[1], index: index + 1, line: source.slice(0, match.index).split('\n').length
  }))
})
const transientImageCount = computed(() => transientImages.value.length)
const hasTransientImages = computed(() => transientImageCount.value > 0)
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

async function uploadImage(file) {
  uploadError.value = ''
  if (props.readonly || !props.docFile) throw new Error('当前文档不能上传图片')
  if (file.size > 10 * 1024 * 1024) throw new Error('图片超过 10 MB')
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
      reader.onerror = () => reject(new Error('无法读取图片'))
      reader.readAsDataURL(file)
    })
    const res = await fetch(API_BASE + '/api/asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: props.docFile, mime: file.type, data })
    })
    const out = await res.json()
    if (!res.ok || !out.ok) throw new Error(out.error || '服务器未保存图片')
    return out.data.url || '/api/file?path=' + encodeURIComponent(out.data.path) + '&doc=' + encodeURIComponent(props.docFile)
  } catch (error) {
    uploadError.value = error.message || '上传失败'
    throw error
  }
}

function chooseReplacement(src) {
  replacementSrc = src
  if (replacementInput.value) {
    replacementInput.value.value = ''
    replacementInput.value.click()
  }
}

async function replaceImage(event) {
  const file = event.target.files?.[0]
  const oldSrc = replacementSrc
  if (!file || !oldSrc) return
  try {
    const url = await uploadImage(file)
    if (!String(props.value).includes(oldSrc)) throw new Error('图片位置已变化，请重新选择')
    emit('update:value', String(props.value).replace(oldSrc, url))
  } catch (error) {
    uploadError.value = error.message || '替换失败'
  }
}

function chooseNewImage() {
  newImageBaseline = String(props.value)
  newImagePosition = srcEl.value?.selectionStart ?? newImageBaseline.length
  if (newImageInput.value) {
    newImageInput.value.value = ''
    newImageInput.value.click()
  }
}

async function insertNewImage(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const url = await uploadImage(file)
    if (String(props.value) !== newImageBaseline) throw new Error('正文已变化，请重新选择插入位置')
    const label = file.name.replace(/\.[^.]+$/, '').replace(/[\[\]()\r\n]/g, '').slice(0, 80) || '图片'
    const image = `\n![${label}](${url})\n`
    emit('update:value', newImageBaseline.slice(0, newImagePosition) + image + newImageBaseline.slice(newImagePosition))
  } catch (error) {
    uploadError.value = error.message || '插入失败'
  }
}

/* 工具条统一使用 Remix 的同一套线稿图标，避免 Crepe 默认图标混进来后粗细、尺寸不一致。 */
const TOOLBAR_ICONS = {
  bold: 'bold',
  italic: 'italic',
  strikethrough: 'strikethrough',
  code: 'code',
  latex: 'functions',
  link: 'link'
}
const TOOLBAR_LABELS = {
  bold: '加粗',
  italic: '斜体',
  strikethrough: '删除线',
  code: '行内代码',
  latex: '行内公式',
  link: '链接'
}
function toolbarIcon(name) {
  const body = name && remixIcons[name]?.line
  return body ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>` : ''
}

/* 斜杠菜单右侧的快捷键提示。Crepe 自己不带这个位置，渲染后在 DOM 上补一层。 */
const SLASH_SHORTCUTS = {
  '正文': '⌘⌥0',
  '一级标题': '⌘⌥1',
  '二级标题': '⌘⌥2',
  '三级标题': '⌘⌥3',
  '四级标题': '⌘⌥4',
  '五级标题': '⌘⌥5',
  '六级标题': '⌘⌥6',
  '引用': '⌘⇧U',
  '无序列表': '⌘⇧8',
  '有序列表': '⌘⇧7',
  '待办列表': '⌘⇧9',
  '代码块': '⌘⌥C'
}
function decorateSlashMenu() {
  const menu = host.value?.querySelector('.milkdown-slash-menu')
  if (!menu) return
  for (const li of menu.querySelectorAll('.menu-group li')) {
    const label = li.querySelector(':scope > span:not(.milkdown-icon)')?.textContent.trim() || ''
    const shortcut = SLASH_SHORTCUTS[label]
    if (!shortcut) continue
    let kbd = li.querySelector(':scope > .slash-shortcut')
    if (!kbd) {
      kbd = document.createElement('kbd')
      kbd.className = 'slash-shortcut'
      li.appendChild(kbd)
    }
    if (kbd.textContent !== shortcut) kbd.textContent = shortcut
  }
}

onMounted(async () => {
  crepe = new Crepe({
    root: host.value,
    defaultValue: props.value,
    featureConfigs: {
      [Crepe.Feature.ImageBlock]: {
        onUpload: uploadImage,
        proxyDomURL: assetUrl,
        blockCaptionPlaceholderText: '添加图注',
        blockUploadPlaceholderText: '粘贴图片地址',
        blockUploadButton: '上传图片',
        blockConfirmButton: '确定'
      },
      [Crepe.Feature.Toolbar]: {
        buildToolbar: (builder) => {
          const groups = builder.build()
          builder.clear()
          builder.addGroup('reader-style', '文字样式')
            .addItem('reader-style', {
              label: '文字颜色与高光',
              icon: '<span class="text-style-trigger" aria-hidden="true">A<span></span></span>',
              active: () => false,
              onRun: () => openStyleMenu()
            })
            .addItem('reader-underline', {
              label: '下划线',
              icon: toolbarIcon('underline'),
              active: () => selectionHasMark('readerUnderline'),
              onRun: toggleUnderline
            })
          for (const group of groups) {
            const target = builder.addGroup(group.key, group.label)
            for (const item of group.items) {
              const icon = toolbarIcon(TOOLBAR_ICONS[item.key])
              target.addItem(item.key, {
                ...item,
                ...(icon ? { icon } : {}),
                ...(TOOLBAR_LABELS[item.key] ? { label: TOOLBAR_LABELS[item.key] } : {})
              })
            }
          }
        }
      },
      [Crepe.Feature.Placeholder]: {
        text: '打斜杠 / 插入标题、表格、代码块',
        mode: 'block'
      },
      [Crepe.Feature.BlockEdit]: {
        blockHandle: {
          getPlacement: () => 'left',
          getOffset: () => 16,
          getPosition: ({ active }) => {
            // Use the first line box, not the whole block or its top edge.
            const el=active.el, rect=el.getBoundingClientRect()
            const text=el.matches('p,h1,h2,h3,h4,h5,h6,pre')?el:el.querySelector('p,h1,h2,h3,h4,h5,h6,pre')||el
            const style=getComputedStyle(text), textRect=text.getBoundingClientRect()
            const lineHeight=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.5
            const top=textRect.top+(parseFloat(style.paddingTop)||0)
            return {x:rect.left,y:top,left:rect.left,right:rect.right,top,bottom:top+lineHeight,width:rect.width,height:lineHeight}
          }
        },
        /*
         * “插入文档”不单独占一个斜杠 tab，直接并入“插入”组。
         * 插进去的是一条普通的 markdown 链接，点击时由 editor-shortcuts 的
         * "内部链接"分支接住 —— 开成工具内部的标签页，不是浏览器标签页。
         */
        buildMenu: (builder) => {
          builder.getGroup('advanced').addItem('doc-link', {
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
  // 访客（旧只读链接进来的人）是只读的：编辑器层面直接关掉，不靠前端藏按钮
  if (props.readonly) crepe.setReadonly(true)
  crepe.editor.use(editorShortcuts({ docId: props.docId, onOpenDoc: (path) => emit('open-doc', path) }))
  crepe.editor.config(configureInlineStyleMarkdown)
  crepe.editor.config(configurePreservedMarkdown)
  crepe.editor.use(imagePaste(uploadImage,message=>{uploadError.value=message}))
  crepe.editor.use(columnsRemark).use(columnSchema).use(columnsSchema).use(columnsDrag)
  crepe.editor.use(richBlockRemark).use(calloutSchema).use(richBlockSchema).use(calloutKeys)
  crepe.editor.use(inlineStyleRemark).use(textColorMark).use(highlightMark).use(underlineMark)
  crepe.editor.use(preservedRemark).use(preservedSchema).use(editableHtmlSchema)
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
   * 所以在宿主上捕获一层。第一个按钮是加号（加点下面插入新块），
   * 第二个是六点拖拽手柄 —— 单击它弹转为菜单，拖动就还给 Crepe 去挪块。
   */
  host.value?.addEventListener('pointerdown', openFormula, true)
  host.value?.addEventListener('keydown', openFormula, true)
  host.value?.addEventListener('keydown', onHeadingBoundary, true)
  host.value?.addEventListener('pointerdown', onHandleDown, true)
  host.value?.addEventListener('click', onHandleClick, true)
  host.value?.addEventListener('click', onHeadingClick, true)
  document.addEventListener('pointerdown', onDocDown, true)
  document.addEventListener('keydown', onDocKey)
  window.addEventListener('scroll', onDocScroll, true)
  window.addEventListener('reader-insert-block', insertRich)
  window.addEventListener('reader-open-document', openRichDoc)
  window.addEventListener('reader-restore-version', restoreVersion)
  host.value?.addEventListener('dblclick', editRich)
  host.value?.addEventListener('click', openCalloutIcon)
  host.value?.addEventListener('click', openRawBlock)
  host.value?.addEventListener('keydown', onCalloutIconKey, true)
  host.value?.addEventListener('contextmenu', openContextMenu)
  host.value?.addEventListener('pointerover', onEditorPointerOver)
  host.value?.addEventListener('pointerout', onEditorPointerOut)

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
  lossy.value = differs && !isCosmeticOnly(baseline, roundTrip)
  emit('lossy', lossy.value)

  // 只有真的敲了键盘、粘贴或拖放，才算用户编辑过
  for (const ev of ['keydown', 'paste', 'cut', 'drop', 'beforeinput']) {
    host.value.addEventListener(ev, () => { userTyped = true }, true)
  }

  /*
   * 代码块重画和表格列宽都要跟着 DOM 变动走。
   * 列宽用更短的等待：拖拽时要跟手，mermaid 要等异步渲染，两者节奏不一样。
   */
  observer = new MutationObserver(() => {
    decorateFormula()
    decorateSlashMenu()
    mermaid.schedule()
    colw.schedule()
  })
  observer.observe(host.value, { childList: true, subtree: true, characterData: true })
  mermaid.schedule()
  decorateFormula()
  decorateSlashMenu()

  // 表格列宽：把这篇存过的取回来，再挂上拖拽
  colw.load()
  if (!props.readonly) colw.attach()
})

/* ------------------------------------------------------------------ *
 * 块左侧手柄：单击弹出转为菜单
 *
 * 以前改块类型只有两条路：打斜杠菜单（只能在新块上用）、和 ⌘⌥1/2/3 快捷键（得先知道）。
 * 结果就是已经有的一段正文想改成二级标题/代码块根本找不到入口。
 * 六点手柄本来就浮在每一块的左边，让它顺手把这件事做了。
 * ------------------------------------------------------------------ */
const menu = ref(null)
const styleMenu = ref(null)
let handleDown = null

function viewOf() {
  try {
    return crepe?.editor?.ctx?.get(editorViewCtx) || null
  } catch {
    return null
  }
}

function restoreVersion(e){if(!props.readonly&&e.detail.path===props.docFile)emit('restore',e.detail.content)}
function openRichDoc(e){emit('open-doc',e.detail)}
const calloutPicker=shallowRef(null),rawBlock=shallowRef(null),formula=shallowRef(null)
function onHeadingBoundary(event){
 if(props.readonly||event.isComposing||event.shiftKey||event.metaKey||event.ctrlKey||event.altKey||!['Backspace','Enter'].includes(event.key))return
 const view=viewOf();if(!view)return
 const {$from,empty}=view.state.selection
 if(!empty||$from.depth!==1||$from.parent.type.name!=='heading'||$from.parentOffset!==0)return
 const index=$from.index(0),doc=view.state.doc
 let start=index
 while(start>0&&doc.child(start-1).type.name==='paragraph'&&doc.child(start-1).content.size===0)start--
 const title=$from.parent.attrs.level===1&&Array.from({length:start},(_,i)=>doc.child(i)).every(n=>n.type.name==='reader_raw'&&/^(---|\+\+\+)\r?\n/.test(n.attrs.value))
 if(event.key==='Backspace'){
  if(start<index){event.preventDefault();event.stopImmediatePropagation();const from=$from.before()-Array.from({length:index-start},(_,i)=>doc.child(start+i).nodeSize).reduce((a,b)=>a+b,0);userTyped=true;view.dispatch(view.state.tr.delete(from,$from.before()));return}
  if(title){event.preventDefault();event.stopImmediatePropagation()}
 }else if(title){
  event.preventDefault();event.stopImmediatePropagation();const after=$from.after(),tr=view.state.tr.insert(after,view.state.schema.nodes.paragraph.create());tr.setSelection(TextSelection.create(tr.doc,after+1));userTyped=true;view.dispatch(tr);view.focus()
 }
}

function decorateFormula(){if(props.readonly)return;for(const el of host.value?.querySelectorAll('[data-type="math_inline"]')||[]){el.setAttribute('tabindex','0');el.setAttribute('role','button');el.setAttribute('aria-label','编辑公式')}}
function openFormula(e){
 if(props.readonly||(e.type==='keydown'&&e.key!=='Enter'))return
 const el=e.target.closest('[data-type="math_inline"]'),view=viewOf();if(!el||!view)return
 e.preventDefault();e.stopImmediatePropagation()
 view.state.doc.descendants((node,pos)=>{if(node.type.name==='math_inline'&&view.nodeDOM(pos)===el){formula.value={pos,node};return false}})
}
function saveFormula(value){const view=viewOf(),target=formula.value;if(!view||!target||view.state.doc.nodeAt(target.pos)!==target.node)return;userTyped=true;view.dispatch(view.state.tr.setNodeMarkup(target.pos,undefined,{...target.node.attrs,value}));formula.value=null;view.focus()}

function openRawBlock(e){
 if(props.readonly)return
 const raw=e.target.closest('[data-reader-raw]'),view=viewOf()
 if(!raw||!view)return
 if(e.type==='click'&&!e.target.closest('.raw-edit-button'))return
 e.preventDefault();e.stopPropagation()
 view.state.doc.descendants((node,pos)=>{if(node.type.name==='reader_raw'&&view.nodeDOM(pos)===raw){rawBlock.value={pos,node};return false}})
}
function saveRawBlock(value){
 const view=viewOf(),target=rawBlock.value
 if(!view||!target||view.state.doc.nodeAt(target.pos)!==target.node)return
 userTyped=true;view.dispatch(view.state.tr.setNodeMarkup(target.pos,undefined,{value}));rawBlock.value=null
}

function openCalloutIcon(e){
 if(props.readonly||lossy.value)return
 const anchor=e.target.closest('.rich-callout-icon'),el=anchor?.closest('[data-reader-callout], [data-reader-block]'),view=viewOf()
 if(!el||!view)return
 const pos=view.posAtDOM(el,0)-(el.hasAttribute('data-reader-callout')?1:0),node=view.state.doc.nodeAt(pos)
 if(!node||!['reader_callout','reader_block'].includes(node.type.name))return
 e.preventDefault();e.stopPropagation()
 calloutPicker.value={anchor,pos,node,path:props.docFile}
}
function onCalloutIconKey(e){if(e.key==='Enter'&&e.target.matches('[data-reader-raw]')){openRawBlock(e);return}if((e.key==='Enter'||e.key===' ')&&e.target.closest('.rich-callout-icon'))openCalloutIcon(e)}
function saveCalloutIcon(icon){
 const target=calloutPicker.value,view=viewOf()
 if(props.readonly||!view||!target||target.path!==props.docFile)throw Error('文档已切换，请重新选择图标')
 // A shallow reference is used below: never replace a block that changed while the picker was open.
 const node=view.state.doc.nodeAt(target.pos)
 if(node!==target.node)throw Error('提示块已变化，请重新打开图标选择器')
 const raw=node.type.name==='reader_callout'?calloutValue(node,crepe.editor.ctx):node.attrs.value
 const value=JSON.stringify({...JSON.parse(raw),icon})
 userTyped=true;view.dispatch(view.state.tr.setNodeMarkup(target.pos,undefined,{...node.attrs,value}))
}
function editRich(e){
 if(props.readonly)return
 if(e.target.closest('[data-reader-raw]')){openRawBlock(e);return}
 const view=viewOf()
 const el=e.target.closest('[data-reader-block], [data-reader-callout]');if(!el||!view)return
 if(el.hasAttribute('data-reader-callout')||e.target.closest('.rich-callout-icon'))return
 let pos=view.posAtDOM(el,0);if(el.hasAttribute('data-reader-callout'))pos--
 const node=view.state.doc.nodeAt(pos);if(!node||!['reader_block','reader_callout'].includes(node.type.name))return
 const raw=node.type.name==='reader_callout'?calloutValue(node,crepe.editor.ctx):node.attrs.value
 window.dispatchEvent(new CustomEvent('reader-edit-block',{detail:{path:props.docFile,pos,value:JSON.parse(raw),raw:JSON.stringify(JSON.parse(raw))}}))
}
function insertRich(e){
 const view=viewOf(),d=e.detail;if(!view||props.readonly||lossy.value||d.path!==props.docFile)return
 const replacement=crepe.editor.ctx.get(parserCtx)(richMarkdown(d.value)).firstChild
 if(!replacement)return
 let tr=view.state.tr
 if(Number.isInteger(d.pos)){
  const node=tr.doc.nodeAt(d.pos)
  if(!node||!['reader_block','reader_callout'].includes(node.type.name)){actionError.value='该内容已变化，请重新打开';return}
  const raw=node.type.name==='reader_callout'?calloutValue(node,crepe.editor.ctx):node.attrs.value
  if(JSON.stringify(JSON.parse(raw))!==d.previous){actionError.value='该内容已变化，请重新打开';return}
  tr=tr.replaceWith(d.pos,d.pos+node.nodeSize,replacement)
 }else tr=tr.replaceSelectionWith(replacement)
 userTyped=true;view.dispatch(tr.scrollIntoView());view.focus()
}
function closeMenu() {
  menu.value = null
}

function selectionHasMark(name) {
  const view = viewOf()
  const type = view?.state?.schema?.marks?.[name]
  if (!view || !type || view.state.selection.empty) return false
  return view.state.doc.rangeHasMark(view.state.selection.from, view.state.selection.to, type)
}

function selectionTone(name) {
  const view = viewOf()
  const type = view?.state?.schema?.marks?.[name]
  const { from, to } = view?.state?.selection || {}
  if (!view || !type || from === to) return null
  let tone = null
  let seen = false
  view.state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return
    const mark = type.isInSet(node.marks)
    if (!seen) {
      tone = mark?.attrs.tone || null
      seen = true
    } else if ((mark?.attrs.tone || null) !== tone) {
      tone = null
    }
  })
  return tone
}

function toggleUnderline() {
  const view = viewOf()
  if (!view || props.readonly || lossy.value) return
  const { from, to } = view.state.selection
  if (from >= to) return
  const type = view.state.schema.marks.readerUnderline
  if (!type) return
  const had = view.state.doc.rangeHasMark(from, to, type)
  let tr = view.state.tr.removeMark(from, to, type)
  if (!had) tr = tr.addMark(from, to, type.create())
  userTyped = true
  view.dispatch(tr)
  view.focus()
}

function openStyleMenu() {
  const view = viewOf()
  if (!view || view.state.selection.empty || props.readonly || lossy.value) return
  const button = host.value?.querySelector('[data-toolbar-item="reader-style"]')
  const rect = button?.getBoundingClientRect()
  if (!rect) return
  closeMenu()
  styleMenu.value = {
    x: Math.max(8, Math.min(rect.left, window.innerWidth - 268)),
    y: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 210)),
    from: view.state.selection.from,
    to: view.state.selection.to,
    color: selectionTone('readerColor'),
    highlight: selectionTone('readerHighlight')
  }
}

function onStylePick(kind, tone) {
  const view = viewOf()
  const selection = styleMenu.value
  styleMenu.value = null
  if (!view || !selection || props.readonly) return
  const { from, to } = selection
  if (from >= to || to > view.state.doc.content.size) return
  const type = view.state.schema.marks[kind === 'color' ? 'readerColor' : 'readerHighlight']
  if (!type) return
  let tr = view.state.tr.removeMark(from, to, type)
  if (tone) tr = tr.addMark(from, to, type.create({ tone }))
  userTyped = true
  view.dispatch(tr)
  view.focus()
}

/* ------------------------------------------------------------------ *
 * 编辑器右键菜单 / 图片操作 / 文档引用悬停卡
 * ------------------------------------------------------------------ */

function closeContextMenu(focus = false) {
  contextMenu.value = null
  contextItems.value = []
  if (focus) viewOf()?.focus()
}

function imageNodeAt(pos) {
  const view = viewOf()
  if (!view || !Number.isInteger(pos) || pos < 0) return null
  const node = view.state.doc.nodeAt(pos)
  return node?.type?.name === 'image-block' ? node : null
}

function imageAbsolute(src) {
  try { return new URL(String(src || ''), location.origin).href } catch { return String(src || '') }
}

function imageKind(target) {
  const clean = String(target || '').split('?')[0].toLowerCase()
  if (clean.endsWith('.pdf')) return 'pdf'
  if (clean.endsWith('.html') || clean.endsWith('.htm')) return 'h5'
  return 'doc'
}

function imageContextItems() {
  return [
    { id: 'image-preview', label: '查看大图', icon: PhArrowsOutSimple },
    { id: 'image-caption', label: '添加 / 编辑图注', icon: PhPencilLine, disabled: props.readonly },
    { id: 'image-replace', label: '替换图片', icon: PhArrowClockwise, disabled: props.readonly },
    { id: 'image-sep-1', separator: true },
    { id: 'image-copy', label: '复制图片地址', icon: PhCopy },
    { id: 'image-download', label: '下载图片', icon: PhExport },
    { id: 'image-sep-2', separator: true },
    { id: 'image-delete', label: '删除图片', icon: PhTrash, danger: true, disabled: props.readonly }
  ]
}

async function copyPlainText(text) {
  const value = String(text ?? '')
  if (!value) return false
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    /* 权限被拒时退回 execCommand，桌面端通常仍然可用 */
  }
  try {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

function selectionText(view) {
  const { from, to } = view.state.selection
  if (from >= to) return ''
  return view.state.doc.textBetween(from, to, '\n', '\n')
}

function openContextMenu(event) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('input, textarea, .cm-editor')) return
  const view = viewOf()
  if (!view) return

  const imageBlock = target.closest('.milkdown-image-block')
  if (imageBlock) {
    let pos
    try { pos = view.posAtDOM(imageBlock, 0) } catch { pos = null }
    const node = imageNodeAt(pos)
    if (node) {
      event.preventDefault()
      event.stopPropagation()
      closeMenu()
      styleMenu.value = null
      hideImageTools()
      contextMenu.value = { kind: 'image', pos, src: node.attrs.src, caption: node.attrs.caption || '', x: event.clientX, y: event.clientY }
      contextItems.value = imageContextItems()
      return
    }
  }

  if (!target.closest('.ProseMirror')) return
  event.preventDefault()
  event.stopPropagation()
  closeMenu()
  styleMenu.value = null
  hideImageTools()

  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (coords) {
    const { from, to } = view.state.selection
    if (view.state.selection.empty || coords.pos < from || coords.pos > to) {
      const next = TextSelection.near(view.state.doc.resolve(coords.pos))
      view.dispatch(view.state.tr.setSelection(next))
    }
  }

  const anchor = target.closest('a[href]')
  const href = anchor?.getAttribute('href') || ''
  const internal = href ? resolveDocHref(href, props.docFile || props.docId) : ''
  const link = anchor ? { href, internal, label: anchor.textContent.trim() } : null
  const empty = view.state.selection.empty
  const items = [
    { id: 'cut', label: '剪切', icon: PhScissors, shortcut: '⌘X', disabled: empty || props.readonly },
    { id: 'copy', label: '复制', icon: PhCopy, shortcut: '⌘C', disabled: empty },
    { id: 'paste', label: '粘贴', icon: PhClipboard, shortcut: '⌘V', disabled: props.readonly },
    { id: 'sep-1', separator: true },
    { id: 'select-all', label: '全选', icon: PhSquaresFour, shortcut: '⌘A' }
  ]
  if (link) {
    items.push(
      { id: 'sep-link', separator: true },
      { id: 'open-link', label: link.internal ? '打开文档' : '打开链接', icon: link.internal ? PhFileText : PhArrowSquareOut },
      { id: 'copy-link', label: '复制链接地址', icon: PhCopy }
    )
  }
  if (!props.readonly) {
    items.push(
      { id: 'sep-doc', separator: true },
      { id: 'insert-doc', label: '插入文档引用', icon: PhFileText }
    )
  }
  contextMenu.value = { kind: 'text', link, x: event.clientX, y: event.clientY }
  contextItems.value = items
}

async function pasteClipboard(view) {
  if (props.readonly) return
  try {
    const text = await navigator.clipboard.readText()
    if (!text) return
    let tr = view.state.tr.insertText(text)
    if (view.state.schema.marks.link) tr = tr.removeStoredMark(view.state.schema.marks.link)
    userTyped = true
    view.dispatch(tr.scrollIntoView())
    view.focus()
  } catch {
    actionError.value = '浏览器没有允许读取剪贴板，请直接用 ⌘V 粘贴'
  }
}

async function onContextPick(id) {
  const menu = contextMenu.value
  closeContextMenu()
  if (!menu) return
  if (id.startsWith('image-')) {
    await imageAction(id.slice('image-'.length), menu)
    return
  }
  const view = viewOf()
  if (!view) return
  if (id === 'cut' || id === 'copy') {
    const text = selectionText(view)
    if (!text) return
    const ok = await copyPlainText(text)
    if (!ok) {
      actionError.value = '复制失败，请用 ⌘C / ⌘X 重试'
      return
    }
    if (id === 'cut') {
      userTyped = true
      view.dispatch(view.state.tr.deleteSelection().scrollIntoView())
      view.focus()
    } else {
      view.focus()
    }
    return
  }
  if (id === 'paste') return pasteClipboard(view)
  if (id === 'select-all') {
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
    view.focus()
    return
  }
  if (id === 'insert-doc') {
    emit('pick-doc')
    return
  }
  if (!menu.link) return
  if (id === 'open-link') {
    if (menu.link.internal) emit('open-doc', menu.link.internal)
    else if (menu.link.href) window.open(menu.link.href, '_blank', 'noopener')
    return
  }
  if (id === 'copy-link') {
    const value = menu.link.internal ? menu.link.href : imageAbsolute(menu.link.href)
    const ok = await copyPlainText(value)
    if (!ok) actionError.value = '复制链接失败'
  }
}

async function focusImageCaption(pos) {
  const view = viewOf()
  if (!view) return
  let dom = view.nodeDOM(pos)
  if (!dom || dom.nodeType !== 1) dom = view.domAtPos(pos).node
  const block = dom?.nodeType === 1 ? (dom.closest('.milkdown-image-block') || dom) : dom?.parentElement?.closest('.milkdown-image-block')
  if (!block) return
  let input = block.querySelector('.caption-input')
  if (!input) {
    block.querySelector('.image-wrapper .operation .operation-item')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    for (let i = 0; i < 8 && !input; i++) {
      await new Promise((resolve) => setTimeout(resolve, 35))
      input = block.querySelector('.caption-input')
    }
  }
  input?.focus({ preventScroll: true })
  input?.select?.()
  window.setTimeout(() => {
    const fresh = block.querySelector('.caption-input')
    fresh?.focus({ preventScroll: true })
    fresh?.select?.()
  }, 30)
}

function closeImagePreview() {
  imagePreview.value = null
  viewOf()?.focus()
}

function downloadImage(node) {
  const href = imageAbsolute(node.attrs.src)
  const raw = String(node.attrs.caption || '').trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)
  const ext = (String(node.attrs.src || '').split('?')[0].match(/\.(png|jpe?g|webp|gif|svg|avif)$/i) || [])[0] || '.png'
  const name = (raw || 'image') + (/\.[a-z0-9]{2,5}$/i.test(raw || '') ? '' : ext)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function imageAction(action, info) {
  const target = info || imageTools.value
  const view = viewOf()
  const node = imageNodeAt(target?.pos)
  if (!view || !node) {
    actionError.value = '图片位置已变化，请重试'
    return
  }
  hideImageTools()
  if (action === 'preview') {
    imagePreview.value = { src: imageAbsolute(node.attrs.src), caption: node.attrs.caption || '' }
    return
  }
  if (action === 'caption') {
    if (!props.readonly) await focusImageCaption(target.pos)
    return
  }
  if (action === 'replace') {
    if (props.readonly) return
    imageReplaceTarget = { pos: target.pos, src: node.attrs.src }
    if (imageReplaceInput.value) {
      imageReplaceInput.value.value = ''
      imageReplaceInput.value.click()
    }
    return
  }
  if (action === 'copy') {
    const ok = await copyPlainText(imageAbsolute(node.attrs.src))
    if (!ok) actionError.value = '复制图片地址失败'
    return
  }
  if (action === 'download') {
    downloadImage(node)
    return
  }
  if (action === 'delete') {
    if (props.readonly) return
    const tr = view.state.tr.delete(target.pos, target.pos + node.nodeSize)
    userTyped = true
    view.dispatch(tr.scrollIntoView())
    view.focus()
  }
}

async function onImageReplace(event) {
  const file = event.target.files?.[0]
  const target = imageReplaceTarget
  event.target.value = ''
  imageReplaceTarget = null
  if (!file || !target) return
  try {
    const url = await uploadImage(file)
    const view = viewOf()
    const node = imageNodeAt(target.pos)
    if (!view || !node || node.attrs.src !== target.src) throw new Error('图片位置已变化，请重试')
    const tr = view.state.tr.setNodeMarkup(target.pos, undefined, { ...node.attrs, src: url, ratio: 1 })
    userTyped = true
    view.dispatch(tr)
    view.focus()
  } catch (error) {
    actionError.value = error?.message || '替换图片失败'
  }
}

function showImageTools(block) {
  if (!block) return
  const view = viewOf()
  if (!view) return
  let pos
  try { pos = view.posAtDOM(block, 0) } catch { return }
  const node = imageNodeAt(pos)
  if (!node) return
  if (imageTools.value?.pos === pos) return
  const rect = block.getBoundingClientRect()
  const width = props.readonly ? 110 : 210
  imageTools.value = {
    pos,
    src: node.attrs.src,
    caption: node.attrs.caption || '',
    x: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    y: Math.max(8, rect.top + 8)
  }
}

function cancelImageHide() {
  clearTimeout(imageHideTimer)
}
function hideImageTools() {
  clearTimeout(imageHideTimer)
  imageTools.value = null
}
function scheduleImageHide() {
  clearTimeout(imageHideTimer)
  imageHideTimer = window.setTimeout(() => { imageTools.value = null }, 220)
}

function showDocLinkCard(anchor) {
  const target = resolveDocHref(anchor.getAttribute('href') || '', props.docFile || props.docId)
  if (!target) return
  if (docLinkCard.value?.target === target) return
  const rect = anchor.getBoundingClientRect()
  const width = 270, height = 76
  let x = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  let y = rect.bottom + 8
  if (y + height > window.innerHeight - 8) y = Math.max(8, rect.top - height - 8)
  docLinkCard.value = {
    target,
    label: anchor.textContent.trim() || target.split('/').pop()?.replace(/\.(md|pdf|html?)$/i, '') || target,
    path: target.replace(/\.(md|pdf|html?)$/i, ''),
    kind: imageKind(target),
    x,
    y
  }
}
function scheduleDocCardHide() {
  clearTimeout(docCardHideTimer)
  docCardHideTimer = window.setTimeout(() => { docLinkCard.value = null }, 120)
}

function onEditorPointerOver(event) {
  const target = event.target
  if (!(target instanceof Element)) return
  const image = target.closest('.milkdown-image-block')
  if (image) {
    showImageTools(image)
    return
  }
  const anchor = target.closest('.ProseMirror a[href]')
  if (anchor) showDocLinkCard(anchor)
}
function onEditorPointerOut(event) {
  const target = event.target
  if (!(target instanceof Element)) return
  const image = target.closest('.milkdown-image-block')
  if (image && !image.contains(event.relatedTarget)) scheduleImageHide()
  const anchor = target.closest('.ProseMirror a[href]')
  if (anchor && !anchor.contains(event.relatedTarget)) scheduleDocCardHide()
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
  const W = 196
  const H = 400
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
  if (toolbarItem) userTyped = true
  const handle = e.target?.closest?.('.milkdown-block-handle')
  if (!handle) return
  const items = handle.querySelectorAll('.operation-item')
  handleDown = {
    x: e.clientX,
    y: e.clientY,
    // 第二个按钮才是六点拖拽手柄；第一个是下面插入一块的加号
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
  const target = e.target
  if (target?.closest?.('.bt-menu, .text-style-menu, .editor-context-menu, .reader-image-tools, [data-toolbar-item="reader-style"]')) return
  if (menu.value) closeMenu()
  styleMenu.value = null
  closeContextMenu()
  hideImageTools()
  docLinkCard.value = null
}

/*
 * 滚动时菜单要跟着走（它用的是固定定位，锚点一动就错位了），所以干脆关掉。
 * 但菜单自己内部滚动（条目多、窗口矮）不能算 —— 那一下会先把菜单关掉，
 * 点下去的坐标就落到正文上了，看起来就是点了没反应。
 */
function onDocScroll(e) {
  if (e.target?.closest?.('.editor-context-menu')) return
  if (styleMenu.value && !e.target?.closest?.('.text-style-menu')) styleMenu.value = null
  closeContextMenu()
  hideImageTools()
  docLinkCard.value = null
  if (!menu.value) return
  const t = e.target
  if (t && t.nodeType === 1 && t.closest && t.closest('.bt-menu')) return
  closeMenu()
}

function onDocKey(e) {
  if (e.key === 'Escape') {
    const hadMenu = !!menu.value || !!styleMenu.value || !!contextMenu.value || !!imageTools.value || !!imagePreview.value || !!docLinkCard.value
    closeMenu()
    styleMenu.value = null
    closeContextMenu()
    hideImageTools()
    imagePreview.value = null
    docLinkCard.value = null
    if (hadMenu) viewOf()?.focus()
  }
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
    actionError.value = ''
    try {
      await setFoldable(info.key, kind === 'make_foldable')
    } catch (e) {
      actionError.value = String(e.message || e)
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
  window.removeEventListener('reader-insert-block', insertRich)
  window.removeEventListener('reader-open-document', openRichDoc)
  window.removeEventListener('reader-restore-version', restoreVersion)
  host.value?.removeEventListener('dblclick', editRich)
  host.value?.removeEventListener('click', openCalloutIcon)
  host.value?.removeEventListener('click', openRawBlock)
  host.value?.removeEventListener('keydown', onCalloutIconKey, true)
  host.value?.removeEventListener('contextmenu', openContextMenu)
  host.value?.removeEventListener('pointerover', onEditorPointerOver)
  host.value?.removeEventListener('pointerout', onEditorPointerOut)
  clearTimeout(imageHideTimer)
  clearTimeout(docCardHideTimer)
  host.value?.removeEventListener('pointerdown', openFormula, true)
  host.value?.removeEventListener('keydown', openFormula, true)
  host.value?.removeEventListener('keydown', onHeadingBoundary, true)
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

<style scoped>.source-mode-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.source-mode-bar>span{flex:1;min-width:0;font-size:12px}.source-mode-bar button{white-space:nowrap}</style>

<style scoped>.source-mode-note{max-width:var(--measure,960px);margin:12px auto 0;padding:8px 14px;color:var(--c-sub);font-size:12px}.source-mode-note .lossy-btn{background:var(--c-field);border:0;color:var(--c-sub)}.source-mode-note .lossy-btn:hover{background:var(--c-hover)}.source-mode-note .source-mode-bar{gap:8px;justify-content:flex-end}.source-mode-note .source-mode-bar>span{margin-right:auto}</style>
