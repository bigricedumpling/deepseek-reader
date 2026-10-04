/**
 * 编辑器快捷键。
 *
 * Crepe 自带的是 markdown 那一套（⌘B 加粗、⌘I 斜体、⌘E 行内代码…），
 * 但"改这一行是什么块"和"整块挪位置"没有快捷键，只能去够块手柄或者打斜杠菜单 ——
 * 一天要改十几次格式的时候，这两步很烦。这里按主流编辑器的习惯补上：
 *
 *   ⌘⌥1 / 2 / 3 / 0   一级 / 二级 / 三级标题 / 正文
 *   ⌘⇧7 / 8 / 9        有序列表 / 无序列表 / 待办列表（跟 Notion 一致）
 *   ⌘⇧U               引用
 *   ⌥↑ / ⌥↓            整块上移 / 下移
 *   Tab / ⇧Tab         列表里缩进 / 反缩进（不在列表里时让给浏览器）
 *   ⌘Enter             勾选 / 取消勾选待办项
 *   ⌘点击链接           在新标签打开（编辑器里直接点链接是跳不走的）
 *
 * 只处理认得的键，其余一律返回 false，不抢浏览器和系统快捷键。
 */
/*
 * 热更新只能替换模块，**不会重建已经挂在页面上的编辑器实例** ——
 * 所以改了这个文件（或它依赖的编辑器代码）之后，页面看上去毫无变化，
 * 很容易误判成"改了没用"。这里直接接管：文件一变就整页刷新。
 */
if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload())
}

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import { lift, wrapIn } from '@milkdown/kit/prose/commands'
import { wrapInList, liftListItem, sinkListItem } from '@milkdown/kit/prose/schema-list'

/* ------------------------------------------------------------------ *
 * 改这一块是什么块（菜单里的转为和快捷键共用）
 *
 * 之前只有段落 ⇄ 标题这一种走 setBlockType，标题级别压根没传，
 * 于是不管按 ⌘⌥2 还是 ⌘⌥3 都落到 heading 的默认级别（1）——
 * 现象就是h1 改不成 h2。这里把级别、代码块、列表、引用一起补齐。
 * ------------------------------------------------------------------ */

/** 能整块改类型的块：普通文本块，外加代码块（它的内容也是纯文本） */
function isBlockLike(node) {
  return !!node && (node.isTextblock || node.type.name === 'code_block')
}

/** 光标外面还套着引用吗 */
function inQuote(state) {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'blockquote') return true
  }
  return false
}

/** 菜单里那几个标题 / 正文 / 代码块的目标类型与属性 */
function targetOf(schema, kind) {
  if (kind === 'paragraph') return { type: schema.nodes.paragraph, attrs: null }
  if (kind === 'code_block') return { type: schema.nodes.code_block, attrs: { language: '' } }
  if (/^h[1-6]$/.test(kind)) {
    return { type: schema.nodes.heading, attrs: { level: Number(kind.slice(1)) } }
  }
  return null
}

const LIST_KINDS = ['bullet_list', 'ordered_list', 'task_list']

/**
 * 当前这一块是哪一块。
 *
 * 两种选区都要认：普通光标（$from 往上找），以及整块选中（NodeSelection）——
 * 代码块、表格、图片被点选时是后者，selection.$from.depth 是 0，只按光标找会一个都找不到，
 * 于是再按一次 ⌘⌥C 变回正文就没反应了。
 */
function blockAnchor(state) {
  const sel = state.selection
  if (sel.node) return { node: sel.node, start: sel.from }
  const $from = sel.$from
  let depth = $from.depth
  while (depth > 0 && !isBlockLike($from.node(depth))) depth--
  if (!depth) return null
  return { node: $from.node(depth), start: $from.before(depth) }
}

