import { closeHistory, history, redo, redoDepth, undo, undoDepth } from '@milkdown/kit/prose/history'
import { EditorState, Plugin, PluginKey, Selection } from '@milkdown/kit/prose/state'
import { Step } from '@milkdown/kit/prose/transform'

const nativeHistory = history()
const historyKey = nativeHistory.spec.key
const restoreKey = new PluginKey('reader-restore-history')

// A recreated Milkdown editor owns a new schema. Retaining its old history
// object would put nodes from the old schema into the new document on undo.
// Export native event groups on a detached history-only state instead.
export function captureHistory(state) {
  const cursor = undoDepth(state)
  if (!cursor && !redoDepth(state)) return null
  let isolated = state.reconfigure({ plugins: [nativeHistory] })
  const apply = transaction => { isolated = isolated.apply(transaction) }
  while (undo(isolated, apply)) {}
  const base = isolated.doc.toJSON()
  const groups = []
  while (redo(isolated, transaction => {
    groups.push({ selection: isolated.selection.toJSON(), steps: transaction.steps.map(step => step.toJSON()) })
    apply(transaction)
  })) {}
  return { base, groups, cursor }
}

export function withRestorableHistory(plugins) {
  return plugins.map(plugin => {
    if (plugin.spec.key !== historyKey) return plugin
    const field = plugin.spec.state
    return new Plugin({
      ...plugin.spec,
      state: {
        ...field,
        apply(transaction, previous, oldState, newState) {
          return transaction.getMeta(restoreKey) ?? field.apply(transaction, previous, oldState, newState)
        }
      }
    })
  })
}

export function restoreHistory(view, snapshot) {
  if (!snapshot) return
  const { schema, doc } = view.state
  try {
    let isolated = EditorState.create({ doc: schema.nodeFromJSON(snapshot.base), plugins: [nativeHistory] })
    for (const group of snapshot.groups) {
      isolated = isolated.apply(isolated.tr.setSelection(Selection.fromJSON(isolated.doc, group.selection)))
      const transaction = closeHistory(isolated.tr)
      for (const step of group.steps) transaction.step(Step.fromJSON(schema, step))
      isolated = isolated.apply(transaction)
    }
    for (let i = snapshot.groups.length; i > snapshot.cursor; i--) {
      if (!undo(isolated, transaction => { isolated = isolated.apply(transaction) })) return
    }
    // Check real editor coordinates after the heading IDs and trailing block
    // have initialized. Reparsed noncanonical Markdown may have a different tree.
    if (!doc.eq(isolated.doc) || undoDepth(isolated) !== snapshot.cursor) return
    const boundary = isolated.apply(closeHistory(isolated.tr))
    view.dispatch(view.state.tr.setMeta(restoreKey, historyKey.getState(boundary)))
  } catch {
    // An incompatible plugin or edited source starts a new undo boundary.
  }
}
