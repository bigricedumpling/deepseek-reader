<template>
<section class="pdf-preview" aria-label="PDF 阅读器">
  <nav class="pdf-controls" aria-label="PDF 翻页">
    <button title="上一页" aria-label="上一页" :disabled="current<=1||loading" @click="go(current-1)"><PhCaretLeft :size="16"/></button>
    <label><input type="number" aria-label="PDF 页码" :value="current" :min="1" :max="total||1" :disabled="!total" @change="go(Number($event.target.value))"/> / {{ total || '—' }}</label>
    <button title="下一页" aria-label="下一页" :disabled="current>=total||loading" @click="go(current+1)"><PhCaretRight :size="16"/></button>
    <SelectMenu v-model="zoom" label="PDF 缩放" :options="zoomOptions" @update:model-value="draw" />
    <button class="pdf-tool" :class="{ 'is-on': searchOpen }" title="查找（⌘F）" aria-label="在 PDF 中查找" :aria-expanded="searchOpen" @click="toggleSearch"><PhMagnifyingGlass :size="16"/></button>
    <a :href="url.split('#')[0]" target="_blank" rel="noopener" title="在浏览器打开 PDF"><PhArrowSquareOut :size="16"/><span class="sr-only">打开原文件</span></a>
  </nav>

  <Transition name="pdf-search">
    <div v-if="searchOpen" class="pdf-search-pop" role="search" aria-label="在 PDF 中查找">
      <div class="pdf-search-field">
        <PhMagnifyingGlass :size="14" class="pdf-search-icon" />
        <input ref="searchInput" v-model="query" type="search" placeholder="在 PDF 中查找" aria-label="查找内容" @input="queueSearch" @keydown.enter.prevent="onEnter" @keydown.esc.prevent="closeSearch" />
        <span v-if="query.trim()" class="pdf-search-count" aria-live="polite">{{ searchCountLabel }}</span>
        <button type="button" title="上一处" aria-label="上一处" :disabled="!results.length" @click="step(-1)"><PhCaretLeft :size="14"/></button>
        <button type="button" title="下一处" aria-label="下一处" :disabled="!results.length" @click="step(1)"><PhCaretRight :size="14"/></button>
        <button type="button" title="关闭查找" aria-label="关闭查找" @click="closeSearch"><PhX :size="15"/></button>
      </div>
      <div v-if="query.trim()" class="pdf-search-body">
        <p v-if="searching" class="pdf-search-note">正在检索{{ searchPage ? `第 ${searchPage} / ${total} 页` : '' }}…</p>
        <p v-else-if="!results.length" class="pdf-search-note">没有匹配</p>
        <button v-for="(hit,index) in results" :key="hit.key" type="button" class="pdf-search-hit" :class="{ 'is-on': index === activeResult }" @click="chooseHit(index)">
          <span class="pdf-hit-page">第 {{ hit.page }} 页</span>
          <span class="pdf-hit-text">{{ hit.prefix }}<mark>{{ hit.match }}</mark>{{ hit.suffix }}</span>
        </button>
      </div>
    </div>
  </Transition>

  <p v-if="error" role="alert" class="pdf-message">{{ error }} <button @click="load">重试</button></p>
  <p v-else-if="loading && !total" role="status" class="pdf-message">正在加载 PDF…</p>
  <div ref="container" class="pdf-page-area">
    <div ref="paper" class="pdf-paper" :class="{pending:loading && !total}"><canvas ref="canvas" aria-label="PDF 页面"/><div ref="textLayer" class="textLayer"/></div>
  </div>
</section>
</template>
<script setup>
import {computed,ref,watch,onMounted,onBeforeUnmount,nextTick} from 'vue'
import SelectMenu from './SelectMenu.vue'
import {PhCaretLeft,PhCaretRight,PhArrowSquareOut,PhMagnifyingGlass,PhX} from '../icons/remix'
import 'pdfjs-dist/web/pdf_viewer.css'
import {readPdfOutline} from '../../server/services/pdf-outline.js'
const props=defineProps({url:String,page:{type:Number,default:1}}),emit=defineEmits(['page','loaded','outline'])
const zoom=ref('fit')
const zoomOptions=[{value:'fit',label:'适合宽度'},...['0.75','1','1.5','2'].map(value=>({value,label:Number(value)*100+'%'}))]
const current=ref(1),total=ref(0),loading=ref(true),error=ref(''),canvas=ref(null),container=ref(null),paper=ref(null),textLayer=ref(null)
let pdf,task,renderTask,textTask,observer,timer,generation=0,paint=0,engine,lastWidth=0
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
   if(id!==paint)return
   paintSearchHits()
 }catch(reason){if(id===paint&&reason.name!=='RenderingCancelledException'&&reason.name!=='AbortException')error.value='PDF 暂时无法显示，请重试或打开原文件。'}
 finally{if(id===paint)loading.value=false}
}
function go(page){if(!Number.isFinite(page)||!total.value)return;current.value=Math.max(1,Math.min(total.value,Math.trunc(page)));emit('page',current.value);draw()}
async function load(){
 const id=++generation;++paint;renderTask?.cancel();textTask?.cancel();task?.destroy();pdf=null;total.value=0;loading.value=true;error.value=''
 textCache.clear();++searchToken;results.value=[];activeResult.value=-1;searching.value=false;searchPage.value=0
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
   if(id===generation&&searchOpen.value&&query.value.trim())queueSearch()
 }catch(reason){if(id===generation){loading.value=false;error.value=reason.name==='PasswordException'?'此 PDF 需要密码，请在外部阅读器打开。':'PDF 加载失败，请重试或打开原文件。'}}
}
watch(()=>props.url.split('#')[0],load)
watch(()=>props.page,page=>{if(page!==current.value)go(page)})