/** 光标（或选中的块）现在是什么（给菜单打勾、给快捷键判断用） */
export function blockKindOf(state) {
  const sel = state.selection
  if (sel.node) {
    const node = sel.node
    if (node.type.name === 'heading') return 'h' + node.attrs.level
    return node.type.name
  }
  const { $from } = sel
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    const name = node.type.name
    if (name === 'blockquote') return 'blockquote'
    if (name === 'bullet_list' || name === 'ordered_list') {
      const item = d + 1 <= $from.depth ? $from.node(d + 1) : null
      const task = name === 'bullet_list' && item && typeof item.attrs.checked === 'boolean'
      return task ? 'task_list' : name
    }
  }
  const anchor = blockAnchor(state)
  if (!anchor) return ''
  const node = anchor.node
  if (node.type.name === 'heading') return 'h' + node.attrs.level
  return isBlockLike(node) ? node.type.name : ''
}

/** 把光标所在的那一块换成另一种块 */
export function turnInto(kind) {
  return (state, dispatch) => {
    const target = targetOf(state.schema, kind)
    if (!target || !target.type) return false
    const anchor = blockAnchor(state)
    if (!anchor) return false
    const node = anchor.node
    const start = anchor.start
    const attrs = target.attrs
    if (node.type === target.type) {
      if (!attrs) return false
      if (kind === 'code_block') return false
      if (node.attrs.level === attrs.level) return false
    }

    let tr = state.tr
    if (node.isTextblock && node.type.name !== 'code_block') {
      tr = tr.setBlockType(start + 1, start + node.content.size + 1, target.type, attrs)
    } else {
      // 代码块（或别的非文本块）→ 文本块：把原内容原样搬过去，内容模型不合就别硬转
      if (!target.type.validContent(node.content)) return false
      tr = tr.replaceWith(start, start + node.nodeSize, target.type.create(attrs, node.content, []))
    }
    // 代码块里不能带加粗/链接这些标记，转过去的时候一并洗掉
    if (kind === 'code_block') tr = tr.removeMark(start + 1, start + node.nodeSize - 1)
    if (dispatch) dispatch(tr.scrollIntoView())
    return true
  }
}

/** 在列表里往上抬一层（抬到顶层为止） */
function liftOutOfList(view) {
  let guard = 0
  while (inList(view.state) && guard++ < 8) {
    const item = view.state.schema.nodes.list_item
    if (!item) return
    if (!liftListItem(item)(view.state, view.dispatch, view)) return
  }
}

/**
 * 菜单里点一个类型：引用/列表里先抬到顶层，再改。
 * 不抬的话，把列表项改成二级标题改出来的标题还套在列表项里，看起来像没生效。
 */
export function applyBlockKind(view, kind) {
  if (!view) return false
  view.focus()
  if (LIST_KINDS.includes(kind)) {
    if (inList(view.state) && blockKindOf(view.state) !== kind) liftOutOfList(view)
    const name = kind === 'ordered_list' ? 'ordered_list' : 'bullet_list'
    return toggleList(name, { task: kind === 'task_list' })(view.state, view.dispatch, view)
  }
  liftOutOfList(view)
  if (kind !== 'blockquote' && inQuote(view.state)) lift(view.state, view.dispatch, view)
  if (kind === 'blockquote') return wrapQuote(view)
  return turnInto(kind)(view.state, view.dispatch, view)
}

/** 段落 ⇄ 引用 */
function wrapQuote(view) {
  const quote = view.state.schema.nodes.blockquote
  if (!quote) return false
  if (inQuote(view.state)) {
    lift(view.state, view.dispatch, view)
    return true
  }
  return wrapIn(quote)(view.state, view.dispatch, view)
}

/** 光标是不是已经在某种列表里 */
function inList(state) {
  const { list_item: item } = state.schema.nodes
  if (!item) return false
  const $from = state.selection.$from
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === item) return true
  return false
}

