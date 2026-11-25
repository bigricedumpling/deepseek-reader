// Each checkpoint has an immutable key. Discarding a draft in another window can
// only remove the version that was displayed, even if its author is still typing.
export function documentDrafts() {
  const writer = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('-')
  const tracked = new Map()
  let sequence = 0
  let accepted = null

  function remove(draft) {
    try { if (draft) localStorage.removeItem(draft.key) } catch { /* Storage access may be revoked. */ }
  }
  function finish(scope) {
    if (!scope) return false
    const hadDraft = tracked.has(scope) || accepted?.scope === scope
    remove(tracked.get(scope))
    tracked.delete(scope)
    if (accepted?.scope === scope) { remove(accepted); accepted = null }
    return hadDraft
  }
  function checkpoint(scope, base, revision, text) {
    if (!scope || base === undefined || text === undefined || !revision) return false
    if (base === text) { finish(scope); return true }
    const previous = tracked.get(scope)
    if (!tracked.has(scope)) tracked.set(scope, null)
    try {
      if (previous?.text === text && previous.revision === revision && stillCurrent(previous)) return true
      const key = scope + ':' + writer + ':' + ++sequence
      const record = { base, revision, text, time: Date.now() }
      const serialized = JSON.stringify(record)
      localStorage.setItem(key, serialized)
      tracked.set(scope, { key, serialized, text, revision })
      remove(previous)
      if (accepted?.scope === scope) { remove(accepted); accepted = null }
      return true
    } catch { return false }
  }
  function stillCurrent(draft) {
    try { return localStorage.getItem(draft.key) === draft.serialized } catch { return false }
  }
  function latest(scope, saved) {
    if (!scope) return null
    try {
      const prefix = scope + ':', own = prefix + writer + ':'
      let latest = null
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(prefix) || key.startsWith(own)) continue
        const serialized = localStorage.getItem(key)
        let record
        try { record = JSON.parse(serialized) } catch { continue }
        if (!record || typeof record.text !== 'string' || typeof record.base !== 'string' ||
            typeof record.revision !== 'string' || !Number.isFinite(record.time)) continue
        const draft = { ...record, key, scope, serialized }
        if (record.text === saved) remove(draft)
        else if (!latest || latest.time < draft.time) latest = draft
      }
      return latest
    } catch { return null }
  }
  return { checkpoint, finish, latest, stillCurrent, remove, isTracked: scope => tracked.has(scope),
    accept(draft) { accepted = draft } }
}