/* ---------- PDF 内查找 ---------- */
const searchOpen=ref(false),searchInput=ref(null),query=ref(''),results=ref([]),activeResult=ref(-1),searching=ref(false),searchPage=ref(0)
const textCache=new Map()
let searchTimer=null,searchToken=0
const searchCountLabel=computed(()=>{
 if(searching.value)return `${searchPage.value}/${total.value}`
 if(!results.value.length)return '0'
 return `${activeResult.value+1}/${results.value.length}`
})
async function pageText(number){
 if(textCache.has(number))return textCache.get(number)
 try{
   const page=await pdf.getPage(number)
   const content=await page.getTextContent()
   let text=''
   for(const item of content.items){
     const value=(typeof item?.str==='string'?item.str:'').trim()
     if(!value)continue
     const prev=text.at(-1)||'',next=value[0]||''
     const cjk=ch=>/[\u2e80-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch)
     if(text&&!/\s/.test(prev)&&!/^[\s.,;:!?，。；：！？、）】》」]/.test(next)&&!(cjk(prev)&&cjk(next)))text+=' '
     text+=value
     if(item.hasEOL)text+=' '
   }
   text=text.replace(/\s+/g,' ').trim()
   textCache.set(number,text)
   return text
 }catch{textCache.set(number,'');return ''}
}
function queueSearch(){
 clearTimeout(searchTimer)
 searchTimer=setTimeout(runSearch,180)
}
function clearSearchHits(){
 textLayer.value?.querySelectorAll('.pdf-page-hit').forEach(node=>node.classList.remove('pdf-page-hit'))
}
function paintSearchHits(){
 const box=textLayer.value
 if(!box)return
 const needle=query.value.trim().replace(/\s+/g,' ').toLowerCase()
 for(const span of box.querySelectorAll('span')){
   span.classList.toggle('pdf-page-hit',!!needle&&span.textContent.toLowerCase().includes(needle))
 }
}
async function runSearch(){
 const token=++searchToken
 results.value=[];activeResult.value=-1;searchPage.value=0
 const needle=query.value.trim().replace(/\s+/g,' ')
 if(!pdf||!needle){searching.value=false;clearSearchHits();return}
 searching.value=true
 const lower=needle.toLowerCase()
 let count=0
 for(let number=1;number<=total.value;number++){
   searchPage.value=number
   const text=await pageText(number)
   if(token!==searchToken)return
   const hay=text.toLowerCase()
   let from=0
   while(count<120){
     const at=hay.indexOf(lower,from)
     if(at<0)break
     const start=Math.max(0,at-28),end=Math.min(text.length,at+needle.length+42)
     results.value.push({
       key:number+':'+at,
       page:number,
       prefix:(start>0?'…':'')+text.slice(start,at),
       match:text.slice(at,at+needle.length),
       suffix:text.slice(at+needle.length,end)+(end<text.length?'…':'')
     })
     count++
     from=at+Math.max(1,needle.length)
   }
   if(count>=120)break
   if(number%8===0)await new Promise(resolve=>setTimeout(resolve,0))
 }
 if(token!==searchToken)return
 searching.value=false
 if(results.value.length){
   activeResult.value=0
   if(results.value[0].page!==current.value)go(results.value[0].page)
 }
 paintSearchHits()
}
function chooseHit(index){
 const hit=results.value[index]
 if(!hit)return
 activeResult.value=index
 if(hit.page!==current.value)go(hit.page)
}
function step(delta){
 if(!query.value.trim()||searching.value)return
 if(!results.value.length){runSearch();return}
 const count=results.value.length
 const next=(activeResult.value+(delta>0?1:-1)+count)%count
 chooseHit(next)
}
function onEnter(event){
 if(event.shiftKey)step(-1)
 else step(1)
}
function openSearch(){
 searchOpen.value=true
 nextTick(()=>{
   searchInput.value?.focus()
   searchInput.value?.select()
   if(query.value.trim())queueSearch()
 })
}
function closeSearch(){
 searchOpen.value=false
 clearTimeout(searchTimer)
 ++searchToken
 searching.value=false
 clearSearchHits()
 searchInput.value?.blur()
}
function toggleSearch(){searchOpen.value?closeSearch():openSearch()}
defineExpose({openSearch,closeSearch,toggleSearch})

