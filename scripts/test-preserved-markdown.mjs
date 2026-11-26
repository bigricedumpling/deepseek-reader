import assert from 'node:assert/strict'
import {remark} from 'remark'
import gfm from 'remark-gfm'
import { normalizeMarkdown, isCosmeticOnly } from '../src/utils/markdown-normalize.js'
import { imageBlockAttributes, preserveBlocks, writeImageBlock } from '../src/utils/preserved-markdown.js'
import { sourceBackedDocument } from '../src/utils/editor-source-blocks.js'
import { renderMarkdown } from '../src/utils/markdown.js'
import { Schema } from '@milkdown/kit/prose/model'
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

const bomFront = '\uFEFF---\ntitle: Keep\n---\n\n# Heading\n'
const bomTree = remark().use(gfm).parse(bomFront)
preserveBlocks(bomTree, {value:bomFront})
assert.equal(bomTree.children[0].value, '---\ntitle: Keep\n---')
assert.equal(bomTree.children[1].type, 'heading')
assert.equal(normalizeMarkdown('# Edited\n', '\uFEFF# Original\r\n', {spacing:false}), '\uFEFF# Edited\r\n')

const matrix = String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`
const set = String.raw`\{x \mid x>0\}`
const dollars = String.raw`the text \$x\$ and the price \$20`
const examples = [
  'New display math', '$$', matrix, '$$', '',
  'Inline $' + set + '$, ' + dollars, '',
  '| Expression | Example |', '|:---|---:|', '| $' + set + '$ | `' + matrix + '` |', '',
  '```latex', '$$', matrix, '$$', '```', '',
  'Private-use text ' + '\uE0000\uE001', ''
].join('\n')
assert.equal(normalizeMarkdown(examples, ''), examples)
assert.equal(normalizeMarkdown(examples.replaceAll('\n','\r\n'), 'old\r\n'), examples.replaceAll('\n','\r\n'))
const original = '| A | B |\n| :----- | ----: |\n| $x$ | 0 |\n'
const edited = '| A | B |\n| :--- | ---: |\n| $y$ | 0 |\n'
assert.equal(normalizeMarkdown(edited, original), original.replace('$x$', '$y$'))
assert.match(normalizeMarkdown(edited.replace('---:', ':---:'), original), /\|:---\|:---:\|/)
const link = '[Result $x$](https://example.org)'
assert.equal(normalizeMarkdown(link.replace('$x$', '$y$'), link), link.replace('$x$', '$y$'))
assert.equal(normalizeMarkdown(String.raw`Price \$15.`, 'Price $15.'), 'Price $15.')
assert.equal(isCosmeticOnly('    a  b', '~~~\na  b\n~~~'), true)
assert.equal(isCosmeticOnly('    a  b', '~~~js\na  b\n~~~'), false)
assert.equal(isCosmeticOnly('    a  b', '~~~\na b\n~~~'), false)
assert.equal(isCosmeticOnly('$' + set + '$', '$' + set.replace('\\{','{') + '$'), false)
assert.equal(isCosmeticOnly('$$'+matrix+'$$', '$$'+matrix.replace('\\\\','\\')+'$$'), false)
assert.equal(isCosmeticOnly('$x$', '$$x$$'), false)
assert.equal(isCosmeticOnly(String.raw`\$x\$`, '$x$'), false)
assert.equal(isCosmeticOnly(String.raw`\(x\)`, '$x$'), true)
console.log('PASS: TeX escapes, matrix rows, table alignment, code, literal dollars, link labels and line endings survive saving')

// A space-only edit inside inline code is meaningful, including in an ordinary GFM table.
const codeTable = '| Label | Example |\n| :--- | ---: |\n| [label](https://example.org) | `path   \\\\host` |\n'
assert.equal(normalizeMarkdown(codeTable, codeTable.replace('path   ', 'path '), { spacing: false }), codeTable)
const escapedPipe = codeTable.replace('path   ', 'a\\|b ')
assert.equal(normalizeMarkdown(escapedPipe, codeTable, { spacing: false }), escapedPipe)

const images = ['![Coast](same.png "Morning")', '![0.60](same.png "Evening")']
const resized = images[0] + '<!-- typocket:scale=0.78 -->'
const imageSource = images.join('\n\n') + '\n'
const afterResize = [resized, images[1]].join('\n\n') + '\n'
const afterCaption = afterResize.replace('Morning', 'Daybreak')
assert.equal(normalizeMarkdown(afterResize, imageSource), afterResize)
assert.equal(normalizeMarkdown(afterCaption, afterResize), afterCaption)
assert.equal(normalizeMarkdown(imageSource, afterResize), imageSource)

// Exercise the same readers/writers as the Crepe schema, including the
// per-block source-preservation route and two images sharing one asset.
const imageSchema = new Schema({ nodes: {
  doc: { content: 'block*' }, text: {},
  image: { group: 'block', attrs: { alt: {}, src: {}, caption: {}, ratio: {} } }
} })
function parseImageDoc(markdown) {
  const ast = remark().parse(markdown)
  preserveBlocks(ast, { value: markdown })
  return imageSchema.node('doc', null, ast.children.map(block =>
    imageSchema.node('image', imageBlockAttributes(block.type === 'image-block' ? block : block.children[0]))))
}
function printImageDoc(doc) {
  const children = []
  doc.forEach(node => {
    const inline = []
    writeImageBlock({
      openNode() {},
      addNode(type, _, value, attrs) { inline.push({ type, value, ...attrs }) },
      closeNode() { children.push({ type: 'paragraph', children: inline }) }
    }, node)
  })
  return remark().stringify({ type: 'root', children })
}
for (const reference of [imageSource, afterResize, afterCaption, '![](a.png)\n', '![2024](a.png)\n']) {
  assert.equal(printImageDoc(parseImageDoc(reference)), reference)
}
const backed = sourceBackedDocument(imageSource, imageSchema, parseImageDoc, printImageDoc)
assert.equal(backed.markdown(parseImageDoc(afterCaption), new Set()), afterCaption)
assert.equal(backed.markdown(parseImageDoc(imageSource), new Set()), imageSource)
for (const allowHtml of [true, false]) {
  const html = renderMarkdown(afterResize, { allowHtml })
  assert.match(html, /alt="Coast"/)
  assert.match(html, /width:78%/)
  assert.match(html, /width:60%/)
  assert.doesNotMatch(html, /typocket:scale/)
  assert.doesNotMatch(renderMarkdown('Inline ![0.60](a.png) text.', { allowHtml }), /width:60%/)
}
console.log('PASS: block image resize, alt text, captions, duplicate assets and original-size restore')
