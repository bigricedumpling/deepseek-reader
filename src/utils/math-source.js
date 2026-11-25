import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfm } from 'micromark-extension-gfm'
import { gfmFromMarkdown } from 'mdast-util-gfm'

const markdownOptions = { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }
let recentRanges = []

/** Source offsets include delimiters. CommonMark owns code, HTML and destinations. */
export function protectedMarkdownRanges(source) {
  const cached = recentRanges.find(entry => entry.source === source)
  if (cached) return cached.ranges
  const ranges = []
  const front = /^(?:\uFEFF)?(---|\+\+\+)[ \t]*\r?\n[\s\S]*?\r?\n\1[ \t]*(?:\r?\n|$)/.exec(source)
  const offset = front?.[0].length || (source.startsWith('\uFEFF') ? 1 : 0)
  if (front) ranges.push({ from: 0, to: offset, type: 'frontmatter' })
  const ast = fromMarkdown(source.slice(offset), markdownOptions)
  function visit(node) {
    const from = offset + node.position.start.offset
    const to = offset + node.position.end.offset
    if (['code', 'inlineCode', 'html', 'definition', 'image', 'imageReference'].includes(node.type)) {
      const range = { from, to, type: node.type }
      if (node.type === 'code' && node.lang === 'reader-columns') range.columns = node.value
      ranges.push(range)
      return
    }
    if (node.type === 'link' || node.type === 'linkReference') {
      if (!source.startsWith('[', from)) {
        ranges.push({ from, to, type: 'linkDestination' })
        return
      }
      const end = node.children.at(-1)?.position.end.offset
      ranges.push({ from: end === undefined ? from : end + offset, to, type: 'linkDestination' })
    }
    node.children?.forEach(visit)
  }
  visit(ast)
  ranges.sort((a, b) => a.from - b.from)
  if (source.length <= 500000) recentRanges = [{ source, ranges }, ...recentRanges.slice(0, 2)]
  return ranges
}

export function isContainerPrefix(prefix) {
  return /^(?:[ \t>]|[-+*](?=[ \t])|\d{1,9}[.)](?=[ \t]))*$/.test(prefix)
}

function escaped(source, index) {
  let count = 0
  while (index > 0 && source[--index] === '\\') count++
  return count % 2 === 1
}

/** Called at a candidate position within a Markdown text region. */
export function readMathAt(text, pos, limit = text.length) {
  if ((text[pos] !== '$' && text[pos] !== '\\') || escaped(text, pos)) return null
  const two = text.slice(pos, pos + 2)
  const native = two === '\\(' || two === '\\['
  const dollar = text[pos] === '$'
  if (!native && !dollar) return null
  const display = two === '$$' || two === '\\['
  const open = native || display ? two : '$'
  const close = native ? (display ? '\\]' : '\\)') : open
  const start = pos + open.length
  if (dollar && (text[start] === '$' || (text[pos - 1] === '$' &&
      (display || !text[pos - 2] || /[\s$]/.test(text[pos - 2]))))) return null
  if (open === '$' && (/\d/.test(text[pos - 1] || '') || /\s/.test(text[start] || ' '))) return null
  // An unmatched delimiter ends at its paragraph (single-dollar math ends at the line).
  const boundary = open === '$' ? /[\r\n]/ : /\r?\n[ \t]*\r?\n/
  let end = start
  while ((end = text.indexOf(close, end)) !== -1 && end + close.length <= limit) {
    if (escaped(text, end)) { end += close.length; continue }
    if (dollar && ((text[end + close.length] === '$' && (display || text[end + 2] === '$')) ||
        (end > start && text[end - 1] === '$' && !escaped(text,end-1)))) return null
    if (open === '$' && (/\s/.test(text[end - 1]) || /\d/.test(text[end + 1] || ''))) return null
    const body = text.slice(start, end)
    if (boundary.test(body) && !(display && /^[ \t]*\r?\n/.test(body) && /\n[ \t]*$/.test(body))) return null
    const to = end + close.length
    const prefix = display && body.includes('\n')
      ? text.slice(text.lastIndexOf('\n', pos - 1) + 1, pos) : ''
    // Block containers supply their own prefixes again when Markdown is serialized.
    const container = isContainerPrefix(prefix)
      ? prefix.replace(/(?:[-+*]|\d{1,9}[.)])(?=[ \t])/g, marker => ' '.repeat(marker.length)) : ''
    let raw = text.slice(pos, to)
    if (container) raw = raw.split('\n').map((line,i) => i && line.startsWith(container) ? line.slice(container.length) : line).join('\n')
    const value = raw.slice(open.length, -close.length).trim()
    if (!value || (two === '\\[' && /^\d{1,2}$/.test(value))) return null
    return { from: pos, to, value, display, raw, open, close }
  }
  return null
}

export function mathSourceSpans(source, protectedRanges) {
  if (!/\$|\\[[(]/.test(source)) return []
  const ranges = protectedRanges || protectedMarkdownRanges(source)
  const result = []
  let current = 0
  for (let pos = 0; pos < source.length;) {
    while (current < ranges.length && ranges[current].to <= pos) current++
    const range = ranges[current]
    if (range && range.from <= pos) { pos = range.to; continue }
    const span = readMathAt(source, pos)
    if (span) {
      // Once a formula opens, TeX owns inline fragments such as x<y>z.
      // A closing delimiter inside a code sample or beyond a block is still literal.
      let covered = current
      while (covered < ranges.length && ranges[covered].from < span.to) {
        const item = ranges[covered]
        if (item.to > span.to || !['inlineCode','html'].includes(item.type) ||
            (item.type === 'html' && source.slice(item.from, item.to).includes('\n'))) break
        covered++
      }
      if (covered === ranges.length || ranges[covered].from >= span.to) {
        result.push(span)
        pos = span.to
        continue
      }
    }
    pos++
  }
  return result
}
