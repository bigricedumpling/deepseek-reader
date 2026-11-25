import {$nodeSchema,$remark,$prose} from '@milkdown/kit/utils'
import {remarkCtx, remarkStringifyOptionsCtx} from '@milkdown/kit/core'
import {ParserState,SerializerState} from '@milkdown/kit/transformer'
import {Plugin,NodeSelection} from '@milkdown/kit/prose/state'
import {protectedMarkdownRanges} from './math-source.js'
import {applyEdits,modify} from 'jsonc-parser'
import {isCosmeticOnly,normalizeMarkdown} from './markdown-normalize.js'
import {parseColumns} from './column-format.js'
export {parseColumns} from './column-format.js'
// Match against original fenced nodes to retain the author's delimiters and info.
export const columnsRemark = $remark('readerColumns', () => () => (tree, file) => {
  const source = String(file.value || '')
  let fences
  function visit(parent) {
    if (!parent.children) return
    parent.children = parent.children.map(node => {
      if (node.type !== 'code' || node.lang !== 'reader-columns' || !parseColumns(node.value)) {
        visit(node)
        return node
      }
      fences ??= protectedMarkdownRanges(source).filter(range => range.columns !== undefined)
      const index = fences.findIndex(range => range.columns === node.value)
      const range = index >= 0 ? fences.splice(index, 1)[0] : null
      let fence = null
      if (range) {
        const raw = source.slice(range.from, range.to)
        const open = raw.split('\n', 1)[0].replace(/\r$/, '')
        const close = /(?:^|\n)[ \t>]*((?:`{3,}|~{3,})[ \t]*)$/.exec(raw)?.[1] || ''
        fence = { open, close }
      }
      return { type: 'readerColumns', value: node.value, fence }
    })
  }
  visit(tree)
})

export function configureColumnMarkdown(ctx) {
  ctx.update(remarkStringifyOptionsCtx, options => ({
    ...options, handlers: { ...options.handlers, readerColumns: node => node.value }
  }))
}

export const columnSchema = $nodeSchema('reader_column', () => ({
  content: 'block+',
  isolating: true,
  attrs: { source: { default: null }, baseline: { default: null } },
  parseDOM: [{ tag: 'div[data-reader-column]' }],
  toDOM: () => ['div', { 'data-reader-column': '', class: 'reader-column' }, 0],
  parseMarkdown: { match: () => false, runner: () => {} },
  toMarkdown: { match: node => node.type.name === 'reader_column', runner: (state, node) => state.next(node.content) }
}))

function writeColumns(raw, columns) {
  if (!raw) return JSON.stringify({ version: 1, columns }, null, 2)
  const original = parseColumns(raw)
  if (original.length !== columns.length) return applyEdits(raw, modify(raw, ['columns'], columns, {}))
  let result = raw
  columns.forEach((column, index) => {
    if (column !== original[index]) result = applyEdits(result, modify(result, ['columns', index], column, {}))
  })
  return result
}

export const columnsSchema = $nodeSchema('reader_columns', ctx => ({
  group: 'block', content: 'reader_column{2,3}', isolating: true, draggable: true,
  attrs: { source: { default: null }, fence: { default: null } },
  parseDOM: [{ tag: 'div[data-reader-columns]' }],
  toDOM: node => ['div', { 'data-reader-columns': '', class: 'reader-columns', style: '--column-count:' + node.childCount }, 0],
  parseMarkdown: {
    match: node => node.type === 'readerColumns',
    runner(state, node, type) {
      const remark = ctx.get(remarkCtx)
      const parse = ParserState.create(state.schema, remark)
      const serialize = SerializerState.create(state.schema, remark)
      const columns = parseColumns(node.value).map(source => {
        const doc = parse(source)
        const content = doc.content.size ? doc.content : state.schema.nodes.paragraph.create()
        const baseline = serialize(state.schema.topNodeType.create(null, content))
        const roundtrip = normalizeMarkdown(baseline, source)
        const lossless = roundtrip === source || isCosmeticOnly(source, roundtrip)
        return state.schema.nodes.reader_column.create({ source, baseline: lossless ? baseline : null }, content)
      })
      state.addNode(type, { source: node.value, fence: node.fence }, columns)
    }
  },
  toMarkdown: {
    match: node => node.type.name === 'reader_columns',
    runner(state, node) {
      const schema = node.type.schema
      const serialize = SerializerState.create(schema, ctx.get(remarkCtx))
      const columns = []
      node.forEach(column => {
        const value = serialize(schema.topNodeType.create(null, column.content))
        const { source, baseline } = column.attrs
        columns.push(source === null ? value : value === baseline ? source : normalizeMarkdown(value, source, { spacing: false }))
      })
      const json = writeColumns(node.attrs.source, columns)
      const fence = node.attrs.fence
      if (fence) {
        state.addNode('readerColumns', undefined, fence.open + '\n' + json + (fence.close ? '\n' + fence.close : ''))
      } else {
        state.addNode('code', undefined, json, { lang: 'reader-columns' })
      }
    }
  }
}))

/** Move a selected top-level block to either side of another block/row. */
export function arrangeColumns(state,from,target,side){
 const source=state.doc.nodeAt(from),dest=state.doc.nodeAt(target)
 if(!source||!dest||from===target||source.type.name==='reader_columns'||!source.isBlock)return null
 if(state.doc.resolve(from).depth!==0||state.doc.resolve(target).depth!==0)return null
 const schema=state.schema,col=schema.nodes.reader_column,row=schema.nodes.reader_columns
 if(!col||!row||dest.type.name==='reader_columns'&&dest.childCount>=3)return null
 const moved=col.create(null,source),columns=[]
 if(dest.type.name==='reader_columns')dest.forEach(n=>columns.push(n));else columns.push(col.create(null,dest))
 side==='left'?columns.unshift(moved):columns.push(moved)
 const tr=state.tr.delete(from,from+source.nodeSize),at=tr.mapping.map(target)
 return tr.replaceWith(at,at+dest.nodeSize,row.create(dest.type === row ? dest.attrs : null,columns)).setSelection(NodeSelection.create(tr.doc,at)).scrollIntoView()
}
export const columnsDrag=$prose(()=>{let hint,dropTarget
 const clear=()=>{hint?.remove();hint=null;dropTarget=null}
 function target(view,event){const selection=view.dragging?.node||view.state.selection;if(!view.editable||!view.dragging?.move||!(selection instanceof NodeSelection))return null;const from=selection.from;if(view.state.doc.resolve(from).depth!==0)return null;let hit=null;view.state.doc.forEach((node,pos)=>{const el=view.nodeDOM(pos);if(!(el instanceof HTMLElement)||pos===from)return;const r=el.getBoundingClientRect();if(event.clientY<r.top||event.clientY>r.bottom)return;const zone=Math.min(55,r.width*.22);let side;if(event.clientX>=r.left-20&&event.clientX<=r.left+zone)side='left';if(event.clientX<=r.right+20&&event.clientX>=r.right-zone)side='right';if(side&&node.type.name!=='reader_columns'||side&&node.childCount<3)hit={from,pos,side,r}});return hit}
 return new Plugin({props:{handleDOMEvents:{dragover(view,event){const t=target(view,event);clear();if(!t)return false;event.preventDefault();dropTarget=t;hint=document.createElement('div');hint.className='reader-column-drop';hint.style.cssText=`left:${(t.side==='left'?t.r.left:t.r.right)-2}px;top:${t.r.top}px;height:${Math.max(30,t.r.height)}px`;document.body.append(hint);return true},dragleave(_view,event){if(!event.relatedTarget)clear();return false},drop(view,event){const t=target(view,event)||dropTarget;clear();if(!t)return false;const tr=arrangeColumns(view.state,t.from,t.pos,t.side);if(!tr)return false;event.preventDefault();event.stopPropagation();view.dispatch(tr);view.dragging=null;return true},dragend(){clear();return false}},handleKeyDown(view,event){if(!view.editable||!event.altKey||!event.shiftKey||event.key!=='ArrowRight')return false;const $from=view.state.selection.$from;if($from.depth!==1)return false;const from=$from.before(1);let previous=null;view.state.doc.forEach((_,pos)=>{if(pos<from)previous=pos});if(previous===null)return false;const tr=arrangeColumns(view.state,from,previous,'right');if(!tr)return false;event.preventDefault();view.dispatch(tr);return true}},view:()=>({destroy:clear})})

})
