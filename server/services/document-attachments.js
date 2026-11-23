import { parseFragment } from 'parse5'
import { parseTree, findNodeAtLocation } from 'jsonc-parser'
import { parseDocumentMarkdown } from './workspace-images.js'
import { parseRichBlock } from '../../src/utils/rich-block-format.js'
import { parseColumns } from '../../src/utils/column-format.js'

// Markdown parsers remove list and quote prefixes inside multiline HTML and fences.
// Map each logical line back to its original offset without serializing the block.
function sourceLines(source, node, prefix) {
  const skip = node.type === 'code' ? 1 : 0
  let physical = prefix + node.position.start.offset
  const lines = source.slice(physical, prefix + node.position.end.offset).split(/(?<=\n)|(?<=\r)(?!\n)/)
  if (skip) physical += lines[0].length
  const map = []
  let logical = 0
  for (const [i, line] of node.value.split(/(?<=\n)|(?<=\r)(?!\n)/).entries()) {
    const value = line.replace(/[\r\n]+$/, '')
    const original = lines[i + skip] || ''
    const content = original.replace(/[\r\n]+$/, '')
    if (!content.endsWith(value)) return null
    map.push({ start: logical, shift: physical + content.length - value.length - logical })
    logical += line.length
    physical += original.length
  }
  return offset => {
    let left = 0, right = map.length
    while (left + 1 < right) {
      const mid = (left + right) >> 1
      if (map[mid].start > offset) right = mid
      else left = mid
    }
    return offset + map[left].shift
  }
}

function htmlChanges(html, resolve, add) {
  const fragment = parseFragment(html, { sourceCodeLocationInfo: true })
  function visit(node) {
    if (['pre', 'code', 'script', 'style', 'textarea'].includes(node.tagName)) return
    for (const attr of node.attrs || []) {
      if (!(['img', 'source'].includes(node.tagName) && ['src', 'srcset'].includes(attr.name)) &&
          !(node.tagName === 'a' && attr.name === 'href') && !(node.tagName === 'video' && attr.name === 'poster')) continue
      const loc = node.sourceCodeLocation?.attrs?.[attr.name]
      if (!loc) continue
      const raw = html.slice(loc.startOffset, loc.endOffset)
      const prefix = /^[^=]+=[\t\n\f\r ]*(["']?)/.exec(raw)
      if (!prefix) continue
      const start = loc.startOffset + prefix[0].length
      const end = loc.endOffset - (prefix[1] ? 1 : 0)
      if (attr.name === 'srcset') {
        // Candidate URLs end at whitespace or a trailing comma; retain descriptors.
        const value = html.slice(start, end)
        let pos = 0
        while (pos < value.length) {
          while (pos < value.length && /[\s,]/.test(value[pos])) pos++
          const from = pos
          while (pos < value.length && !/\s/.test(value[pos])) pos++
          const rawUrl = value.slice(from, pos).replace(/,+$/, '')
          if (!rawUrl) continue
          const replacement = resolve(rawUrl.replace(/&amp;/gi, '&'))
          if (replacement) add(start + from, start + from + rawUrl.length, replacement.replaceAll('&', '&amp;'))
          if (from + rawUrl.length < pos) continue
          // Commas inside a URL (including data: URLs) are part of the resource.
          let parentheses = 0
          while (pos < value.length) {
            const char = value[pos++]
            if (char === ',' && !parentheses) break
            if (char === '(') parentheses++
            if (char === ')' && parentheses) parentheses--
          }
        }
      } else {
        const replacement = resolve(attr.value)
        if (replacement) add(start, end, replacement.replaceAll('&', '&amp;'))
      }
    }
    for (const child of node.childNodes || []) visit(child)
    if (node.content) visit(node.content)
  }
  visit(fragment)
}

// Map UTF-16 offsets in a decoded JSON string back into its original spelling.
// An edit inside a column must preserve escapes elsewhere in that same column.
function jsonOffsets(source, field) {
  const offsets = []
  let index = field.offset + 1
  const end = field.offset + field.length - 1
  while (index < end) {
    offsets.push(index)
    if (source[index] === '\\') index += source[index + 1] === 'u' ? 6 : 2
    else index++
  }
  offsets.push(end)
  return offsets
}

function richChanges(node, resolve, add) {
  const json = node.value
  const columns = node.lang === 'reader-columns' && parseColumns(json)
  const rich = node.lang === 'reader-block' && parseRichBlock(json)
  if (!columns && !rich) return
  const tree = parseTree(json)
  const fields = columns ? columns.map((_, index) => ['columns', index])
    : ({ figure: ['src'], callout: ['icon', 'content'], columns: ['left', 'right'], card: ['description'] })[rich.type].map(key => [key])
  for (const path of fields) {
    const field = findNodeAtLocation(tree, path)
    if (field?.type !== 'string') continue
    const offsets = jsonOffsets(json, field)
    const inner = (start, end, value) => add(offsets[start], offsets[end], JSON.stringify(value).slice(1, -1))
    if (path[0] === 'src' || path[0] === 'icon') {
      const url = resolve(field.value)
      if (url) inner(0, field.value.length, url)
    } else {
      // Legacy rich-block text uses inline Markdown with raw HTML disabled.
      markdownChanges(field.value, resolve, inner, Boolean(columns))
    }
  }
}

function markdownChanges(source, resolve, add, richFormats = true) {
  const { tree, prefix } = parseDocumentMarkdown(source)
  function visit(node) {
    if (node.destination) {
      const url = resolve(node.url)
      if (url) {
        let start = node.destination.start.offset + prefix, end = node.destination.end.offset + prefix
        if (source[start] === '<') { start++; end-- }
        add(start, end, url)
      }
    } else if (richFormats && (node.type === 'html' ||
          (node.type === 'code' && ['reader-columns', 'reader-block'].includes(node.lang)))) {
      const offset = sourceLines(source, node, prefix)
      if (offset) {
        const translated = (start, end, url) => add(offset(start), offset(end), url)
        if (node.type === 'html') htmlChanges(node.value, resolve, translated)
        else richChanges(node, resolve, translated)
      }
    }
    // Inline HTML tags arrive as siblings. Literal examples between <code>
    // tags must be treated like the equivalent Markdown code span.
    let codeDepth = 0
    for (const child of node.children || []) {
      if (child.type === 'html' && /^<code(?:\s+(?:"[^"]*"|'[^']*'|[^"'<>])*)?>$/i.test(child.value)) codeDepth++
      else if (child.type === 'html' && /^<\/code\s*>$/i.test(child.value)) codeDepth = Math.max(0, codeDepth - 1)
      else if (!codeDepth) visit(child)
    }
  }
  visit(tree)
}

export function rewriteCopiedAttachments(source, isHtml, resolve) {
  const changes = []
  const add = (start, end, value) => changes.push({ start, end, value })
  if (!source.includes('/api/file') && !source.includes('reader-')) return source
  if (isHtml) htmlChanges(source, resolve, add)
  else markdownChanges(source, resolve, add)
  let cursor = 0
  const parts = []
  for (const { start, end, value } of changes.sort((a, b) => a.start - b.start)) {
    parts.push(source.slice(cursor, start), value)
    cursor = end
  }
  return parts.length ? parts.join('') + source.slice(cursor) : source
}
