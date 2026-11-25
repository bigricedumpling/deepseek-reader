import MarkdownIt from 'markdown-it'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import footnote from 'markdown-it-footnote'
import { parseFragment } from 'parse5'
import { markdownBody } from './markdown-body.js'
import { parseColumns } from '../../src/utils/column-format.js'
import { parseRichBlock } from '../../src/utils/rich-block-format.js'

const md = new MarkdownIt({ html: true }).use(sub).use(sup).use(footnote)
const hidden = new Set(['script', 'style', 'template', 'iframe', 'button', 'textarea', 'select', 'object', 'embed', 'form'])
const boundaries = new Set(['p','div','li','section','article','header','figcaption','td','th','pre','blockquote','h1','h2','h3','h4','h5','h6','br'])

function visibleHtml(html) {
  const root = parseFragment(html), pieces = []
  function visit(node) {
    if (hidden.has(node.tagName) || node.attrs?.some(attr => attr.name === 'hidden' || attr.name === 'aria-hidden' && attr.value === 'true')) return
    const boundary = boundaries.has(node.tagName)
    if (boundary) pieces.push('\n')
    if (node.nodeName === '#text') pieces.push(node.value)
    for (const child of node.childNodes || []) visit(child)
    if (boundary) pieces.push('\n')
  }
  visit(root)
  return pieces.join('')
}

function extractBody(source, depth = 0) {
  // Ordinary prose with ATX headings needs no inline parser. This is also the
  // frequent case for imported transcripts with hundreds of plain paragraphs.
  if (!/[\\`*_\[\]~|<>&$^\t]/.test(source) && !/^ {0,3}(?:[-+=:>]|\d+[.)]\s)|^ {4}/m.test(source)) {
    return source.replace(/^ {0,3}#{1,6}(?:[ \t]+|$)(.*?)(?:[ \t]+#+[ \t]*)?$/gm, '$1')
  }
  const env = {}
  const parts = []
  for (const token of md.parse(source, env)) {
    if (token.type === 'inline') {
      const children = token.children || []
      if (children.some(t => t.type === 'html_inline')) parts.push(visibleHtml(md.renderer.renderInline(children, md.options, env)))
      else parts.push(children.map(t => t.type === 'text' || t.type === 'code_inline' ? t.content :
        t.type === 'softbreak' || t.type === 'hardbreak' ? '\n' : '').join(''))
    } else if (token.type === 'html_block') parts.push(visibleHtml(token.content))
    else if (token.type === 'fence' || token.type === 'code_block') {
      const language = token.info.trim().split(/\s+/)[0]
      const columns = language === 'reader-columns' && parseColumns(token.content)
      const rich = language === 'reader-block' && parseRichBlock(token.content)
      if (columns || rich) {
        if (depth >= 6) continue
        if (columns) parts.push(...columns.map(body => extractBody(body, depth + 1)))
        else if (rich.type === 'columns') parts.push(extractBody(rich.left || '', depth + 1), extractBody(rich.right || '', depth + 1))
        else if (rich.type === 'callout') parts.push(extractBody(rich.content || '', depth + 1))
        else if (rich.type === 'figure') parts.push(rich.caption || '')
        else if (rich.type === 'card') parts.push(rich.title || '打开文档', extractBody(rich.description || '', depth + 1))
      } else parts.push(token.content)
    }
  }
  return parts.join('\n')
}

export function searchableMarkdown(source) {
  return extractBody(markdownBody(source))
}
