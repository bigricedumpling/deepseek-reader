import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfm } from 'micromark-extension-gfm'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { mathSourceSpans } from './math-source.js'
import { normalizeMarkdown, isCosmeticOnly } from './markdown-normalize.js'

const blockGrammar = { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }

// Locate full CommonMark blocks, including lists, tables and fenced or indented
// code. A formula gets an inert placeholder of equal UTF-16 length so punctuation
// and blank lines in TeX cannot split the source range.
function sourceBlocks(source) {
  const bom = source.charCodeAt(0) === 0xFEFF ? 1 : 0
  const front = /^(---|\+\+\+)[ \t]*\r?\n[\s\S]*?\r?\n\1[ \t]*(?=\r?\n|$)/.exec(source.slice(bom))
  const offset = bom + (front?.[0].length || 0)
  const blocks = front ? [{ from: bom, to: offset, type: 'frontmatter' }] : []
  const body = source.slice(offset)
  let cursor = 0
  const parts = []
  if (/\$|\\[[(]/.test(body)) {
    for (const span of mathSourceSpans(body)) {
      parts.push(body.slice(cursor, span.from), 'x'.repeat(span.to - span.from))
      cursor = span.to
    }
  }
  const ast = fromMarkdown(parts.join('') + body.slice(cursor), blockGrammar)
  function references(node, ids) {
    if (['linkReference', 'imageReference', 'footnoteReference'].includes(node.type)) {
      ids.add((node.type === 'footnoteReference' ? '^' : '') + node.identifier)
    }
    node.children?.forEach(child => references(child, ids))
  }
  for (const child of ast.children) {
    let from = offset + child.position.start.offset
    const to = offset + child.position.end.offset
    const lineStart = source.lastIndexOf('\n', from - 1) + 1
    if (/^[ \t]*$/.test(source.slice(lineStart, from))) from = lineStart
    const ids = new Set()
    references(child, ids)
    blocks.push({ from, to, type: child.type, identifier: child.identifier, ids })
  }
  return blocks
}

export function sourceBackedDocument(source, schema, parse, stringify) {
  const layout = sourceBlocks(source)
  const refs = new Map()
  for (const { from, to, type, identifier } of layout) {
    if (type === 'definition' && !refs.has(identifier)) refs.set(identifier, source.slice(from, to))
    // Milkdown needs a definition to recognize a footnote reference. The real
    // definition remains a separate editable block, in its original position.
    if (type === 'footnoteDefinition') refs.set('^' + identifier, '[^' + identifier + ']: _')
  }

  const entries = layout.map(({ from, to, type, ids }, index) => {
    const raw = source.slice(from, to)
    const definitions = [...(ids || [])].map(id => refs.get(id)).filter(Boolean).join('\n\n')
    const context = definitions ? '\n\n' + definitions : ''
    let node
    if (type !== 'definition') {
      try {
        const parsed = parse(raw + context)
        const first = parsed.firstChild
        // Context may add separate footnote nodes; only the source block belongs here.
        if (first && (parsed.childCount === 1 || context)) {
          const one = schema.topNodeType.create(null, first)
          const roundTrip = normalizeMarkdown(stringify(one), raw)
          if (roundTrip === raw || isCosmeticOnly(raw + context, roundTrip + context)) node = first
        }
      } catch {
        // Only this block needs the existing separately editable content-block surface.
      }
    }
    node ??= schema.nodes.reader_raw.create({ value: raw, sourceKind: type, definitions })
    return { from, to, index, raw, node }
  })
  const nodes = entries.map(entry => entry.node)
  const original = schema.topNodeType.createAndFill(null, nodes)
  return sourceWriter(source, original, entries, stringify)
}

// The tab cache already checks the full Markdown and document generation before
// reuse. Reattach immutable source spans to its restored ProseMirror nodes.
export function restoreSourceBlocks(source, doc, spans, stringify) {
  if (doc.childCount !== spans.length) throw new Error('Invalid source block cache')
  let previous = 0
  const entries = spans.map(([from, to], index) => {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < previous || to <= from || to > source.length) {
      throw new Error('Invalid source block range')
    }
    previous = to
    return { from, to, index, node: doc.child(index), raw: source.slice(from, to) }
  })
  return sourceWriter(source, doc, entries, stringify)
}

function sourceWriter(source, original, entries, stringify) {
  const schema = original.type.schema
  const byNode = new Map(entries.map(entry => [entry.node, entry]))
  // The heading-ID plugin updates derived attributes even when the user edits
  // a different paragraph. It retains the heading's immutable content object.
  const headings = new Map(entries.filter(({ node }) => node.type.name === 'heading').map(entry => [entry.node.content, entry]))
  const eol = /\r\n/.test(source) && !/(?<!\r)\n/.test(source) ? '\r\n' : '\n'

  function markdown(doc, trailingPlaceholders) {
    if (doc.eq(original)) return source
    const items = []
    doc.forEach((node, _, i) => {
      if (i === doc.childCount - 1 && trailingPlaceholders.has(node)) return
      const entry = byNode.get(node) || (node.type.name === 'heading' ? headings.get(node.content) : undefined)
      items.push({ node, entry })
    })
    // A text edit replaces its immutable ProseMirror node. Pair changed blocks
    // only between known neighbors with a one-to-one correspondence. New, split
    // or reordered blocks use normal Markdown separators at their new boundaries.
    for (let i = 0; i < items.length;) {
      if (items[i].entry) { i++; continue }
      const start = i
      while (i < items.length && !items[i].entry) i++
      const first = start ? items[start - 1].entry.index + 1 : 0
      const last = i === items.length ? entries.length : items[i].entry.index
      if (last - first === i - start) {
        for (let j = start; j < i; j++) items[j].entry = entries[first + j - start]
      }
    }
    let result = entries.length ? source.slice(0, entries[0].from) : ''
    for (let i = 0; i < items.length; i++) {
      const { node, entry } = items[i]
      if (i) {
        const previous = items[i - 1].entry
        result += previous && entry?.index === previous.index + 1
          ? source.slice(previous.to, entry.from) : eol + eol
      }
      if (entry && node.eq(entry.node)) result += entry.raw
      else if (node.type.name === 'reader_raw') result += node.attrs.value
      else {
        const printed = stringify(schema.topNodeType.create(null, node))
        if (entry && printed === stringify(schema.topNodeType.create(null, entry.node))) {
          result += entry.raw
          continue
        }
        const serialized = printed.replace(/\n$/, '')
        const value = entry ? normalizeMarkdown(serialized, entry.raw, { spacing: false }) : serialized
        result += eol === '\r\n' ? value.replace(/\r?\n/g, eol) : value
      }
    }
    return result + (entries.length ? source.slice(entries.at(-1).to) : '')
  }
  return { doc: original, markdown, spans: entries.map(({ from, to }) => [from, to]) }
}
