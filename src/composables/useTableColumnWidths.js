import { API_BASE } from '../utils/api'
/**
 * 表格列宽拖拽。
 *
 * 为什么不用 prosemirror-tables 的 columnResizing：
 * 那个插件靠自带的 TableView 渲染 colgroup 和拖拽把手，而 Crepe 的 table-block
 * 用的是它自己的节点视图，把 TableView 整个绕开了 —— 插件挂上去确实会生成把手，
 * 但表格里没有 colgroup，列宽无从落地，拖完纹丝不动。
 *
 * 所以改在能控制的这一层做：不动 ProseMirror 文档一个字，靠一条注入 head 的样式表
 * 来落地。不能往单元格上写 inline width，Crepe 的 table-block 是个 Vue 组件，
 * 它按自己的响应式状态重渲染，会把外部写的行内样式整片擦掉；样式表不归它管，擦不掉。
 *
 * 持久化走服务端的旁路文件（跟文档同级），不塞进 markdown：
 * markdown 的表格语法没有列宽这个概念，硬塞只能靠 HTML 或注释污染正文。
 */

/** 每一列最窄留这么多，不然一拖就没了 */
const MIN_COL = 48
/**
 * 离列边界多近才算抓住。
 *
 * 表格只画横线、列与列之间没有可见竖线，光标在看不见的地方变会让人莫名其妙，
 * 所以收得很紧。窄列还会按比例再收（见 columnAt），
 * 不然年份那种 60px 宽的列，边界两侧各 6px 就吃掉整列五分之一，扫过去几乎必中。
 */
const GRAB = 5
const STYLE_ID = 'kb-col-widths'

