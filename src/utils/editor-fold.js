/**
 * 正文里的标题折叠。
 *
 * 右侧目录早就能收，正文不能 —— 一篇长文想只看某一节，只能靠滚。
 * 这里把收起来的那一节在正文里也隐掉，但只用 ProseMirror 的装饰（Decoration）：
 * 文档本身一个字不改，markdown 往返、自动保存、分享出去的只读页全都不受影响。
 *
 * 折叠键跟目录面板共用一套（toc-fold.js 的「级别|标题|同名第几个」），
 * 所以「在目录里收起来的节」和「在正文里收起来的节」是同一件事，两处联动。
 */
import { watch } from 'vue'
import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { foldKey, foldedKeys, foldState, foldDoc, foldableKeys, foldableState } from './toc-fold.js'

export const editorFoldKey = new PluginKey('reader-editor-fold')

/** 顶级块的「是不是标题 / 级别 / 折叠键」，顺序即文档顺序 */
function sections(doc) {
  const seen = {}
  const out = []
  doc.forEach((node, offset) => {
    let level = 0
    let key = null
    if (node.type.name === 'heading') {
      level = node.attrs.level
      const text = node.textContent.trim()
      const bucket = level + '|' + text
      seen[bucket] = (seen[bucket] || 0) + 1
      key = foldKey(level, text, seen[bucket] - 1)
    }
    out.push({ node, offset, level, key })
  })
  return out
}

/** 收着的标题后面、级别不高于它的那些块，全盖上「隐藏」这枚装饰 */
export function buildDeco(doc) {
  const folded = foldedKeys()
  const foldable = foldableKeys()
  const rules = []
  const foldedLevels = []
  const blocks = sections(doc)
  for (let i = 0; i < blocks.length; i++) {
    const s = blocks[i]
    const classes = []
    if (s.level) {
      while (foldedLevels.length && s.level <= foldedLevels[foldedLevels.length - 1]) foldedLevels.pop()
    }
    if (foldedLevels.length) classes.push('reader-folded')
    if (s.level) {
      const next = blocks[i + 1]
      if (s.key && foldable[s.key] && next && (!next.level || next.level > s.level)) {
        classes.push('reader-foldable-head')
        if (s.key && folded[s.key]) {
          classes.push('is-folded-head')
          foldedLevels.push(s.level)
        }
      }
    }
    if (classes.length) rules.push(Decoration.node(s.offset, s.offset + s.node.nodeSize, { class: classes.join(' ') }))
  }
  return DecorationSet.create(doc, rules)
}

export function editorFold() {
  return $prose(
    () =>
      new Plugin({
        key: editorFoldKey,
        state: {
          init: (_cfg, state) => buildDeco(state.doc),
          apply: (tr, old) =>
            tr.docChanged || tr.getMeta(editorFoldKey)
              ? buildDeco(tr.doc)
              : old.map(tr.mapping, tr.doc)
        },
        props: {
          decorations: (state) => editorFoldKey.getState(state)
        }
      })
  )
}

/** 当前挂在页面上的编辑器 view：目录那边收了节，这边要跟着重画 */
let liveView = null

export function bindFoldView(view) {
  liveView = view
}

/** 折叠状态变了（不管是正文里点的还是目录里点的）→ 重算一次装饰 */
export function refreshFolds(view = liveView) {
  if (!view) return
  try {
    view.dispatch(view.state.tr.setMeta(editorFoldKey, 'refresh'))
  } catch {
    /* view 已经销毁 */
  }
}

watch([foldState, foldableState, foldDoc], () => refreshFolds())
