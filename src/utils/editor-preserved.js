import { $nodeSchema, $remark } from '@milkdown/kit/utils'
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core'
import DOMPurify from 'dompurify'
import { renderMarkdown } from './markdown.js'
import {DOMParser as ProseParser, DOMSerializer} from '@milkdown/kit/prose/model'
import {preserveBlocks} from './preserved-markdown.js'

// Keep HTML as an explicit atomic block instead of discarding it during serialization.
export const preservedRemark = $remark('readerPreservedBlocks', () => () => preserveBlocks)
export function configurePreservedMarkdown(ctx) {
  ctx.update(remarkStringifyOptionsCtx, options => ({...options, handlers:{...options.handlers, readerRaw:node=>node.value}}))
}
export const preservedSchema = $nodeSchema('reader_raw', () => ({
  group:'block', atom:true, isolating:true, attrs:{value:{default:''}},
  parseDOM:[{tag:'div[data-reader-raw]',getAttrs:dom=>({value:dom.dataset.readerRaw})}],
  toDOM(node) {
    const dom=document.createElement('div');dom.className='reader-raw-block';dom.dataset.readerRaw=node.attrs.value
    dom.setAttribute('aria-label','HTML 或文档属性');dom.setAttribute('tabindex','0')
    if (/^(---|\+\+\+)\r?\n/.test(node.attrs.value)) {dom.textContent='文档属性';dom.classList.add('reader-frontmatter')}
    else dom.innerHTML=DOMPurify.sanitize(renderMarkdown(node.attrs.value),{FORBID_ATTR:['style'],FORBID_TAGS:['style','iframe','object','embed','form','input','button','textarea']})
    const edit=document.createElement('button');edit.type='button';edit.className='raw-edit-button';edit.textContent='编辑';edit.setAttribute('aria-label','编辑内容块');dom.append(edit)
    return dom
  },
  parseMarkdown:{match:node=>node.type==='readerRaw',runner:(state,node,type)=>{
    const match=node.value.match(/^<(div|p)([^>]*)>([\s\S]*)<\/\1>$/i)
    if(match&&!/<(?:div|p|table|ul|ol|section|details|h[1-6])(?:\s|>)/i.test(match[3])){
      const element=document.createElement('div');element.innerHTML=DOMPurify.sanitize(match[3],{FORBID_ATTR:['style']})
      const doc=ProseParser.fromSchema(state.schema).parse(element)
      if(doc.childCount===1&&doc.firstChild.isTextblock){state.addNode(state.schema.nodes.reader_html,{value:node.value,prefix:'<'+match[1]+match[2]+'>',suffix:'</'+match[1]+'>',original:JSON.stringify(doc.firstChild.content.toJSON())},doc.firstChild.content);return}
    }
    state.addNode(type,{value:node.value})
  }},
  toMarkdown:{match:node=>node.type.name==='reader_raw',runner:(state,node)=>state.addNode('readerRaw',undefined,node.attrs.value)}
}))

export const editableHtmlSchema=$nodeSchema('reader_html',()=>({
 group:'block',content:'inline*',defining:true,attrs:{value:{default:''},prefix:{default:'<div>'},suffix:{default:'</div>'},original:{default:''}},
 parseDOM:[{tag:'div[data-reader-html]',getAttrs:dom=>{try{const value=JSON.parse(dom.dataset.readerHtml);return ['value','prefix','suffix','original'].every(key=>typeof value[key]==='string')?value:false}catch{return false}}}],
 toDOM:node=>['div',{'data-reader-html':JSON.stringify(node.attrs),class:'reader-html-content'},0],
 parseMarkdown:{match:()=>false,runner:()=>{}},
 toMarkdown:{match:node=>node.type.name==='reader_html',runner:(state,node)=>{
  let value=node.attrs.value
  if(JSON.stringify(node.content.toJSON())!==node.attrs.original){const dom=document.createElement('div');dom.append(DOMSerializer.fromSchema(node.type.schema).serializeFragment(node.content));value=node.attrs.prefix+dom.innerHTML+node.attrs.suffix}
  state.addNode('readerRaw',undefined,value)
 }}
}))