export function useTableColumnWidths({ host, docId, docFile }) {
  /** colWidths[第几张表] = [每列宽度] */
  let colWidths = []
  let drag = null
  let guide = null
  let timer = null

  /** 拉这一篇存过的列宽 */
  async function load() {
    colWidths = []
    if (!docFile.value) return
    try {
      const r = await fetch(API_BASE + '/api/colw?file=' + encodeURIComponent(docFile.value))
      const j = await r.json()
      if (j.ok && Array.isArray(j.data)) colWidths = j.data
    } catch {
      /* 取不到就当没有，不影响正文 */
    }
    render()
  }

  /** 存回去。拖拽结束才调，不用防抖 */
  async function save() {
    if (!docFile.value) return
    try {
      await fetch(API_BASE + '/api/colw', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: docFile.value, widths: colWidths })
      })
    } catch {
      /* 列宽不是正文，存不上就算了 */
    }
  }

  function tableParts() {
    const pm = host.value?.querySelector('.ProseMirror')
    if (!pm) return []
    return [...pm.querySelectorAll('.milkdown-table-block')].map((blk) => {
      /*
       * 一个表格块里有两张 table：一张空的量算表排在前面，一张真的有行。
       * 直接 querySelector('table') 永远拿到空的那张，tr 为 0，列宽就永远落不下去。
       */
      const table = [...blk.querySelectorAll('table')].find((t) => t.querySelector('tr'))
      const firstRow = table?.querySelector('tr')
      return { blk, table, cells: firstRow ? [...firstRow.children] : [] }
    })
  }

  /**
   * 把列宽写成一条样式表注入 head。
   *
   * 选择器用的是块在 .ProseMirror 里的位置，所以要现算，文档结构变了位置也会变。
   * 列数对不上的（增删过列）跳过这一张表，免得错位。
   */
  function render() {
    const pm = host.value?.querySelector('.ProseMirror')
    const rules = []
    if (pm) {
      const kids = [...pm.children]
      tableParts().forEach((p, bi) => {
        const w = colWidths[bi]
        if (!w || !p.cells.length || w.length !== p.cells.length) return
        const pos = kids.indexOf(p.blk) + 1
        if (pos < 1) return
        const head = `.crepe-host .milkdown .ProseMirror > .milkdown-table-block:nth-child(${pos}) .table-wrapper table`
        rules.push(`${head}{table-layout:fixed}`)
        w.forEach((px, ci) => {
          rules.push(`${head} tr>*:nth-child(${ci + 1}){width:${Math.round(px)}px}`)
        })
      })
    }

    let el = document.getElementById(STYLE_ID)
    if (!el) {
      el = document.createElement('style')
      el.id = STYLE_ID
      document.head.appendChild(el)
    }
    el.textContent = rules.join('\n')
  }

  /** 编辑器重画会把样式冲掉的可能性不大，但列增删后位置会变，重画完补一次 */
  function schedule() {
    if (drag) return
    clearTimeout(timer)
    timer = setTimeout(render, 60)
  }

  /**
   * 鼠标落在哪条列边界上，返回那张表和左边那一列的序号。
   *
   * 纵坐标必须一起判。这里原来只看 x，于是只要鼠标的横坐标落在某张表某条列边界的
   * 6px 内，不管纵向在哪儿——段落里、标题上、表格上方几百像素处——光标都会变成
   * col-resize。这些表有的高一千多像素，射程拉得极长，整篇文档到处乱变。
   *
   * 块序号也在这里一并取出：tableParts() 每次调用都重新构造对象，
   * 拿它的结果回头 indexOf 永远得到 -1。
   */
  function columnAt(x, y) {
    let hit = null
    let best = Infinity
    tableParts().forEach((parts, blockIndex) => {
      if (!parts.cells.length) return
      const r = parts.blk.getBoundingClientRect()
      // 纵向不在这一块里就不算，哪怕横坐标正好压在边界上
      if (y < r.top || y > r.bottom) return
      for (let i = 0; i < parts.cells.length - 1; i++) {
        const cb = parts.cells[i].getBoundingClientRect()
        const d = Math.abs(x - cb.right)
        // 窄列按比例收窄判定区，别让整列都变成拖拽区
        const zone = Math.min(GRAB, cb.width / 4)
        if (d <= zone && d < best) {
          best = d
          hit = { parts, blockIndex, index: i }
        }
      }
    })
    return hit
  }

  function onPointerMove(e) {
    if (drag || !host.value) return
    host.value.style.cursor = columnAt(e.clientX, e.clientY) ? 'col-resize' : ''
  }

  function onPointerDown(e) {
    if (e.button !== 0) return
    const hit = columnAt(e.clientX, e.clientY)
    if (!hit) return
    e.preventDefault()
    e.stopPropagation()
    /*
     * 只记块序号和起始宽度，不记元素。
     * 拖动过程中 ProseMirror 会重画节点视图，缓存下来的单元格会变成游离节点，
     * 往游离节点写宽度是看不见任何效果的。
     */
    drag = {
      blockIndex: hit.blockIndex,
      index: hit.index,
      startX: e.clientX,
      startWidths: hit.parts.cells.map((c) => c.getBoundingClientRect().width)
    }
    host.value.style.cursor = 'col-resize'
    const r = hit.parts.cells[hit.index].getBoundingClientRect()
    const t = hit.parts.table.getBoundingClientRect()
    /*
     * 指示线挂到 body 上，绝不能挂进 ProseMirror 里。
     * 往里塞一个它不认识的节点，它的 DOMObserver 会当成外部改动，重画整个表格。
     */
    guide = document.createElement('div')
    guide.className = 'col-guide'
    guide.style.left = Math.round(r.right) - 1 + 'px'
    guide.style.top = Math.round(t.top) + 'px'
    guide.style.height = t.height + 'px'
    document.body.appendChild(guide)
  }

  /** 拖动中：只动相邻两列，总宽不变，别把表格推出容器 */
  function onDrag(e) {
    if (!drag) return
    const dx = e.clientX - drag.startX
    const i = drag.index
    const w = [...drag.startWidths]
    if (w[i] + dx < MIN_COL || w[i + 1] - dx < MIN_COL) return
    w[i] += dx
    w[i + 1] -= dx
    colWidths[drag.blockIndex] = w
    render()
    const parts = tableParts()[drag.blockIndex]
    if (guide && parts) {
      guide.style.left = Math.round(parts.cells[i].getBoundingClientRect().right) - 1 + 'px'
    }
  }

  function onPointerUp() {
    if (!drag) return
    drag = null
    if (guide) {
      guide.remove()
      guide = null
    }
    if (host.value) host.value.style.cursor = ''
    save()
  }

  function attach() {
    const el = host.value
    if (!el) return
    el.addEventListener('pointermove', onPointerMove, true)
    el.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointermove', onDrag, true)
    window.addEventListener('pointerup', onPointerUp, true)
    window.addEventListener('pointercancel', onPointerUp, true)
  }

  function detach() {
    clearTimeout(timer)
    if (guide) {
      guide.remove()
      guide = null
    }
    drag = null
    window.removeEventListener('pointermove', onDrag, true)
    window.removeEventListener('pointerup', onPointerUp, true)
    window.removeEventListener('pointercancel', onPointerUp, true)
    // 注进去的列宽样式表要跟着走，不然换文档会留着上一篇的规则
    document.getElementById(STYLE_ID)?.remove()
  }

  return { load, save, render, schedule, attach, detach, tableParts }
}
