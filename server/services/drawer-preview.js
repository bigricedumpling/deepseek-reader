import fs from 'node:fs'
import path from 'node:path'
import MarkdownIt from 'markdown-it'
import { markdownBody } from './markdown-body.js'
import { parseRichBlock } from '../../src/utils/rich-block-format.js'

const markdown = new MarkdownIt({ html: true })
const HEAD_BYTES = 8192
const parsed = new Map()

function shortText(value, limit = 150) {
  return Array.from(String(value || '').trim()).slice(0, limit).join('')
}

function inlineText(children) {
  return (children || []).map(part => {
    if (part.type === 'text' || part.type === 'code_inline') return part.content
    if (part.type === 'softbreak' || part.type === 'hardbreak') return ' '
    return ''
  }).join('').trim()
}

function parsePaper(source, filename, truncated) {
  const tokens = markdown.parse(markdownBody(source, truncated), {})
  const blocks = []
  let title = ''
  let inTable = false, rows, row
  let listDepth = 0, quoteDepth = 0
  for (const [index, token] of tokens.entries()) {
    if (blocks.length >= 8) break
    if (token.type === 'table_open') { inTable = true; rows = []; continue }
    if (token.type === 'table_close') { inTable = false; blocks.push({ type: 'table', rows }); continue }
    if (inTable) {
      if (token.type === 'tr_open') row = []
      if (token.type === 'inline' && row.length < 3) row.push(shortText(inlineText(token.children), 28))
      if (token.type === 'tr_close' && rows.length < 3) rows.push(row)
      continue
    }
    if (token.type === 'blockquote_open') quoteDepth++
    if (token.type === 'blockquote_close') quoteDepth--
    if (token.type === 'list_item_open') listDepth++
    if (token.type === 'list_item_close') listDepth--
    if (token.type === 'fence' || token.type === 'code_block') {
      const language = token.info?.trim().split(/\s+/)[0]
      if (language === 'reader-block') {
        const block = parseRichBlock(token.content)
        if (block?.type === 'figure') blocks.push({ type: 'image', url: block.src, alt: shortText(block.alt || block.caption, 60) })
        else if (block?.type === 'callout' || block?.type === 'card') {
          const value = shortText(block.title || block.content || block.description)
          if (value) blocks.push({ type: 'text', text: value })
        }
      } else if (language !== 'reader-columns' && token.content.trim()) {
        blocks.push({ type: 'code', text: shortText(token.content.split('\n').slice(0, 3).join('\n')) })
      }
      continue
    }
    if (token.type !== 'inline') continue
    const parent = tokens[index - 1]
    const heading = parent?.type === 'heading_open'
    const text = shortText(inlineText(token.children))
    if (!title && heading && parent.tag === 'h1' && text) title = shortText(text, 100)
    else if (text) {
      const type = heading ? 'heading' : listDepth ? 'list' : quoteDepth ? 'quote' : 'text'
      blocks.push({ type, text })
    }
    for (const child of token.children || []) {
      if (blocks.length < 8 && child.type === 'image') {
        blocks.push({ type: 'image', url: child.attrGet('src'), alt: shortText(child.content, 60) })
      }
    }
  }
  return { kind: 'markdown', title: title || filename, blocks }
}

// Only the current representative file is sampled. Ordinary drawer switching never
// reads previews. Cache parsed text separately from media eligibility and the UI theme.
export function drawerPreview(abs, imageUrl) {
  const ext = path.extname(abs).toLowerCase()
  const filename = path.basename(abs, path.extname(abs))
  const kind = ext === '.md' ? 'markdown' : ext === '.pdf' ? 'pdf' : 'html'
  const fallback = { kind, title: filename, blocks: [] }
  if (kind !== 'markdown') return fallback
  let fd
  try {
    fd = fs.openSync(abs, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0))
    const stat = fs.fstatSync(fd)
    if (!stat.isFile()) return fallback
    const stamp = [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':')
    let cached = parsed.get(abs)
    if (cached?.stamp !== stamp) {
      const bytes = Buffer.alloc(Math.min(stat.size, HEAD_BYTES))
      const size = fs.readSync(fd, bytes, 0, bytes.length, 0)
      const truncated = stat.size > size
      const source = new TextDecoder().decode(bytes.subarray(0, size), { stream: truncated })
      cached = { stamp, paper: parsePaper(source, filename, truncated) }
      parsed.set(abs, cached)
      if (parsed.size > 200) parsed.delete(parsed.keys().next().value)
    }
    const blocks = []
    for (const block of cached.paper.blocks) {
      if (block.type === 'image') {
        const url = imageUrl(block.url)
        if (url) blocks.push({ ...block, url })
      } else blocks.push(block)
      if (blocks.length === 4) break
    }
    return { ...cached.paper, blocks }
  } catch {
    // A document can move between enumeration and the read. Keep the drawer usable.
    return fallback
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}
