<template><div class="crepe-host source-reading"><div class="milkdown"><article ref="article" class="ProseMirror" /></div></div></template>
<script setup>
import {ref,watch,nextTick} from 'vue'
import DOMPurify from 'dompurify'
import { readingDocument } from '../utils/safe-reading'
import {renderMermaidSvg} from '../utils/mermaid'
const props=defineProps({value:{type:String,default:''}})
const article=ref(null)
let generation=0
watch(()=>props.value,async value=>{
 const current=++generation;await nextTick()
 if(current!==generation||!article.value)return
 article.value.replaceChildren(readingDocument(value))
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