/** 列表开关：已经在同种列表里就退出来，否则包一层 */
function toggleList(name, { task = false } = {}) {
  return (state, dispatch, view) => {
    const listType = state.schema.nodes[name]
    const itemType = state.schema.nodes.list_item
    if (!listType || !itemType) return false

    const $from = state.selection.$from
    let already = false
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type === listType) already = true
    }
    if (already) {
      // 已经在里面了：把这一项抬出去，等于关掉列表
      return liftListItem(itemType)(state, dispatch, view)
    }
    if (inList(state)) return false

    return wrapInList(listType)(state, (tr) => {
      if (task) {
        tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
          if (node.type === itemType) tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: false })
        })
      }
      if (dispatch) dispatch(tr)
    }, view)
  }
}

/**
 * 整块上移 / 下移。
 *
 * 直接按顶层子节点重新拼一份文档：比在 tr 里算删除/插入的偏移稳，
 * 表格、代码块这种大块也能整块挪。
 */
function moveBlock(dir) {
  return (state, dispatch) => {
    const { doc, selection } = state
    const from = selection.$from
    if (from.depth < 1) return false
    const index = from.index(0)
    const target = index + dir
    if (target < 0 || target >= doc.childCount) return false
    if (dispatch) {
      const children = []
      doc.forEach((n) => children.push(n))
      const [node] = children.splice(index, 1)
      children.splice(target, 0, node)
      const tr = state.tr.replaceWith(0, doc.content.size, doc.type.create(null, children).content)
      let pos = 0
      for (let i = 0; i < target; i++) pos += children[i].nodeSize
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size)), 1))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/**
 * 行首退格：把标题降级成正文，而不是并进上一块。
 *
 * 默认是 joinBackward：光标在行首按退格会把这一行并到上一块里，
 * 并完之后整行继承上一块的类型 —— 一个三级标题并进上面的二级标题，
 * 看起来就是"标题回退成上一级标题"，想删掉标题反而删不掉。
 * 这里改成主流编辑器的两段式：先降级成正文，再按一次才并上去。
 */
function demoteInsteadOfJoin() {
  return (state, dispatch) => {
    const { selection, schema } = state
    if (!selection.empty) return false
    const $from = selection.$from
    if ($from.parentOffset !== 0 || $from.depth !== 1) return false
    if (!$from.parent.type.name.startsWith('heading')) return false
    const para = schema.nodes.paragraph
    const range = $from.blockRange()
    if (!para || !range) return false
    if (dispatch) dispatch(state.tr.setBlockType(range.start, range.end, para))
    return true
  }
}

/**
 * 表格/代码块旁边的空段落，退格应该删掉它本身。
 *
 * 默认是 selectNodeBackward：光标在这个空段落里按退格，会把上面那个块（表格）整块选中，
 * 看着就像"删不掉空行、反而选中了表格"。只在旁边是非文本块时接管，
 * 两个段落之间的空行仍旧走默认的合并。
 */
function deleteEmptyBlock() {
  return (state, dispatch) => {
    const { selection } = state
    if (!selection.empty) return false
    const $from = selection.$from
    if ($from.depth !== 1) return false
    if ($from.parent.type.name !== 'paragraph' || $from.parent.content.size !== 0) return false
    const index = $from.index(0)
    const doc = state.doc
    const prev = index > 0 ? doc.child(index - 1) : null
    const next = index < doc.childCount - 1 ? doc.child(index + 1) : null
    const solid = (n) => !!n && !n.isTextblock
    if (!solid(prev) && !solid(next)) return false
    if (dispatch) {
      const from = $from.before(1)
      const to = $from.after(1)
      const tr = state.tr.delete(from, to)
      /*
       * 光删掉还不够：连着的邻居是表格时，ProseMirror 会把被删位置上的选区映射到那个表格上，
       * 于是删完还是"表格被整块选中"（用户看到的现象依旧）。这里明确把光标放到一个文本块里：
       * 优先前面那个文本块的末尾，其次后面那个文本块的开头。
       */
      const land = landSpot(doc, index, from, to - from)
      if (land) {
        const at = Math.max(1, Math.min(land.pos, tr.doc.content.size))
        try {
          tr.setSelection(TextSelection.near(tr.doc.resolve(at), land.bias))
        } catch {
          /* 位置算不出来就保持默认落点 */
        }
      }
      dispatch(tr)
    }
    return true
  }
}

