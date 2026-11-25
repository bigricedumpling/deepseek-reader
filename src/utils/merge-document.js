// Compare complete lines so merging never rewrites line endings or untouched Markdown.
function linesOf(text) {
  return text.match(/[^\r\n]+(?:\r\n?|\n|$)|\r\n?|\n/g) || []
}

function uniqueLines(lines, from, to) {
  const positions = new Map()
  for (let i = from; i < to; i++) {
    const line = lines[i]
    if (line.trim()) positions.set(line, positions.has(line) ? -1 : i)
  }
  return positions
}

function differences(base, updated) {
  const changes = []
  function trim(oldStart, oldEnd, newStart, newEnd) {
    while (oldStart < oldEnd && newStart < newEnd && base[oldStart] === updated[newStart]) {
      oldStart++
      newStart++
    }
    while (oldStart < oldEnd && newStart < newEnd && base[oldEnd - 1] === updated[newEnd - 1]) {
      oldEnd--
      newEnd--
    }
    return [oldStart, oldEnd, newStart, newEnd]
  }
  function record(oldStart, oldEnd, newStart, newEnd) {
    const [a, b, x, y] = trim(oldStart, oldEnd, newStart, newEnd)
    if (a === b && x === y) return
    const lines = updated.slice(x, y)
    let low = a
    let high = b
    // Identical adjacent lines make the location of an insertion/deletion ambiguous.
    // Keep the chosen edit intact, but check conflicts over every equivalent location.
    if (a === b || x === y) {
      const pattern = a === b ? lines : base.slice(a, b)
      const n = pattern.length
      while (low > 0 && base[low - 1] === pattern[n - 1 - ((a - low) % n)]) low--
      while (high < base.length && base[high] === pattern[(high - b) % n]) high++
    } else if (b - a > 1 || y - x > 1) {
      // Edits to a neighbor can hide an insertion/deletion inside a replacement.
      // An unchanged matching run can then belong to either side of the edit.
      const touchedLines = new Set(base.slice(a, b))
      for (const line of lines) touchedLines.add(line)
      while (low > 0 && touchedLines.has(base[low - 1])) low--
      while (high < base.length && touchedLines.has(base[high])) high++
    }
    changes.push({ from: a, to: b, lines, low, high })
  }
  const [a, b, x, y] = trim(0, base.length, 0, updated.length)
  if (a === b || x === y) {
    record(a, b, x, y)
    return changes
  }
  const sourcePositions = uniqueLines(base, a, b)
  const newPositions = uniqueLines(updated, x, y)
  let last = x - 1
  const anchors = []
  for (const [line, i] of sourcePositions) {
    const j = newPositions.get(line)
    if (i < 0 || j === undefined || j < 0) continue
    if (j <= last) {
      // Reordered blocks are one change; do not guess where an edit moved.
      record(a, b, x, y)
      return changes
    }
    anchors.push([i, j])
    last = j
  }
  let oldStart = a
  let newStart = x
  for (const [i, j] of anchors) {
    record(oldStart, i, newStart, j)
    oldStart = i + 1
    newStart = j + 1
  }
  record(oldStart, b, newStart, y)
  return changes
}

function same(a, b) {
  return a.from === b.from && a.to === b.to && a.lines.length === b.lines.length &&
    a.lines.every((line, i) => line === b.lines[i])
}

function before(a, b) {
  return a.high < b.low || (a.high === b.low && (a.from !== a.to || b.from !== b.to))
}

// Return null when both versions touch a range whose result needs the author's choice.
export function mergeDocument(base, local, remote) {
  if ([base, local, remote].some(text => typeof text !== 'string')) return null
  if (local === remote || remote === base) return local
  if (local === base) return remote
  if (!local || !remote) return null
  const original = linesOf(base)
  const left = differences(original, linesOf(local))
  const right = differences(original, linesOf(remote))
  let i = 0
  let j = 0
  let cursor = 0
  const parts = []
  while (i < left.length || j < right.length) {
    const a = left[i]
    const b = right[j]
    let change
    if (a && b && same(a, b)) {
      change = a
      i++
      j++
    } else if (!b || (a && before(a, b))) {
      change = a
      i++
    } else if (!a || before(b, a)) {
      change = b
      j++
    } else {
      return null
    }
    if (change.from < cursor) return null
    parts.push(original.slice(cursor, change.from).join(''), change.lines.join(''))
    cursor = change.to
  }
  parts.push(original.slice(cursor).join(''))
  // A final newline deletion and a concurrent append can turn two lines into
  // one even though their base intervals only touch. Reject that ambiguous join.
  let previous = ''
  for (const part of parts) {
    if (!part) continue
    if (previous && !/[\r\n]$/.test(previous)) return null
    if (previous.endsWith('\r') && part.startsWith('\n')) return null
    previous = part
  }
  return parts.join('')
}
