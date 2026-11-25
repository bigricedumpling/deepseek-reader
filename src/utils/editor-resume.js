// The two per-window caches have separate budgets. Browsing through several
// read-only tabs cannot evict the native undo groups from a recently edited tab.
const MAX_SOURCE_CHARS = 512 * 1024
const MAX_TOTAL_BYTES = 8 * 1024 * 1024

function snapshotStore(maxEntries, maxEntryBytes) {
  const entries = new Map()
  let totalBytes = 0
  function remove(path) {
    const previous = entries.get(path)
    if (!previous) return
    totalBytes -= previous.bytes
    entries.delete(path)
  }
  function get(path, scope, raw) {
    const entry = entries.get(path)
    if (!entry) return
    if (entry.scope !== scope || entry.raw !== raw) {
      remove(path)
      return
    }
    entries.delete(path)
    entries.set(path, entry)
    return JSON.parse(entry.encoded)
  }
  function put(path, scope, raw, snapshot) {
    remove(path)
    if (!snapshot) return
    let encoded
    try { encoded = JSON.stringify(snapshot) }
    catch { return } // An unusually deep document can exceed the serializer's nesting limit.
    if (!encoded) return
    const bytes = 2 * (path.length + scope.length + raw.length + encoded.length)
    if (bytes > maxEntryBytes) return
    while (entries.size >= maxEntries || totalBytes + bytes > MAX_TOTAL_BYTES) remove(entries.keys().next().value)
    entries.set(path, { scope, raw, encoded, bytes })
    totalBytes += bytes
  }
  function prune(keep) {
    for (const path of entries.keys()) if (!keep(path)) remove(path)
  }
  return { get, put, remove, prune }
}

export function createEditorResumeCache(isOpen, mergeCaret = null, stores = {
  parsed: snapshotStore(4, 4 * 1024 * 1024),
  history: snapshotStore(Infinity, MAX_TOTAL_BYTES)
}) {
  let disposed = false
  function accepts(path, raw) {
    return !disposed && !!path && typeof raw === 'string' && raw.length <= MAX_SOURCE_CHARS && isOpen(path)
  }
  function access(store) {
    return {
      get(path, scope, raw) {
        if (accepts(path, raw)) return store.get(path, scope, raw)
        if (!disposed) store.remove(path)
      },
      put(path, scope, raw, snapshot) {
        if (accepts(path, raw)) store.put(path, scope, raw, snapshot)
      }
    }
  }
  const parsed = access(stores.parsed)
  const history = access(stores.history)
  function prune(keep = isOpen) {
    stores.parsed.prune(keep)
    stores.history.prune(keep)
  }
  function dispose() {
    disposed = true
    prune(() => false)
  }
  function restart(path, caret) {
    // This generation can no longer write during teardown. A remote refresh
    // invalidates just the affected file, preserving other open editors' undo.
    disposed = true
    stores.parsed.remove(path)
    stores.history.remove(path)
    return createEditorResumeCache(isOpen, caret, stores)
  }
  function takeMergeCaret(path) {
    const caret = mergeCaret
    mergeCaret = null
    return !disposed && caret?.path === path ? caret : null
  }
  return { accepts, ...parsed, getHistory: history.get, putHistory: history.put,
    restart, prune: () => prune(), dispose, takeMergeCaret }
}
