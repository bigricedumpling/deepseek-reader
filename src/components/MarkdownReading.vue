<template><div class="crepe-host source-reading"><div class="milkdown"><article ref="article" class="ProseMirror" v-html="html" /></div></div></template>
<script setup>
import {computed,ref,watch,nextTick} from 'vue'
import DOMPurify from 'dompurify'
import {renderMarkdown} from '../utils/markdown'
import {renderMermaidSvg} from '../utils/mermaid'
const purifier=DOMPurify(window)
// KaTeX needs geometry styles. Keep only numeric length declarations; block URL and arbitrary CSS.
const geometry=new Set(['height','width','min-width','top','left','right','margin-left','margin-right','margin-top','margin-bottom','padding-left','vertical-align','border-bottom-width','font-size'])
purifier.addHook('uponSanitizeAttribute',(_node,data)=>{
 if(data.attrName==='style')data.attrValue=data.attrValue.split(';').filter(rule=>{const [key,value]=rule.split(':');return geometry.has(key?.trim())&&/^-?[0-9.]+(?:em|ex|px|%|pt)?$/.test(value?.trim()||'')}).join(';')
})
const props=defineProps({value:{type:String,default:''}})
const article=ref(null)
const html=computed(()=>purifier.sanitize(renderMarkdown(props.value),{FORBID_TAGS:['style','iframe','object','embed','form','button','select','textarea'],ADD_ATTR:['target']}))
let generation=0
watch(html,async()=>{
 const current=++generation;await nextTick()
 for(const input of article.value?.querySelectorAll('input')||[])input.disabled=true
 for(const link of article.value?.querySelectorAll('a[target]')||[])link.rel='noopener noreferrer'
 for(const code of article.value?.querySelectorAll('pre code.language-mermaid')||[]){
   const svg=await renderMermaidSvg(code.textContent)
   if(current!==generation)return
   if(svg){const figure=document.createElement('figure');figure.innerHTML=DOMPurify.sanitize(svg);code.parentElement.replaceWith(figure)}
 }
},{immediate:true})
</script>
<style scoped>.source-reading{min-width:0;overflow-wrap:anywhere}.source-reading :deep(img){max-width:100%;height:auto}.source-reading :deep(pre){overflow:auto}.source-reading :deep(figure svg){max-width:100%;height:auto}</style>
