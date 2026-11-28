import { $nodeSchema, $remark } from '@milkdown/kit/utils'
import { imageBlockSchema } from '@milkdown/kit/component/image-block'
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core'
import DOMPurify from 'dompurify'
import { managedVideoBlock } from './editor-video.js'
import { readingFragment } from './reading-fragment.js'
import {DOMParser as ProseParser, DOMSerializer} from '@milkdown/kit/prose/model'
import { imageBlockAttributes, isFrontmatterBlock, preserveBlocks, writeImageBlock } from './preserved-markdown.js'

// Keep HTML as an explicit atomic block instead of discarding it during serialization.
export const preservedRemark = $remark('readerPreservedBlocks', () => () => (tree, file) => {
  preserveBlocks(tree, file)
  function visit(parent) {
    for (const [index, child] of (parent.children || []).entries()) {
      let value = child.type === 'readerRaw' || child.type === 'html' ? child.value : ''
      if (child.type === 'paragraph' && child.children[0]?.type === 'html' &&
          /^<video[\s>]/i.test(child.children[0].value) && child.children.at(-1)?.type === 'html' &&
          /^<\/video>$/i.test(child.children.at(-1).value) &&
          child.position?.start.line === child.position?.end.line) {
        value = String(file.value).slice(child.position.start.offset, child.position.end.offset)
      }
      const attrs = managedVideoBlock(value)
      if (attrs) parent.children[index] = { type: 'typocketVideo', attrs, position: child.position }
      else if (value && child.type === 'paragraph') parent.children[index] = { type: 'readerRaw', value, position: child.position }
      else visit(child)
    }
  }
  visit(tree)
})
export function configurePreservedMarkdown(ctx, docFile) {
  ctx.update(preservedSchema.key, previous => inner => ({ ...previous(inner), toDOM: node => preservedDOM(node, docFile) }))
  ctx.update(imageBlockSchema.key, previous => inner => {
    const image = previous(inner)
    return {
      ...image,
      attrs: { ...image.attrs, alt: { default: '', validate: 'string' } },
      parseDOM: image.parseDOM.map(rule => ({
        ...rule,
        getAttrs: dom => ({ ...rule.getAttrs(dom), alt: dom.getAttribute('alt') || '' })
      })),
      parseMarkdown: { ...image.parseMarkdown, runner: (state, node, type) => state.addNode(type, imageBlockAttributes(node)) },
      toMarkdown: { ...image.toMarkdown, runner: writeImageBlock }
    }
  })
  ctx.update(remarkStringifyOptionsCtx, options => ({...options, handlers:{...options.handlers, readerRaw:node=>node.value}}))
}
function preservedDOM(node, docFile) {
    const dom=document.createElement('div');dom.className='reader-raw-block';dom.dataset.readerRaw=node.attrs.value
    if (node.attrs.sourceKind) dom.dataset.sourceKind = node.attrs.sourceKind
    dom.setAttribute('aria-label',node.attrs.sourceKind ? '内容块' : 'HTML 或文档属性');dom.setAttribute('tabindex','0')
    if (isFrontmatterBlock(node) || node.attrs.sourceKind === 'definition') {dom.classList.add('reader-frontmatter');dom.setAttribute('aria-hidden','true');dom.removeAttribute('tabindex')}
    else {
      const context = node.attrs.definitions ? '\n\n' + node.attrs.definitions : ''
      dom.append(readingFragment(node.attrs.value + context, { docFile, purifyOptions: { FORBID_ATTR:['style'], FORBID_TAGS:['style','iframe','object','embed','form','input','button','textarea'] } }))
    }
    const edit=document.createElement('button');edit.type='button';edit.className='raw-edit-button';edit.textContent='编辑';edit.setAttribute('aria-label','编辑内容块');dom.append(edit)
    return dom
  }
export const preservedSchema = $nodeSchema('reader_raw', () => ({
  group:'block', atom:true, isolating:true, attrs:{value:{default:''},sourceKind:{default:''},definitions:{default:''}},
  parseDOM:[{tag:'div[data-reader-raw]',getAttrs:dom=>({value:dom.dataset.readerRaw,sourceKind:dom.dataset.sourceKind || ''})}],
  toDOM: preservedDOM,
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
