import { $nodeSchema, $remark, $prose } from '@milkdown/kit/utils'
import { remarkCtx } from '@milkdown/kit/core'
import { ParserState, SerializerState } from '@milkdown/kit/transformer'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { parseRichBlock } from './rich-block-format.js'
import { isCosmeticOnly } from './markdown-normalize.js'
import { calloutIcon, richDOM } from './rich-block-dom.js'
export { parseRichBlock, richDOM }
export function richMarkdown(value){return '\n```reader-block\n'+JSON.stringify(value,null,2)+'\n```\n'}
function transform(parent){if(!parent.children)return;for(let i=0;i<parent.children.length;i++){const n=parent.children[i];if(n.type==='code'&&n.lang==='reader-block'&&parseRichBlock(n.value))parent.children[i]={type:'readerBlock',value:n.value};else transform(n)}}
export const richBlockRemark=$remark('readerRichBlocks',()=>()=>transform)
export const richBlockSchema=$nodeSchema('reader_block',ctx=>({
 group:'block',atom:true,draggable:true,attrs:{value:{default:'',validate:'string'}},
 parseDOM:[{tag:'div[data-reader-block]',getAttrs:dom=>({value:dom.dataset.readerBlock})}],
 toDOM:node=>richDOM(parseRichBlock(node.attrs.value)||{type:'callout',content:node.attrs.value}),
 parseMarkdown:{match:node=>node.type==='readerBlock',runner:(state,node,type)=>{const value=parseRichBlock(node.value);const doc=calloutDocument(value,state.schema,ctx);if(doc)state.addNode(state.schema.nodes.reader_callout,{value:node.value},doc.content);else state.addNode(type,{value:node.value})}},
 toMarkdown:{match:node=>node.type.name==='reader_block',runner:(state,node)=>state.addNode('code',undefined,node.attrs.value,{lang:'reader-block'})}
}))


/** Keep unsupported or recursive Markdown in its original atomic block. */
function calloutDocument(value,schema,ctx) {
 if(value?.type!=='callout'||/(?:`{3,}|~{3,})\s*reader-(?:block|columns)/.test(value.content||''))return null
 const parse=ParserState.create(schema,ctx.get(remarkCtx)),serialize=SerializerState.create(schema,ctx.get(remarkCtx))
 try{const doc=parse(value.content||'');if((value.content||'').trim()&&!isCosmeticOnly(value.content,serialize(doc)))return null;return doc.content.size?doc:schema.topNodeType.create(null,schema.nodes.paragraph.create())}catch{return null}
}
export function calloutValue(node,ctx) {
 const value=parseRichBlock(node.attrs.value)||{version:1,type:'callout',icon:'💡',content:''}
 const original=calloutDocument(value,node.type.schema,ctx)
 if(original?.content.eq(node.content))return node.attrs.value
 const content=SerializerState.create(node.type.schema,ctx.get(remarkCtx))(node.type.schema.topNodeType.create(null,node.content)).trimEnd()
 return JSON.stringify({...value,content},null,2)
}
export const calloutSchema=$nodeSchema('reader_callout',ctx=>({
 group:'block',content:'block+',isolating:true,defining:true,draggable:true,
 attrs:{value:{default:'',validate:'string'}},
 parseDOM:[{tag:'div[data-reader-callout]',contentElement:'.rich-callout-content',getAttrs:dom=>({value:dom.dataset.readerCallout})}],
 toDOM:node=>['div',{'class':'reader-rich-block reader-rich-callout','data-reader-callout':node.attrs.value},
  calloutIcon(parseRichBlock(node.attrs.value)||{}),
  ['div',{'class':'rich-callout-content'},0]],
 parseMarkdown:{match:()=>false,runner:()=>{}},
 toMarkdown:{match:node=>node.type.name==='reader_callout',runner:(state,node)=>state.addNode('code',undefined,calloutValue(node,ctx),{lang:'reader-block'})}
}))

/** Enter on the last empty paragraph (or Mod+Enter) exits a callout. */
export function exitCallout(state,force=false){
 const {$from,empty}=state.selection;if(!empty)return null
 let depth=$from.depth;while(depth>0&&$from.node(depth).type.name!=='reader_callout')depth--
 if(!depth)return null
 const node=$from.node(depth),blank=$from.depth===depth+1&&$from.parent.type.name==='paragraph'&&!$from.parent.content.size&&$from.index(depth)===node.childCount-1
 if(!force&&!blank)return null
 const end=$from.after(depth),tr=state.tr
 if(blank&&node.childCount>1)tr.delete($from.before(),$from.after())
 const at=tr.mapping.map(end);tr.insert(at,state.schema.nodes.paragraph.create())
 return tr.setSelection(TextSelection.create(tr.doc,at+1)).scrollIntoView()
}
export const calloutKeys=$prose(()=>new Plugin({props:{handleDOMEvents:{keydown(view,event){
 if(!view.editable||event.key!=='Enter'||event.shiftKey||event.altKey)return false
 const tr=exitCallout(view.state,event.metaKey||event.ctrlKey);if(!tr)return false
 event.preventDefault();view.dispatch(tr);return true
}}}}))
