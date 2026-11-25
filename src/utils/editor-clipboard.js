// Match the editor's keyboard clipboard formats, including Markdown text,
// ProseMirror slice metadata, links and inline formula nodes.
export async function copySelection(view) {
  const { dom, text } = view.serializeForClipboard(view.state.selection.content())
  const html = dom.innerHTML
  try {
    const item = new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      'text/html': new Blob([html], { type: 'text/html' })
    })
    await navigator.clipboard.write([item])
    return true
  } catch {
    // Older WebViews may allow a synchronous copy event but not ClipboardItem.
    if (view.isDestroyed) return false
    let copied = false
    const write = event => {
      if (!event.clipboardData) return
      event.preventDefault()
      event.stopImmediatePropagation()
      event.clipboardData.setData('text/html', html)
      event.clipboardData.setData('text/plain', text)
      copied = true
    }
    document.addEventListener('copy', write, true)
    try {
      view.focus()
      return document.execCommand('copy') && copied
    } catch {
      return false
    } finally {
      document.removeEventListener('copy', write, true)
    }
  }
}

export async function readEditorClipboard() {
  const data = new DataTransfer()
  if (!navigator.clipboard?.read) {
    data.setData('text/plain', await navigator.clipboard.readText())
    return data
  }
  for (const item of await navigator.clipboard.read()) {
    if (item.types.includes('text/html') || item.types.includes('text/plain')) {
      for (const format of ['text/html', 'text/plain']) {
        if (item.types.includes(format)) data.setData(format, await (await item.getType(format)).text())
      }
      break
    }
    const image = item.types.find(type => type.startsWith('image/'))
    if (image) data.items.add(new File([await item.getType(image)], 'clipboard', { type: image }))
  }
  return data
}

export function selectionHandoff(view, documentId, file, workspaceName) {
  const { doc, selection } = view.state
  if (selection.empty || (!documentId && !workspaceName)) return ''
  const sections = []
  doc.nodesBetween(0, selection.from, node => {
    if (node.type.name === 'heading') {
      const level = node.attrs.level
      while (sections.length && sections.at(-1).level >= level) sections.pop()
      sections.push({ level, name: node.textContent })
    }
    return false
  })
  const { text } = view.serializeForClipboard(selection.content())
  return [
    documentId ? '文档路径：' + file : '工作区文档：' + workspaceName,
    documentId && '文档 ID：' + documentId,
    sections.length && '小节：' + sections.map(section => section.name).join(' / '),
    '选段：\n' + text.trimEnd()
  ].filter(Boolean).join('\n')
}
