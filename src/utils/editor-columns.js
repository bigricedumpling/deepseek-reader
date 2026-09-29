import {$nodeSchema,$remark,$prose} from '@milkdown/kit/utils'
import {remarkCtx} from '@milkdown/kit/core'
import {ParserState,SerializerState} from '@milkdown/kit/transformer'
import {Plugin,NodeSelection} from '@milkdown/kit/prose/state'
import {parseColumns} from './column-format.js'
export {parseColumns} from './column-format.js'
function transform(tree){if(!tree.children)return;for(let i=0;i<tree.children.length;i++){const n=tree.children[i];if(n.type==='code'&&n.lang==='reader-columns'&&parseColumns(n.value))tree.children[i]={type:'readerColumns',value:n.value};else transform(n)}}
export const columnsRemark=$remark('readerColumns',()=>()=>transform)
export const columnSchema=$nodeSchema('reader_column',()=>({content:'block+',isolating:true,parseDOM:[{tag:'div[data-reader-column]'}],toDOM:()=>['div',{'data-reader-column':'','class':'reader-column'},0],parseMarkdown:{match:()=>false,runner:()=>{}},toMarkdown:{match:n=>n.type.name==='reader_column',runner:(state,node)=>state.next(node.content)}}))
export const columnsSchema=$nodeSchema('reader_columns',ctx=>({group:'block',content:'reader_column{2,3}',isolating:true,draggable:true,parseDOM:[{tag:'div[data-reader-columns]'}],toDOM:node=>['div',{'data-reader-columns':'','class':'reader-columns',style:'--column-count:'+node.childCount},0],parseMarkdown:{match:n=>n.type==='readerColumns',runner:(state,node,type)=>{const columns=parseColumns(node.value).map(md=>{const doc=ParserState.create(state.schema,ctx.get(remarkCtx))(md);return state.schema.nodes.reader_column.create(null,doc.content.size?doc.content:state.schema.nodes.paragraph.create())});state.addNode(type,{},columns)}},toMarkdown:{match:n=>n.type.name==='reader_columns',runner:(state,node)=>{const columns=[];node.forEach(col=>columns.push(SerializerState.create(node.type.schema,ctx.get(remarkCtx))(node.type.schema.topNodeType.create(null,col.content))));state.addNode('code',undefined,JSON.stringify({version:1,columns},null,2),{lang:'reader-columns'})}}}))

/** Move a selected top-level block to either side of another block/row. */
export function arrangeColumns(state,from,target,side){
 const source=state.doc.nodeAt(from),dest=state.doc.nodeAt(target)
 if(!source||!dest||from===target||source.type.name==='reader_columns'||!source.isBlock)return null
 if(state.doc.resolve(from).depth!==0||state.doc.resolve(target).depth!==0)return null
 const schema=state.schema,col=schema.nodes.reader_column,row=schema.nodes.reader_columns
 if(!col||!row||dest.type.name==='reader_columns'&&dest.childCount>=3)return null
 const moved=col.create(null,source),columns=[]
 if(dest.type.name==='reader_columns')dest.forEach(n=>columns.push(n));else columns.push(col.create(null,dest))
 side==='left'?columns.unshift(moved):columns.push(moved)
 const tr=state.tr.delete(from,from+source.nodeSize),at=tr.mapping.map(target)
 return tr.replaceWith(at,at+dest.nodeSize,row.create(null,columns)).setSelection(NodeSelection.create(tr.doc,at)).scrollIntoView()
}
export const columnsDrag=$prose(()=>{let hint,dropTarget
 const clear=()=>{hint?.remove();hint=null;dropTarget=null}
 function target(view,event){const selection=view.dragging?.node||view.state.selection;if(!view.editable||!view.dragging?.move||!(selection instanceof NodeSelection))return null;const from=selection.from;if(view.state.doc.resolve(from).depth!==0)return null;let hit=null;view.state.doc.forEach((node,pos)=>{const el=view.nodeDOM(pos);if(!(el instanceof HTMLElement)||pos===from)return;const r=el.getBoundingClientRect();if(event.clientY<r.top||event.clientY>r.bottom)return;const zone=Math.min(55,r.width*.22);let side;if(event.clientX>=r.left-20&&event.clientX<=r.left+zone)side='left';if(event.clientX<=r.right+20&&event.clientX>=r.right-zone)side='right';if(side&&node.type.name!=='reader_columns'||side&&node.childCount<3)hit={from,pos,side,r}});return hit}
 return new Plugin({props:{handleDOMEvents:{dragover(view,event){const t=target(view,event);clear();if(!t)return false;event.preventDefault();dropTarget=t;hint=document.createElement('div');hint.className='reader-column-drop';hint.style.cssText=`left:${(t.side==='left'?t.r.left:t.r.right)-2}px;top:${t.r.top}px;height:${Math.max(30,t.r.height)}px`;document.body.append(hint);return true},dragleave(_view,event){if(!event.relatedTarget)clear();return false},drop(view,event){const t=target(view,event)||dropTarget;clear();if(!t)return false;const tr=arrangeColumns(view.state,t.from,t.pos,t.side);if(!tr)return false;event.preventDefault();event.stopPropagation();view.dispatch(tr);view.dragging=null;return true},dragend(){clear();return false}},handleKeyDown(view,event){if(!view.editable||!event.altKey||!event.shiftKey||event.key!=='ArrowRight')return false;const $from=view.state.selection.$from;if($from.depth!==1)return false;const from=$from.before(1);let previous=null;view.state.doc.forEach((_,pos)=>{if(pos<from)previous=pos});if(previous===null)return false;const tr=arrangeColumns(view.state,from,previous,'right');if(!tr)return false;event.preventDefault();view.dispatch(tr);return true}},view:()=>({destroy:clear})})

})
