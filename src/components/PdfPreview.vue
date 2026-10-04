<template>
<section class="pdf-preview" aria-label="PDF 阅读器">
  <nav class="pdf-controls" aria-label="PDF 翻页">
    <button title="上一页" aria-label="上一页" :disabled="current<=1||loading" @click="go(current-1)"><PhCaretLeft :size="16"/></button>
    <label><input type="number" aria-label="PDF 页码" :value="current" :min="1" :max="total||1" :disabled="!total" @change="go(Number($event.target.value))"/> / {{ total || '—' }}</label>
    <button title="下一页" aria-label="下一页" :disabled="current>=total||loading" @click="go(current+1)"><PhCaretRight :size="16"/></button>
    <SelectMenu v-model="zoom" label="PDF 缩放" :options="zoomOptions" @update:model-value="draw" />
    <a :href="url.split('#')[0]" target="_blank" rel="noopener" title="在浏览器打开 PDF"><PhArrowSquareOut :size="16"/><span class="sr-only">打开原文件</span></a>
  </nav>
  <p v-if="error" role="alert" class="pdf-message">{{ error }} <button @click="load">重试</button></p>
  <p v-else-if="loading" role="status" class="pdf-message">正在加载 PDF…</p>
  <div ref="container" class="pdf-page-area">
    <div ref="paper" class="pdf-paper" :class="{pending:loading}"><canvas ref="canvas" aria-label="PDF 页面"/><div ref="textLayer" class="textLayer"/></div>
  </div>
</section>
</template>
<script setup>
import {ref,watch,onMounted,onBeforeUnmount,nextTick} from 'vue'
import SelectMenu from './SelectMenu.vue'
import {PhCaretLeft,PhCaretRight,PhArrowSquareOut} from '@phosphor-icons/vue'
import 'pdfjs-dist/web/pdf_viewer.css'
import {readPdfOutline} from '../../server/services/pdf-outline.js'
const props=defineProps({url:String,page:{type:Number,default:1}}),emit=defineEmits(['page','loaded','outline'])
const zoom=ref('fit')
const zoomOptions=[{value:'fit',label:'适合宽度'},...['0.75','1','1.5','2'].map(value=>({value,label:Number(value)*100+'%'}))]
const current=ref(1),total=ref(0),loading=ref(true),error=ref(''),canvas=ref(null),container=ref(null),paper=ref(null),textLayer=ref(null)
let pdf,task,renderTask,textTask,observer,timer,generation=0,paint=0,engine
async function draw(){
 if(!pdf||!container.value)return
 const id=++paint;renderTask?.cancel();textTask?.cancel();loading.value=true;error.value=''
 try{
   const page=await pdf.getPage(current.value)
   if(id!==paint)return
   const base=page.getViewport({scale:1}),scale=zoom.value==='fit'?Math.max(0.1,(container.value.clientWidth-32)/base.width):Number(zoom.value)
   const viewport=page.getViewport({scale}),ratio=Math.min(window.devicePixelRatio||1,2)
   const node=canvas.value
   node.width=Math.floor(viewport.width*ratio);node.height=Math.floor(viewport.height*ratio)
   node.style.width=viewport.width+'px';node.style.height=viewport.height+'px'
   paper.value.style.width=viewport.width+'px';paper.value.style.height=viewport.height+'px'
   paper.value.style.setProperty('--scale-factor',scale)
   paper.value.style.setProperty('--total-scale-factor',scale)
   textLayer.value.replaceChildren()
   renderTask=page.render({canvasContext:node.getContext('2d'),viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0]})
   await renderTask.promise
   if(id!==paint)return
   textTask=new engine.TextLayer({textContentSource:page.streamTextContent(),container:textLayer.value,viewport})
   await textTask.render()
 }catch(reason){if(id===paint&&reason.name!=='RenderingCancelledException'&&reason.name!=='AbortException')error.value='PDF 暂时无法显示，请重试或打开原文件。'}
 finally{if(id===paint)loading.value=false}
}
function go(page){if(!Number.isFinite(page)||!total.value)return;current.value=Math.max(1,Math.min(total.value,Math.trunc(page)));emit('page',current.value);draw()}
async function load(){
 const id=++generation;++paint;renderTask?.cancel();textTask?.cancel();task?.destroy();pdf=null;total.value=0;loading.value=true;error.value=''
 try{
   engine=await import('pdfjs-dist')
   const worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
   if(id!==generation)return
   engine.GlobalWorkerOptions.workerSrc=worker.default
   const base=import.meta.env.BASE_URL+(import.meta.env.DEV?'node_modules/pdfjs-dist/':'pdfjs/')
   task=engine.getDocument({url:props.url.split('#')[0],cMapUrl:base+'cmaps/',cMapPacked:true,isEvalSupported:false,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/'})
   const loaded=await task.promise
   if(id!==generation){await loaded.destroy();return}
   pdf=loaded;total.value=pdf.numPages;current.value=Math.max(1,Math.min(total.value,props.page||1));emit('loaded',total.value)
   await nextTick();await draw()
   readPdfOutline(loaded).then(outline=>{if(id===generation)emit('outline',outline)}).catch(()=>{})
 }catch(reason){if(id===generation){loading.value=false;error.value=reason.name==='PasswordException'?'此 PDF 需要密码，请在外部阅读器打开。':'PDF 加载失败，请重试或打开原文件。'}}
}
watch(()=>props.url.split('#')[0],load)
watch(()=>props.page,page=>{if(page!==current.value)go(page)})
onMounted(()=>{load();observer=new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(draw,120)});observer.observe(container.value)})
onBeforeUnmount(()=>{++generation;++paint;clearTimeout(timer);observer?.disconnect();renderTask?.cancel();textTask?.cancel();task?.destroy()})
</script>
<style scoped>
.pdf-preview{min-height:100%;background:var(--c-field);padding-bottom:24px}.pdf-controls{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;padding:10px;background:var(--c-pop);font:12px var(--font-sans)}.pdf-controls button{display:grid;place-items:center;width:28px;height:28px;border-radius:8px}.pdf-controls button:hover{background:var(--c-field)}.pdf-controls button:disabled{opacity:.35}.pdf-controls input{width:42px;text-align:center;background:var(--c-field);padding:4px;border-radius:5px;font:inherit}.pdf-controls select{font:inherit;color:var(--c-ink);background:var(--c-field);padding:6px 8px;border-radius:8px;max-width:110px}.pdf-controls a{color:var(--c-sub);margin-left:12px}.pdf-page-area{padding-top:16px;overflow:auto}.pdf-paper{position:relative;margin:0 auto;background:#fff;box-shadow:0 2px 12px #0001}.pdf-paper.pending{visibility:hidden}.pdf-message{text-align:center;font-size:13px;color:var(--c-sub);padding:12px}.pdf-message button{color:var(--color-ds)}canvas{display:block}.textLayer{position:absolute;inset:0}
</style>

<style scoped>
.pdf-controls :deep(.select-menu-trigger){width:104px;min-height:30px;padding:6px 9px;gap:8px;border:0;border-radius:7px}.pdf-controls a{display:grid;place-items:center;width:30px;height:30px;margin-left:0;border-radius:7px}.pdf-controls a:hover{background:var(--c-hover)}
</style>
