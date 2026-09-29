import assert from 'node:assert/strict'
import {Schema} from '@milkdown/kit/prose/model'
import {EditorState} from '@milkdown/kit/prose/state'
import {arrangeColumns,parseColumns} from '../src/utils/editor-columns.js'
const schema=new Schema({nodes:{doc:{content:'block+'},text:{group:'inline'},paragraph:{group:'block',content:'inline*'},image:{group:'block',attrs:{src:{default:''}}},reader_column:{content:'block+'},reader_columns:{group:'block',content:'reader_column{2,3}'}}})
const p=s=>schema.node('paragraph',null,s?[schema.text(s)]:[])
const a=p('left'),b=p('right'),c=schema.node('image',{src:'persistent.png'})
let state=EditorState.create({doc:schema.node('doc',null,[a,b,c])})
let tr=arrangeColumns(state,a.nodeSize,0,'right');assert.ok(tr);state=state.apply(tr)
assert.equal(state.doc.childCount,2);assert.equal(state.doc.firstChild.child(0).textContent,'left');assert.equal(state.doc.firstChild.child(1).textContent,'right')
tr=arrangeColumns(state,state.doc.firstChild.nodeSize,0,'left');state=state.apply(tr)
assert.equal(state.doc.firstChild.childCount,3);assert.equal(state.doc.firstChild.firstChild.firstChild.attrs.src,'persistent.png')
assert.equal(arrangeColumns(state,0,0,'left'),null)
state=state.apply(state.tr.insert(state.doc.content.size,p('fourth')))
assert.equal(arrangeColumns(state,state.doc.firstChild.nodeSize,0,'right'),null)
assert.equal(parseColumns('{"version":9,"columns":["a","b"]}'),null)
assert.deepEqual(parseColumns('{"version":1,"columns":["a","b"]}'),['a','b'])
console.log('PASS: text/image columns, before/after positions, three-column limit, malformed data preservation')