/**
 * 删掉一个块之后，光标该落在哪。
 *
 * 只盯着紧挨着的左右两块是不够的：表格、分割线（***）都不是文本块，
 * 而"表格 + 空行 + 分割线"这种组合很常见 —— 两边落不下，ProseMirror 就会把光标映射到表格上，
 * 于是删掉空行之后**表格被整块选中**，用户看到的现象和"没删掉"几乎一样。
 * 所以这里往两边继续找最近的文本块，优先往后（离原来位置近），找不到再往前。
 */
function landSpot(doc, index, from, deletedSize) {
  let pos = from
  for (let i = index + 1; i < doc.childCount; i++) {
    const node = doc.child(i)
    if (node.isTextblock) return { pos: pos - deletedSize + 1, bias: 1 }
    pos += node.nodeSize
  }
  pos = from
  for (let i = index - 1; i >= 0; i--) {
    const node = doc.child(i)
    if (node.isTextblock) return { pos: pos - 1, bias: -1 }
    pos -= node.nodeSize
  }
  return null
}

/* 当前编辑器实例：插入链接要用它 */
let activeView = null

/** 从 fromDoc 所在目录算到 target 的相对路径（都在抽屉根下） */
function relativePath(fromDoc, target) {
  const a = String(fromDoc || '').split('/').slice(0, -1)
  const b = String(target || '').split('/')
  let i = 0
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++
  const up = a.slice(i).map(() => '..')
  return up.concat(b.slice(i)).join('/')
}

