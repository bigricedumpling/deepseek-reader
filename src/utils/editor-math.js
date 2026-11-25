import { $nodeSchema, $remark, $inputRule } from '@milkdown/kit/utils'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core'
import { renderFormula } from './markdown.js'
import { isContainerPrefix, mathSourceSpans } from './math-source.js'

// First boundary strictly after the given UTF-16 offset.
function upperBound(boundaries, offset) {
  let lo = 0, hi = boundaries.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (boundaries[mid] <= offset) lo = mid + 1
    else hi = mid
  }
  return lo
}

/* Protect TeX before parsing Markdown. A placeholder is plain text to every other
   extension, including GFM tables. Put each formula back immediately after parsing. */
export const editorMathRemark = $remark('typocketMath', () => function () {
  const parse = this.parser
  this.parser = (source, file) => {
    const spans = mathSourceSpans(source)
    // micromark omits the UTF-8 signature from all its reported offsets.
    const bom = source.startsWith('\uFEFF') ? 1 : 0
    if (!spans.length && !bom) return parse(source, file)
    let prefix = '\uE000'
    while (source.includes(prefix)) prefix += '\uE000'
    let start = 0, delta = 0
    const markerEnds = [], deltas = [0]
    const parts = spans.map((span, index) => {
      const preceding = source.slice(start, span.from)
      start = span.to
      if (span.display) {
        const prefix = source.slice(Math.max(bom, source.lastIndexOf('\n', span.from - 1) + 1), span.from)
        if (isContainerPrefix(prefix)) {
          const lineEnd = source.indexOf('\n', span.to)
          const suffix = source.slice(span.to, lineEnd < 0 ? source.length : lineEnd)
          span.number = /^[ \t]*\([^()\s]+\)(?=[ \t]*\r?$)/.exec(suffix)?.[0] || ''
          start += span.number.length
        }
      }
      const marker = prefix + index + '\uE001'
      const maskedEnd = span.from - delta + marker.length
      markerEnds.push(maskedEnd)
      delta = start - maskedEnd
      deltas.push(delta)
      return preceding + marker
    })
    const tree = parse(parts.join('') + source.slice(start), file)
    const marker = new RegExp(prefix + '(\\d+)\uE001', 'g')
    // Remark extensions read the original file at node.position. A placeholder can
    // hide several lines: offsets, line numbers and columns must all point back
    // to that file before emphasis, lists or fenced blocks inspect their source.
    const lineStarts = [0]
    for (const end of source.matchAll(/\r\n?|\n/g)) lineStarts.push(end.index + end[0].length)
    function sourcePoint(offset) {
      const line = upperBound(lineStarts, offset)
      return { line, column: offset - lineStarts[line - 1] + 1, offset }
    }
    function remap(point) {
      const parsedOffset = point.offset + bom
      const offset = parsedOffset + deltas[upperBound(markerEnds, parsedOffset)]
      return sourcePoint(offset)
    }
    function restore(node, parent) {
      if (node.position) node.position = { start: remap(node.position.start), end: remap(node.position.end) }
      if (spans.length && node.type === 'text' && node.value.includes(prefix)) {
        const children = []
        let end = 0, textStart = node.position.start
        for (const match of node.value.matchAll(marker)) {
          const span = spans[Number(match[1])]
          const pos = { start: sourcePoint(span.from), end: sourcePoint(span.to + (span.number?.length || 0)) }
          if (match.index > end) children.push({
            type: 'text', value: node.value.slice(end, match.index), position: { start: textStart, end: pos.start }
          })
          children.push({ type: 'readerMath', ...span, position: pos })
          end = match.index + match[0].length
          textStart = pos.end
        }
        if (end < node.value.length) children.push({
          type: 'text', value: node.value.slice(end), position: { start: textStart, end: node.position.end }
        })
        return children
      }
      if (!node.children) return node
      node.children = node.children.flatMap(child => restore(child, node))
      if (node.type === 'paragraph' && node.children.length === 1 &&
          node.children[0].type === 'readerMath' && node.children[0].display &&
          !(parent.type === 'listItem' && node === parent.children[0])) {
        return { ...node.children[0], type: 'readerMathBlock' }
      }
      return node
    }
    return restore(tree)
  }
})

function markdownFor(node) {
  const { raw, original, value, display } = node.attrs
  if (raw && value === original) return raw
  if (raw) {
    const open = raw.startsWith('$$') ? '$$' : raw.startsWith('$') ? '$' : raw.slice(0, 2)
    const close = raw.slice(-open.length)
    const old = raw.slice(open.length, -close.length)
    return open + old.match(/^\s*/)[0] + value + old.match(/\s*$/)[0] + close
  }
  return display ? '$$\n' + value + '\n$$' : '$' + value + '$'
}

function mathSchema(block) {
  const name = block ? 'reader_math_block' : 'math_inline'
  return $nodeSchema(name, () => ({
    group: block ? 'block' : 'inline',
    inline: !block,
    atom: true,
    attrs: { value: { default: '' }, display: { default: block }, raw: { default: '' }, original: { default: '' }, number: { default: '' } },
    parseDOM: [{
      tag: '[data-type="' + name + '"]',
      getAttrs: el => ({ value: el.dataset.value || '', display: block || el.dataset.mathDisplay === 'true', number: el.dataset.number || '' })
    }],
    toDOM(node) {
      const el = document.createElement(block ? 'div' : 'span')
      el.dataset.type = name
      el.dataset.value = node.attrs.value
      el.dataset.mathDisplay = String(node.attrs.display)
      if (block || node.attrs.number) el.className = 'math-block'
      el.contentEditable = 'false'
      if (node.attrs.number) el.dataset.number = node.attrs.number
      el.innerHTML = renderFormula(node.attrs.value, node.attrs.display, node.attrs.number.trim())
      return el
    },
    parseMarkdown: {
      match: node => node.type === (block ? 'readerMathBlock' : 'readerMath'),
      runner: (state, node, type) => state.addNode(type, {
        value: node.value, display: node.display, original: node.value, raw: node.raw, number: node.number || ''
      })
    },
    toMarkdown: {
      match: node => node.type.name === name,
      runner: (state, node) => state.addNode(block ? 'readerMathBlock' : 'readerMath', undefined, markdownFor(node) + node.attrs.number)
    }
  }))
}
export const inlineMathNode = mathSchema(false)
export const blockMathNode = mathSchema(true)

export function configureEditorMath(ctx) {
  const emitSource = node => node.value
  ctx.update(remarkStringifyOptionsCtx, options => ({
    ...options, handlers: { ...options.handlers, readerMath: emitSource, readerMathBlock: emitSource }
  }))
}

// Convert a completed inline expression as it is typed. Quotes, code marks and
// escaped dollars keep their normal Markdown meaning.
export const inlineMathInput = $inputRule(() => new InputRule(/(?:\$|\\\()[^\n]+(?:\$|\\\))$/, (state, match, from, to) => {
  const { $from } = state.selection
  if ($from.parent.type.spec.code || ($from.marks()).some(mark => mark.type.spec.code)) return null
  const before = $from.parent.textBetween(0, Math.max(0, from - $from.start()), undefined, '\uFFFC')
  const source = before + match[0]
  const span = mathSourceSpans(source).find(item => item.to === source.length && !item.display)
  if (!span) return null
  const attrs = { value: span.value, display: false, raw: span.raw, original: span.value }
  return state.tr.replaceWith($from.start() + span.from, to, state.schema.nodes.math_inline.create(attrs, null, $from.marks()))
}))
