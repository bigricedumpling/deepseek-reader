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
        <button class="lossy-btn is-primary" @click="emit('canonize', roundTripText)">
          按编辑器规范重排这篇
        </button>
        <span class="lossy-hint">重排 = 接受上面列出的差异（会改写磁盘上的这份文件），之后这篇就能富文本编辑</span>
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Crepe } from '@milkdown/crepe'
import { renderMermaidSvg } from '../utils/mermaid'
import { normalizeMarkdown, diffLines } from '../utils/markdown-normalize'
import { editorShortcuts } from '../utils/editor-shortcuts'

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
          // 四级以下没人用，留着只会把菜单拉长
          h4: null,
          h5: null,
          h6: null,
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

  // 开发期把编辑器和原文快照暴露出来，方便查往返到底差在哪
  if (import.meta.env.DEV) {
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
  /*
   * 只读模式不降级。
   *
   * 降级成源码编辑的用意是「防止自动保存把原文静默改写」—— 但那是个写回风险，
   * 只读访客根本不会写回，所以这个风险不存在，降级只剩副作用：
   * 审阅人打开一篇结构稍复杂的文档，看到的是一屏 markdown 原文而不是排版好的页面。
   * 那正是他最不该看到的东西。
   */
  lossy.value = props.readonly ? false : differs
  emit('lossy', lossy.value)
  if (lossy.value) {
    // 把差异算出来：光说"表达不了"没法让用户决策，得让他看见是哪一行、差在哪
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
  colw.attach()
})

function onSourceInput(e) {
  emit('update:value', e.target.value)
}

onBeforeUnmount(async () => {
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


