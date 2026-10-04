import assert from 'node:assert/strict'
import {remark} from 'remark'
import gfm from 'remark-gfm'
import {preserveBlocks} from '../src/utils/preserved-markdown.js'
const source='---\ntitle: Keep\n---\n\n# Heading\n\n<div>HTML body</div>\n\nText[^a]\n\n[^a]: Footnote\n\n```html\n<div>code</div>\n```\n'
const tree=remark().use(gfm).parse(source)
tree.children.push({type:'readerBlock',value:'custom block'})
preserveBlocks(tree,{value:source})
assert(tree.children.some(n=>n.type==='readerBlock'&&n.value==='custom block'))
assert.equal(tree.children[0].value,'---\ntitle: Keep\n---')
assert(tree.children.some(n=>n.type==='readerRaw'&&n.value==='<div>HTML body</div>'))
assert(tree.children.some(n=>n.type==='footnoteDefinition'))
assert(tree.children.some(n=>n.type==='code'&&n.value==='<div>code</div>'))
const wrapped={type:'root',children:[{type:'paragraph',position:{start:{offset:5}},children:[{type:'html',value:'<div>wrapped</div>'}]}]}
preserveBlocks(wrapped,{value:''});assert.equal(wrapped.children[0].value,'<div>wrapped</div>')
const inline={type:'root',children:[{type:'paragraph',children:[{type:'text',value:'normal'},{type:'html',value:'<br>'}]}]}
preserveBlocks(inline,{value:''});assert.equal(inline.children[0].type,'paragraph')
console.log('PASS: frontmatter, HTML blocks, footnotes, code fences and inline content stay distinct')
