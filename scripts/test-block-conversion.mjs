import assert from 'node:assert/strict'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState } from '@milkdown/kit/prose/state'
import { turnInto } from '../src/utils/editor-shortcuts.js'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: { group: 'block', content: 'inline*' },
    heading: { group: 'block', content: 'inline*', attrs: { level: { default: 1 } } },
    code_block: { group: 'block', content: 'text*', marks: '', code: true, attrs: { language: { default: '' } } }
  },
  marks: { strong: {} }
})

let state = EditorState.create({
  doc: schema.node('doc', null, [
    schema.node('heading', { level: 1 }, [schema.text('已有标题', [schema.mark('strong')])])
  ])
})

for (const [kind, type, level] of [
  ['h2', 'heading', 2],
  ['h6', 'heading', 6],
  ['code_block', 'code_block', undefined],
  ['paragraph', 'paragraph', undefined]
]) {
  assert.equal(turnInto(kind)(state, (tr) => { state = state.apply(tr) }), true, `${kind} 应能转换`)
  assert.equal(state.doc.firstChild.type.name, type)
  if (level) assert.equal(state.doc.firstChild.attrs.level, level)
  assert.equal(state.doc.firstChild.textContent, '已有标题')
  if (type === 'code_block') assert.equal(state.doc.firstChild.firstChild.marks.length, 0)
}

console.log('已有标题可以转为二级、六级标题、代码块与正文，文字保留')
