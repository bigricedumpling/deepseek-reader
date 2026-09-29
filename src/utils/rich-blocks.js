import { h, render } from 'vue'
import { iconNames } from './icon-catalog.js'
import { $nodeSchema, $remark, $prose } from '@milkdown/kit/utils'
import MarkdownIt from 'markdown-it'
import { assetUrl, API_BASE } from './api.js'
import { remarkCtx } from '@milkdown/kit/core'
import { ParserState, SerializerState } from '@milkdown/kit/transformer'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { isCosmeticOnly } from './markdown-normalize.js'
const inline = new MarkdownIt({html:false,linkify:true})
export function parseRichBlock(raw){try{const v=JSON.parse(raw);if(v.version!==1||!['callout','columns','figure','card'].includes(v.type))return null;if(JSON.stringify(v).length>200000)return null;for(const key of ['content','left','right','icon','src','alt','caption','title','description','id'])if(v[key]!==undefined&&typeof v[key]!=='string')return null;return v}catch{return null}}
export function richMarkdown(value){return '\n```reader-block\n'+JSON.stringify(value,null,2)+'\n```\n'}
function safeUrl(value){return /^(https?:\/\/|\/api\/file\?)/.test(value||'')?assetUrl(value):''}
function calloutIcon(value) {
 const icon=document.createElement('span');icon.className='rich-callout-icon';icon.contentEditable='false'
 icon.title='更换提示块图标';icon.setAttribute('role','button');icon.setAttribute('aria-label','更换提示块图标');icon.tabIndex=0
 const valueIcon=value.icon??'💡'
 if(valueIcon.startsWith('icon:')){
  const host=document.createElement('div');render(h(iconNames[valueIcon.slice(5)]||iconNames.file,{size:22,weight:'fill'}),host)
  icon.append(host.firstElementChild.cloneNode(true));render(null,host)
 }else if(/^(data:image\/|\/|https?:\/\/)/.test(valueIcon)){
  const img=document.createElement('img');img.src=assetUrl(valueIcon);img.alt='';img.width=img.height=22;img.style.objectFit='contain';icon.append(img)
 }else icon.textContent=valueIcon||'＋'
 return icon
}
export function richDOM(value){
 const root=document.createElement('div');root.className='reader-rich-block reader-rich-'+value.type;root.dataset.readerBlock=JSON.stringify(value);root.contentEditable='false'
 const text=(parent,raw)=>{const d=document.createElement('div');d.innerHTML=inline.render(String(raw||''));parent.append(d)}
 if(value.type==='callout'){root.append(calloutIcon(value));text(root,value.content)}
 if(value.type==='columns'){text(root,value.left);text(root,value.right)}
 if(value.type==='figure'){root.style.textAlign=['left','center','right'].includes(value.align)?value.align:'center';const fig=document.createElement('figure');fig.style.width=Math.max(20,Math.min(100,Number(value.width)||100))+'%';const img=document.createElement('img');img.src=safeUrl(value.src);img.alt=String(value.alt||'');img.loading='lazy';fig.append(img);const caption=document.createElement('figcaption');caption.textContent=value.caption||'';fig.append(caption);root.append(fig)}
 if(value.type==='card'){const a=document.createElement('a');a.textContent=value.title||'打开文档';a.href='#';a.onclick=async e=>{e.preventDefault();try{const res=await fetch(API_BASE+'/api/resolve?id='+encodeURIComponent(value.id));const out=await res.json();if(out.ok)window.dispatchEvent(new CustomEvent('reader-open-document',{detail:out.data.path}));else a.title=out.error}catch{a.title='暂时无法打开文档'}};root.append(a);text(root,value.description)}
 return root
}
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
