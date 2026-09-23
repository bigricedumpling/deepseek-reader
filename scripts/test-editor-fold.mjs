import assert from 'node:assert/strict'
import { Schema } from '@milkdown/kit/prose/model'
import { buildDeco } from '../src/utils/editor-fold.js'
import { foldDoc, foldState, foldableState, foldKey } from '../src/utils/toc-fold.js'
import { extractToc } from '../src/utils/markdown.js'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    heading: { group: 'block', content: 'text*', attrs: { level: { default: 1 } } },
    text: {}
  }
})
const head = (level, title) => schema.nodes.heading.create({ level }, schema.text(title))
const para = (text) => schema.nodes.paragraph.create(null, schema.text(text))
const doc = schema.nodes.doc.create(null, [
  head(1, 'A'), para('a'), head(2, 'B'), para('b'),
  head(2, 'C'), para('c'), head(1, 'D'), para('d')
])
foldDoc.value = 'test'
foldableState.value = { test: { [foldKey(1, 'A', 0)]: true, [foldKey(2, 'B', 0)]: true } }
foldState.value = { test: { [foldKey(1, 'A', 0)]: true, [foldKey(2, 'B', 0)]: true } }

const classes = new Map(buildDeco(doc).find().map((d) => [d.from, d.type.attrs.class]))
const positions = []
doc.forEach((_node, offset) => positions.push(offset))
for (const i of [1, 2, 3, 4, 5]) {
  assert.match(classes.get(positions[i]) || '', /reader-folded/, `block ${i} stays hidden under A`)
}
assert.doesNotMatch(classes.get(positions[6]) || '', /reader-folded/, 'next H1 is visible')
assert.doesNotMatch(classes.get(positions[7]) || '', /reader-folded/, 'next section content is visible')
assert.match(classes.get(positions[0]) || '', /is-folded-head/)
assert.doesNotMatch(classes.get(positions[4]) || '', /reader-foldable-head/, '普通标题没有折叠入口')
assert.deepEqual(
  extractToc('# **A**\n\n## 1. _B_\n\n~~~md\n# 假标题\n~~~\n\nC\n---')
    .map((row) => [row.level, row.foldTitle]),
  [[1, 'A'], [2, '1. B'], [2, 'C']],
  '目录标题键与富文本显示一致，代码围栏里的假标题不进入目录'
)
console.log('嵌套标题折叠在后续同级标题处保持正确')
