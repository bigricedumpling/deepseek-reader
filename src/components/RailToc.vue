<template>
  <nav v-if="items.length && !reader.tocOpen" class="rail-toc" aria-label="章节快捷导航" @mouseleave="hint = null" @keydown.esc="hint = null">
    <button v-for="(item,i) in items" :key="i" class="rail-toc-stop" :class="{active:i===active}"
      :aria-label="item.title" :aria-current="i===active ? 'location' : undefined"
      @mouseenter="showHint(item,$event)" @focus="showHint(item,$event)" @blur="hint=null" @click="go(i)">
      <span :style="{width:(item.level > 2 ? 9 : item.level === 2 ? 12 : 16)+'px'}" />
    </button>
    <Teleport to="body"><div v-if="hint" class="rail-toc-hint ui-font" role="tooltip" :style="{top:hint.y+'px',left:hint.x+'px'}">{{ hint.title }}</div></Teleport>
  </nav>
</template>
<script setup>
import {ref, computed, watch, onMounted, onBeforeUnmount, nextTick} from 'vue'
import {useDocsStore} from '../stores/docs'
import {useReaderStore} from '../stores/reader'
import {unfoldKeys, foldKey} from '../utils/toc-fold'
import {scrollToTarget} from '../utils/scroll-target'
const store=useDocsStore(), reader=useReaderStore()
const hint=ref(null), active=ref(0)
const pdf=computed(()=>store.currentNode?.type==='pdf')
const items=computed(()=>pdf.value ? store.pdfToc : store.currentToc)
let scroller=null, frame=0
const headings=()=>Array.from(scroller?.querySelectorAll('.ProseMirror h1,.ProseMirror h2,.ProseMirror h3,.ProseMirror h4,.ProseMirror h5,.ProseMirror h6') || []).filter(el=>!el.closest('.reader-rich-block'))
function showHint(item,e){const r=e.currentTarget.getBoundingClientRect();hint.value={title:item.title,x:r.right+5,y:Math.max(24,Math.min(innerHeight-24,r.top+r.height/2))}}
function sync(){
  if(pdf.value){active.value=Math.max(0,items.value.findLastIndex(t=>t.page<=store.pdfPage));return}
  const top=scroller?.getBoundingClientRect().top || 0
  let index=0
  headings().forEach((h,i)=>{if(h.getClientRects().length && h.getBoundingClientRect().top<=top+120)index=i})
  active.value=index
}
function onScroll(){cancelAnimationFrame(frame);frame=requestAnimationFrame(sync)}
async function bind(){
  await nextTick()
  const next=document.getElementById('main-scroll-container')
  if(next!==scroller){scroller?.removeEventListener('scroll',onScroll);scroller=next;scroller?.addEventListener('scroll',onScroll,{passive:true})}
  sync()
}
async function go(i){
  await bind()
  if(pdf.value)store.pdfPage=items.value[i].page
  else {
    const seen={}, ancestors=[]
    for(const t of items.value.slice(0,i+1)){
      const label=t.foldTitle||t.title, k=t.level+'|'+label
      while(ancestors.length&&ancestors.at(-1).level>=t.level)ancestors.pop()
      ancestors.push({level:t.level,key:foldKey(t.level,label,seen[k]||0)})
      seen[k]=(seen[k]||0)+1
    }
    unfoldKeys(ancestors.map(t=>t.key))
    await nextTick()
    const h=headings()[i]
    scrollToTarget(scroller,h)
  }
  active.value=i
}
watch(()=>[store.currentPath,store.currentRaw,store.currentLoaded,store.pdfPage,reader.tocOpen],()=>{hint.value=null;bind()},{flush:'post'})
onMounted(bind)
onBeforeUnmount(()=>{scroller?.removeEventListener('scroll',onScroll);cancelAnimationFrame(frame)})
</script>
<style scoped>
.rail-toc{position:absolute;top:50%;left:6px;transform:translateY(-50%);width:32px;max-height:60vh;overflow-y:auto;scrollbar-width:none;padding:4px 0}
.rail-toc::-webkit-scrollbar{display:none}
.rail-toc-stop{display:flex;justify-content:center;align-items:center;width:32px;height:15px;outline-offset:-2px}
.rail-toc-stop span{height:1.5px;flex-shrink:0;border-radius:2px;background:var(--c-faint);opacity:.26;transition:opacity .15s,background .15s}
.rail-toc-stop.active span{opacity:.85;background:var(--c-ink)}
.rail-toc-stop:hover span,.rail-toc-stop:focus-visible span{opacity:1;background:var(--color-ds)}
.rail-toc-hint{position:fixed;transform:translateY(-50%);z-index:90;max-width:min(230px,calc(100vw - 64px));padding:5px 9px;border:1px solid var(--c-line);border-radius:6px;background:var(--c-pop);box-shadow:0 2px 8px #0000000d;color:var(--c-sub);font-size:11.5px;line-height:1.5;pointer-events:none;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
</style>
