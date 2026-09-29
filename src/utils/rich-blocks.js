import { $nodeSchema, $remark } from '@milkdown/kit/utils'
import MarkdownIt from 'markdown-it'
import { assetUrl, API_BASE } from './api'
const inline = new MarkdownIt({html:false,linkify:true})
export function parseRichBlock(raw){try{const v=JSON.parse(raw);if(v.version!==1||!['callout','columns','figure','card'].includes(v.type))return null;if(JSON.stringify(v).length>200000)return null;for(const key of ['content','left','right','icon','src','alt','caption','title','description','id'])if(v[key]!==undefined&&typeof v[key]!=='string')return null;return v}catch{return null}}
export function richMarkdown(value){return '\n```reader-block\n'+JSON.stringify(value,null,2)+'\n```\n'}
function safeUrl(value){return /^(https?:\/\/|\/api\/file\?)/.test(value||'')?assetUrl(value):''}
export function richDOM(value){
 const root=document.createElement('div');root.className='reader-rich-block reader-rich-'+value.type;root.dataset.readerBlock=JSON.stringify(value);root.contentEditable='false'
 const text=(parent,raw)=>{const d=document.createElement('div');d.innerHTML=inline.render(String(raw||''));parent.append(d)}
 if(value.type==='callout'){const icon=document.createElement('span');icon.textContent=value.icon||'💡';icon.className='rich-callout-icon';root.append(icon);text(root,value.content)}
 if(value.type==='columns'){text(root,value.left);text(root,value.right)}
 if(value.type==='figure'){root.style.textAlign=['left','center','right'].includes(value.align)?value.align:'center';const fig=document.createElement('figure');fig.style.width=Math.max(20,Math.min(100,Number(value.width)||100))+'%';const img=document.createElement('img');img.src=safeUrl(value.src);img.alt=String(value.alt||'');img.loading='lazy';fig.append(img);const caption=document.createElement('figcaption');caption.textContent=value.caption||'';fig.append(caption);root.append(fig)}
 if(value.type==='card'){const a=document.createElement('a');a.textContent=value.title||'打开文档';a.href='#';a.onclick=async e=>{e.preventDefault();try{const res=await fetch(API_BASE+'/api/resolve?id='+encodeURIComponent(value.id));const out=await res.json();if(out.ok)window.dispatchEvent(new CustomEvent('reader-open-document',{detail:out.data.path}));else a.title=out.error}catch{a.title='暂时无法打开文档'}};root.append(a);text(root,value.description)}
 return root
}
function transform(parent){if(!parent.children)return;for(let i=0;i<parent.children.length;i++){const n=parent.children[i];if(n.type==='code'&&n.lang==='reader-block'&&parseRichBlock(n.value))parent.children[i]={type:'readerBlock',value:n.value};else transform(n)}}
export const richBlockRemark=$remark('readerRichBlocks',()=>()=>transform)
export const richBlockSchema=$nodeSchema('reader_block',()=>({
 group:'block',atom:true,draggable:true,attrs:{value:{default:'',validate:'string'}},
 parseDOM:[{tag:'div[data-reader-block]',getAttrs:dom=>({value:dom.dataset.readerBlock})}],
 toDOM:node=>richDOM(parseRichBlock(node.attrs.value)||{type:'callout',content:node.attrs.value}),
 parseMarkdown:{match:node=>node.type==='readerBlock',runner:(state,node,type)=>state.addNode(type,{value:node.value})},
 toMarkdown:{match:node=>node.type.name==='reader_block',runner:(state,node)=>state.addNode('code',undefined,node.attrs.value,{lang:'reader-block'})}
}))
