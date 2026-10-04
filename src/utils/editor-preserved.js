import { $nodeSchema, $remark } from '@milkdown/kit/utils'
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core'
import DOMPurify from 'dompurify'
import { renderMarkdown } from './markdown.js'
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
  parseMarkdown:{match:node=>node.type==='readerRaw',runner:(state,node,type)=>state.addNode(type,{value:node.value})},
  toMarkdown:{match:node=>node.type.name==='reader_raw',runner:(state,node)=>state.addNode('readerRaw',undefined,node.attrs.value)}
}))
