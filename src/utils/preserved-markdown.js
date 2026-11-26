export function isFrontmatterBlock(node) {
  return node.type.name === 'reader_raw' && /^(?:\uFEFF)?(---|\+\+\+)\r?\n/.test(node.attrs.value)
}

// Crepe's public Markdown used a numeric image label to store its resize ratio.
// Keep those documents readable while retaining descriptive alt text on new edits.
export function legacyImageRatio(alt) {
  return /^(?:1|\d*\.\d+)$/.test(alt) && Number(alt) > 0 && Number.isFinite(Number(alt))
    ? Number(alt) : null
}

export function imageScaleMarker(value) {
  const match = /^<!-- typocket:scale=(\d+\.\d{2}) -->$/.exec(value)
  const scale = Number(match?.[1])
  return Number.isFinite(scale) && scale > 0 ? scale : null
}

export function imageBlockAttributes(image) {
  const alt = image.alt || ''
  return { src: image.url, caption: image.title || '', alt, ratio: image.scale ?? legacyImageRatio(alt) ?? 1 }
}

export function writeImageBlock(state, node) {
  const { src, caption, ratio, alt = '' } = node.attrs
  const legacy = legacyImageRatio(alt)
  const changed = ratio !== (legacy ?? 1)
  const numericLabel = changed && (!alt || legacy !== null)
  state.openNode('paragraph')
  state.addNode('image', undefined, undefined, {
    url: src, title: caption, alt: numericLabel ? ratio.toFixed(2) : alt
  })
  if (changed && !numericLabel) {
    state.addNode('html', undefined, '<!-- typocket:scale=' + ratio.toFixed(2) + ' -->')
  }
  state.closeNode()
}

function readImageScale(parent) {
  if (!parent.children) return
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i]
    if (child.type === 'paragraph' && child.children.length === 2) {
      const [image, comment] = child.children
      const scale = image.type === 'image' && comment.type === 'html' && imageScaleMarker(comment.value)
      if (scale) {
        parent.children[i] = { ...image, type: 'image-block', scale, position: child.position }
        continue
      }
    }
    readImageScale(child)
  }
}

export function preserveBlocks(tree,file){
  const source = String(file.value || '')
  readImageScale(tree)
  tree.children = tree.children.map(node => {
    if (node.type === 'html') return {type:'readerRaw', value:node.value,position:node.position}
    if (node.type === 'paragraph' && node.children?.length === 1 && node.children[0].type === 'html' && /^<(?:div|details|table|figure|section|article)(?:\s|>)/i.test(node.children[0].value)) return {type:'readerRaw',value:node.children[0].value,position:node.position}
    return node
  })
  const front = source.match(/^(?:\uFEFF)?(---|\+\+\+)\r?\n[\s\S]*?\r?\n\1(?:\r?\n|$)/)
  if (front) {
    tree.children = tree.children.filter(node => !node.position || node.position.start.offset >= front[0].length)
    tree.children.unshift({type:'readerRaw', value:front[0].replace(/^\uFEFF/, '').trimEnd()})
  }
}
