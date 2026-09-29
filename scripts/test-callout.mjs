import assert from 'node:assert/strict'
import {Schema} from '@milkdown/kit/prose/model'
import {EditorState,TextSelection} from '@milkdown/kit/prose/state'
import {exitCallout} from '../src/utils/rich-blocks.js'
const schema=new Schema({nodes:{doc:{content:'block+'},text:{group:'inline'},paragraph:{group:'block',content:'inline*'},reader_callout:{group:'block',content:'block+',isolating:true}}})
const p=text=>schema.node('paragraph',null,text?schema.text(text):null)
function fixture(children,pos){const doc=schema.node('doc',null,[schema.node('reader_callout',null,children),p('after')]);return EditorState.create({doc,selection:TextSelection.create(doc,pos)})}
let state=fixture([p('abc')],3)
assert.equal(exitCallout(state),null,'normal Enter must remain inside text')
let next=state.apply(exitCallout(state,true));assert.equal(next.doc.childCount,3);assert.equal(next.doc.firstChild.textContent,'abc');assert.equal(next.selection.$from.depth,1);assert.equal(next.doc.lastChild.textContent,'after')
state=fixture([p('abc'),p()],7);next=state.apply(exitCallout(state));assert.equal(next.doc.firstChild.childCount,1);assert.equal(next.doc.firstChild.textContent,'abc');assert.equal(next.doc.child(1).textContent,'');assert.equal(next.selection.$from.depth,1)
state=fixture([p()],2);next=state.apply(exitCallout(state));assert.equal(next.doc.firstChild.childCount,1);assert.equal(next.doc.childCount,3)
console.log('PASS: ordinary Enter, exit empty last paragraph, Mod+Enter, empty callout and adjacent content preservation')