onMounted(()=>{load();observer=new ResizeObserver(()=>{const w=container.value?.clientWidth||0;if(w===lastWidth)return;lastWidth=w;if(zoom.value!=='fit')return;clearTimeout(timer);timer=setTimeout(draw,120)});observer.observe(container.value)})
onBeforeUnmount(()=>{++generation;++paint;++searchToken;clearTimeout(timer);clearTimeout(searchTimer);observer?.disconnect();renderTask?.cancel();textTask?.cancel();task?.destroy()})
</script>
<style scoped>
.pdf-preview{min-height:100%;background:var(--c-field);padding-bottom:24px}.pdf-controls{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;padding:10px;background:var(--c-pop);font:12px var(--font-sans)}.pdf-controls button{display:grid;place-items:center;width:28px;height:28px;border-radius:8px}.pdf-controls button:hover{background:var(--c-field)}.pdf-controls button:disabled{opacity:.35}.pdf-controls input{width:42px;text-align:center;background:var(--c-field);padding:4px;border-radius:5px;font:inherit}.pdf-controls select{font:inherit;color:var(--c-ink);background:var(--c-field);padding:6px 8px;border-radius:8px;max-width:110px}.pdf-controls a{color:var(--c-sub);margin-left:12px}.pdf-tool.is-on{background:var(--c-active);color:var(--c-accent)}
.pdf-page-area{padding-top:16px;overflow:auto}.pdf-paper{position:relative;margin:0 auto;background:#fff;box-shadow:0 2px 12px #0001}.pdf-paper.pending{visibility:hidden}.pdf-message{text-align:center;font-size:13px;color:var(--c-sub);padding:12px}.pdf-message button{color:var(--c-accent)}canvas{display:block}.textLayer{position:absolute;inset:0}
.pdf-search-pop{position:sticky;top:49px;z-index:4;width:min(440px,calc(100% - 24px));margin:8px auto 0}
.pdf-search-field{display:flex;align-items:center;gap:4px;height:38px;padding:0 6px 0 10px;background:var(--c-pop);border:1px solid var(--c-line);border-radius:12px;box-shadow:var(--c-pop-shadow)}
.pdf-search-icon{flex:none;color:var(--c-faint)}
.pdf-search-field input{flex:1;min-width:0;width:auto;padding:5px 3px;background:transparent;border:0;text-align:left;font:12.5px var(--font-sans);color:var(--c-text);outline:none}
.pdf-search-field input::-webkit-search-cancel-button{display:none}
.pdf-search-field button{width:25px;height:25px;border-radius:7px;color:var(--c-faint);flex:none}
.pdf-search-field button:hover{background:var(--c-hover);color:var(--c-ink)}
.pdf-search-count{flex:none;font:11px var(--font-sans);color:var(--c-faint);font-variant-numeric:tabular-nums;padding:0 3px}
.pdf-search-body{position:absolute;top:calc(100% + 6px);left:0;right:0;max-height:min(320px,45vh);overflow:auto;padding:5px;background:var(--c-pop);border:1px solid var(--c-line);border-radius:12px;box-shadow:var(--c-pop-shadow)}
.pdf-search-note{margin:0;padding:8px;font:11.5px var(--font-sans);color:var(--c-faint)}
.pdf-search-hit{display:flex;align-items:flex-start;gap:8px;width:100%;text-align:left;padding:7px 8px;border-radius:8px;font:11.5px/1.6 var(--font-sans);color:var(--c-text)}
.pdf-search-hit:hover,.pdf-search-hit.is-on{background:var(--c-hover)}
.pdf-search-hit.is-on{color:var(--c-ink)}
.pdf-hit-page{flex:none;color:var(--c-faint);font-size:10px;font-variant-numeric:tabular-nums;padding-top:1px}
.pdf-hit-text{min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.pdf-hit-text mark{background:color-mix(in srgb,var(--c-accent) 16%,transparent);color:inherit;border-radius:3px;padding:0 1px}
.textLayer :deep(.pdf-page-hit){background:color-mix(in srgb,var(--c-accent) 26%,transparent);border-radius:2px}
.pdf-search-enter-active,.pdf-search-leave-active{transition:opacity 130ms ease,transform 160ms var(--motion-snap)}
.pdf-search-enter-from,.pdf-search-leave-to{opacity:0;transform:translateY(-4px)}
@media(max-width:560px){.pdf-search-pop{position:relative;top:auto}}
</style>

<style scoped>
.pdf-controls :deep(.select-menu-trigger){width:104px;min-height:30px;padding:6px 9px;gap:8px;border:0;border-radius:7px}.pdf-controls a{display:grid;place-items:center;width:30px;height:30px;margin-left:0;border-radius:7px}.pdf-controls a:hover{background:var(--c-hover)}
</style>
