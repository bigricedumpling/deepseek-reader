import { readingSnapshot } from './safe-reading.js'

// Compare the document's reading units. Keeping table rows inside their table preserves
// column alignment, and inserting a paragraph does not mark the following paragraphs.
function blocks(container) {
  return Array.from(container.children).flatMap(element => {
    const table = element.matches('table') ? element : element.matches('.table-wrap') ? element.querySelector(':scope > table') : null
    return table?.rows.length ? Array.from(table.rows) : [element]
  })
}

function unchangedPairs(oldBlocks, newBlocks) {
  const positions = new Map()
  oldBlocks.forEach((element, index) => {
    const key = element.outerHTML
    if (!positions.has(key)) positions.set(key, { indices: [], used: 0 })
    positions.get(key).indices.push(index)
  })
  // Longest increasing subsequence of matching occurrences, O(n log n), bounded memory.
  const ends = [], matches = []
  newBlocks.forEach((element, newIndex) => {
    const group = positions.get(element.outerHTML)
    if (!group || group.used === group.indices.length) return
    const oldIndex = group.indices[group.used++]
    let low = 0, high = ends.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (matches[ends[middle]].oldIndex < oldIndex) low = middle + 1
      else high = middle
    }
    const previous = low ? ends[low - 1] : -1
    ends[low] = matches.push({ oldIndex, newIndex, previous }) - 1
  })
  const old = new Set(), current = new Set()
  for (let i = ends.at(-1); i >= 0; i = matches[i].previous) {
    old.add(matches[i].oldIndex)
    current.add(matches[i].newIndex)
  }
  return { old, current }
}

export function activitySnapshot(before, after, compare) {
  // Large snapshots remain available in the exact source comparison without constructing two large DOMs.
  if (before.length + after.length > 500_000) return null
  const current = readingSnapshot(after)
  if (!compare) return { after: current.innerHTML, before: '', added: 0, removed: 0 }
  const old = readingSnapshot(before)
  const oldBlocks = blocks(old), newBlocks = blocks(current)
  const matched = unchangedPairs(oldBlocks, newBlocks)
  const mark = (elements, matched, kind) => {
    elements.forEach((element, index) => {
      if (matched.has(index)) return
      element.dataset.activityChange = kind
      element.setAttribute('aria-description', kind === 'added' ? '新增或修改的内容' : '已删除或修改的内容')
    })
    return elements.length - matched.size
  }
  const removed = mark(oldBlocks, matched.old, 'removed')
  const added = mark(newBlocks, matched.current, 'added')
  return { before: old.innerHTML, after: current.innerHTML, removed, added }
}