/** 把正文里的相对链接解析成抽屉里的路径（点了要开哪一篇） */
export function resolveDocHref(href, fromDoc) {
  const raw = String(href || '').split('#')[0]
  if (!raw || /^[a-z]+:/i.test(raw) || raw.startsWith('/')) return ''
  if (!/\.(md|pdf|html?)$/i.test(raw)) return ''
  let decoded
  try { decoded = decodeURIComponent(raw) } catch { return '' }
  const parts = String(fromDoc || '').split('/').slice(0, -1)
  for (const seg of decoded.split('/')) {
    if (seg === '.' || seg === '') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

/**
 * 在光标处插入一条指向当前抽屉其他文档的链接。
 *
 * 存成普通的 markdown 链接 —— 正文里不留私货，换任何编辑器打开都还是人话；
 * 点击的行为由下面的"内部链接"分支负责：开工具内部的标签页，不是浏览器标签页。
 */
export function insertDocLink(name, relPath, fromDoc) {
  if (!activeView) return false
  try {
    const view = activeView
    const schema = view.state.schema
    const link = schema.marks.link
    if (!link) return false
    const href = relativePath(fromDoc, relPath)
    const { from, to } = view.state.selection
    /*
     * 用"文字 + link 标记"插，不要 insertText('[](…)')。
     * 编辑器不会把插进去的纯文本再当 markdown 解析一遍 —— 那样插出来是一串死字符，
     * 既不成链接、点了也不会跳。
     */
    /*
     * 斜杠菜单的触发字符要自己删：内置项会删掉"/"，自定义项不会 ——
     * 不删的话插完正文里就留下一个 "/"（还有你可能已经打了一半的搜索词）。
     */
    const $from = view.state.selection.$from
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
    const slash = before.match(/\/[^\s/]*$/)
    const start = slash ? $from.pos - slash[0].length : from
    const tr = slash ? view.state.tr.delete(start, from) : view.state.tr
    const at = tr.mapping.map(from)
    const tip = tr.mapping.map(to)
    tr.insertText(name, at, tip)
    tr.addMark(at, at + name.length, link.create({ href }))
    view.dispatch(tr.scrollIntoView())
    view.focus()
    return true
  } catch {
    return false
  }
}

/* ⌘⌥1…6 / ⌘⌥0：一到六级标题 / 正文；⌘⌥C：代码块 */
const TITLES = { 0: 'paragraph', 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4', 5: 'h5', 6: 'h6' }

export function editorShortcuts(props = {}) {
  return $prose(
    () =>
      new Plugin({
        key: new PluginKey('reader-shortcuts'),
        props: {
          handleKeyDown(view, event) {
            const mod = event.metaKey || event.ctrlKey
            const key = event.key
            const state = view.state
            const run = (cmd) => {
              if (!cmd(state, view.dispatch, view)) return false
              event.preventDefault()
              return true
            }

            // 改块类型：⌘⌥1…6 / ⌘⌥0（改的是光标所在的这一块）
            if (mod && event.altKey && TITLES[key]) {
              event.preventDefault()
              return applyBlockKind(view, TITLES[key])
            }
            // ⌘⌥C：正文 / 标题 → 代码块（再按一次收回正文）
            if (mod && event.altKey && key.toLowerCase() === 'c') {
              event.preventDefault()
              const back = blockKindOf(state) === 'code_block'
              return applyBlockKind(view, back ? 'paragraph' : 'code_block')
            }
            // 列表 / 待办 / 引用
            if (mod && event.shiftKey && !event.altKey) {
              if (key === '7') return run(toggleList('ordered_list'))
              if (key === '8') return run(toggleList('bullet_list'))
              if (key === '9') return run(toggleList('bullet_list', { task: true }))
              if (key.toLowerCase() === 'u') return run(toggleList('blockquote'))
            }
            // 整块上移 / 下移
            if (event.altKey && !mod && (key === 'ArrowUp' || key === 'ArrowDown')) {
              return run(moveBlock(key === 'ArrowUp' ? -1 : 1))
            }
            // 列表里 Tab / ⇧Tab 缩进（不在列表里不动，让浏览器接管）
            if (key === 'Tab' && !mod && !event.altKey && inList(state)) {
              const item = state.schema.nodes.list_item
              if (!item) return false
              run(event.shiftKey ? liftListItem(item) : sinkListItem(item))
              // 不管缩进成没成，列表里的 Tab 都不能掉进正文变成一个制表符
              event.preventDefault()
              return true
            }
            // ⌘Enter：待办项打勾（普通列表项不动）
            if (mod && key === 'Enter') {
              return run(toggleTodo())
            }
            /*
             * 退格 / 删除，两件事依次试：
             *
             *   1. 表格、代码块旁边的空段落：默认会把上面那个块整块选中（看着像"删不掉、还选中了表格"），
             *      这里改成直接删掉这个空段落 —— markdown 里表格前后的空行序列化时会自己补回来。
             *   2. 标题行首：默认会把它并进上一块，并完继承上一块的类型，一个三级标题并进二级标题
             *      看起来就是"回退成上一级标题"。改成先降级成正文，再按一次才并上去。
             *
             * ⚠️ 这里**不能写成 return run(第一条)**：那样第二条永远轮不到（踩过这个坑，
             *    表现就是"表格下面的空行怎么都删不掉"，而旁边的标题行为却是好的）。
             */
            if ((key === 'Backspace' || key === 'Delete') && !mod && !event.altKey) {
              if (run(deleteEmptyBlock())) return true
              if (key === 'Backspace' && run(demoteInsteadOfJoin())) return true
            }
            return false
          },


        },
        /*
         * 点表格单元格：Milkdown 的 table-block 会在 mousedown 之后把整格内容做成 NodeSelection，
         * 于是"点一下想改一个字"会先看到整格被选中。
         *
         * 上一版是等它选完再用 setTimeout 撤销 —— 中间隔了一次绘制，所以会**闪一下**（用户原话：
         * "明显先是文本全被选中了 然后再被取消选中"）。那是个不好的做法。
         *
         * 现在改成抢在它前面把光标放好。可行的依据在它自己的代码里：
         *   if (state.selection instanceof TextSelection) { ...同一个格子... return false }
         * 也就是"当前选区已经是在这个格子里的文字选区，它就放手不管"。
         * 而它的处理挂在**冒泡**阶段（NodeView 的 stopEvent），我们挂在**捕获**阶段，
         * 同一个元素上捕获先于冒泡 —— 所以我们一定先跑，它随后就什么都不做。
         * 结果：没有"先选中再撤销"，也就没有闪；拖拽选文字、双击选词照旧。
         */
        view(editorView) {
          activeView = editorView
          /*
           * 链接：编辑器里点一下应该是"打开网页"，而不是"把光标塞进链接文字里"
           * （要改文字用方向键移进去）。ProseMirror 的 handleClickOn 走不到这里的 a 元素，
           * 所以在 DOM 层用捕获阶段拦。只拦 http/https/mailto 这类能打开的地址 ——
           * 文档之间的相对链接交给默认行为，不然点了会跳到一个 404 的标签页。
           */
          const onClick = (e) => {
            const a = e.target && e.target.closest && e.target.closest('a[href]')
            if (!a) return
            const href = a.getAttribute('href') || ''
            if (/^(https?:|mailto:)/i.test(href)) {
              e.preventDefault()
              e.stopPropagation()
              window.open(href, '_blank', 'noopener')
              return
            }
            // 指向当前抽屉其他文档的链接：开成工具内部的标签页（不是浏览器标签页）
            const target = resolveDocHref(href, props.docId)
            if (!target) return
            e.preventDefault()
            e.stopPropagation()
            if (typeof props.onOpenDoc === 'function') props.onOpenDoc(target)
          }
          editorView.dom.addEventListener('click', onClick, true)

          const onDown = (e) => {
            if (e.button !== 0 || e.detail > 1) return
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            if (!(e.target.closest && e.target.closest('td, th'))) return
            const at = editorView.posAtCoords({ left: e.clientX, top: e.clientY })
            if (!at) return
            try {
              const { state } = editorView
              const $at = state.doc.resolve(at.pos)
              let inCell = false
              for (let d = $at.depth; d > 0; d--) {
                const n = $at.node(d)
                if (n.type.name === 'table_cell' || n.type.name === 'table_header') {
                  inCell = true
                  break
                }
              }
              if (!inCell) return
              // 已经是在这一格里的文字选区（且是光标），就不必动
              const sel = state.selection
              if (sel instanceof TextSelection && sel.empty && sel.$from.parent === $at.parent) return
              editorView.dispatch(state.tr.setSelection(TextSelection.create(state.doc, at.pos)))
            } catch {
              /* 位置落在节点边界上就交给默认行为 */
            }
          }
          editorView.dom.addEventListener('mousedown', onDown, true)
          return {
            destroy() {
              if (activeView === editorView) activeView = null
              editorView.dom.removeEventListener('mousedown', onDown, true)
              editorView.dom.removeEventListener('click', onClick, true)
            }
          }
        }
      })
  )
}

/** 待办项打勾 / 取消：只有 checked 不是 null 的列表项才是待办 */
function toggleTodo() {
  return (state, dispatch) => {
    const item = state.schema.nodes.list_item
    if (!item) return false
    const $from = state.selection.$from
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d)
      if (node.type !== item) continue
      const checked = node.attrs.checked
      if (checked === null || checked === undefined) return false
      if (dispatch) {
        dispatch(state.tr.setNodeMarkup($from.before(d), undefined, { ...node.attrs, checked: !checked }))
      }
      return true
    }
    return false
  }
}
