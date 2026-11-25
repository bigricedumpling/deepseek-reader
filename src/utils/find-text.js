import { foldKey, unfoldKeys } from './toc-fold.js'
import { scrollToTarget } from './scroll-target.js'

const skip = 'button,select,textarea,script,style,.katex-mathml,.cm-gutters,.prosemirror-virtual-cursor,[aria-hidden="true"]:not(.katex-html)'
const block = 'p,h1,h2,h3,h4,h5,h6,li,td,th,pre,figcaption,.cm-line'
const highlightName = 'typocket-find'
let fallbackRange

// Keep the mapping to DOM text nodes so a match can span inline formatting
// without inserting marks into the editor or changing its selection.
export function findText(article, query) {
  if (!article || !query.trim()) return []
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT)
  const groups = []
  let node
  while ((node = walker.nextNode())) {
    const parent = node.parentElement
    if (!parent || parent.closest(skip) || !node.length) continue
    const element = parent.closest(block) || parent.closest('.ProseMirror > *')
    if (!element) continue
    let group = groups.at(-1)
    if (group?.element !== element) {
      group = { element, text: '', parts: [] }
      groups.push(group)
    }
    group.parts.push({ node, offset: group.text.length })
    group.text += node.data
  }
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(escaped, 'giu')
  const hits = []
  for (const group of groups) {
    for (const match of group.text.matchAll(pattern)) {
      const start = match.index, end = start + match[0].length
      hits.push({ group, start, end })
    }
  }
  return hits
}

export function clearFindHighlight() {
  globalThis.CSS?.highlights?.delete(highlightName)
  const selection = window.getSelection()
  if (fallbackRange && selection?.rangeCount && selection.getRangeAt(0) === fallbackRange) selection.removeAllRanges()
  fallbackRange = null
}

function partAt(parts, offset) {
  let lo = 0, hi = parts.length
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1
    if (parts[mid].offset > offset) hi = mid
    else lo = mid
  }
  return parts[lo]
}

function revealFold(element, article) {
  const folded = element.closest('.reader-folded')
  if (!folded) return
  const stack = [], seen = new Map()
  for (const child of article.children) {
    if (child === folded) break
    if (!/^H[1-6]$/.test(child.tagName)) continue
    const level = Number(child.tagName[1]), title = child.textContent.trim()
    const bucket = level + '|' + title
    const count = seen.get(bucket) || 0
    seen.set(bucket, count + 1)
    while (stack.length && stack.at(-1).level >= level) stack.pop()
    stack.push({ level, key: foldKey(level, title, count) })
  }
  unfoldKeys(stack.map(entry => entry.key))
}

export async function showFindHit(scroller, article, hit, stillCurrent) {
  if (!hit || !article?.contains(hit.group.element)) return false
  revealFold(hit.group.element, article)
  await new Promise(requestAnimationFrame)
  const { parts } = hit.group
  const from = partAt(parts, hit.start), to = partAt(parts, hit.end - 1)
  if (!stillCurrent() || !article.contains(from.node) || !article.contains(to.node) ||
      hit.start - from.offset > from.node.length || hit.end - to.offset > to.node.length) return false
  const range = document.createRange()
  range.setStart(from.node, hit.start - from.offset)
  range.setEnd(to.node, hit.end - to.offset)
  clearFindHighlight()
  if (globalThis.Highlight && CSS.highlights) CSS.highlights.set(highlightName, new Highlight(range))
  else {
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    fallbackRange = range
  }
  scrollToTarget(scroller, range)
  return true
}
