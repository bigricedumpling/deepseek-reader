export function preserveBlocks(tree,file){
  const source = String(file.value || '')
  tree.children = tree.children.map(node => {
    if (node.type === 'html') return {type:'readerRaw', value:node.value,position:node.position}
    if (node.type === 'paragraph' && node.children?.length === 1 && node.children[0].type === 'html' && /^<(?:div|details|table|figure|section|article)(?:\s|>)/i.test(node.children[0].value)) return {type:'readerRaw',value:node.children[0].value,position:node.position}
    return node
  })
  const front = source.match(/^(---|\+\+\+)\r?\n[\s\S]*?\r?\n\1(?:\r?\n|$)/)
  if (front) {
    tree.children = tree.children.filter(node => !node.position || node.position.start.offset >= front[0].length)
    tree.children.unshift({type:'readerRaw', value:front[0].trimEnd()})
  }
}
