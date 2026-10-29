<template>
  <nav v-if="items.length && !reader.tocOpen" class="rail-toc" aria-label="章节快捷导航" @mouseleave="hint = null" @keydown.esc="hint = null">
    <button class="rail-toc-handle" title="展开完整目录" aria-label="展开完整目录" @click.stop="openToc">
      <PhCaretLeft :size="14" weight="bold" />
    </button>
    <button v-for="(item,i) in items" :key="i" class="rail-toc-stop" :class="{active:i===active}"
      :aria-label="item.title" :aria-current="i===active ? 'location' : undefined"
      @mouseenter="showHint(item,$event)" @focus="showHint(item,$event)" @blur="hint=null" @click.stop="go(i)">
      <span :style="{width:(item.level > 2 ? 9 : item.level === 2 ? 12 : 16)+'px'}" />
    </button>
    <Teleport to="body"><Transition name="toc-hint"><div v-if="hint" class="rail-toc-hint ui-font" role="tooltip" :style="{top:hint.y+'px',right:hint.right+'px'}">{{ hint.title }}</div></Transition></Teleport>
  </nav>
</template>
<script setup>
import {ref, computed, watch, onMounted, onBeforeUnmount, nextTick} from 'vue'
import {PhCaretLeft} from '../icons/remix'
import {useDocsStore} from '../stores/docs'
import {useReaderStore} from '../stores/reader'
import {unfoldKeys, foldKey} from '../utils/toc-fold'
import {scrollToTarget} from '../utils/scroll-target'
const store=useDocsStore(), reader=useReaderStore()
const hint=ref(null), active=ref(0)
const pdf=computed(()=>store.currentNode?.type==='pdf')
const items=computed(()=>pdf.value ? store.pdfToc : store.currentToc)
let scroller=null, frame=0
const headings=()=>Array.from(scroller?.querySelectorAll('.ProseMirror h1,.ProseMirror h2,.ProseMirror h3,.ProseMirror h4,.ProseMirror h5,.ProseMirror h6') || []).filter(el=>!el.closest('.reader-rich-block, .reader-columns, .reader-raw-block'))
function showHint(item,e){const r=e.currentTarget.getBoundingClientRect();hint.value={title:item.title,right:Math.max(12,innerWidth-r.left+6),y:Math.max(24,Math.min(innerHeight-24,r.top+r.height/2))}}
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
function openToc(){reader.tocOpen=true}
watch(()=>[store.currentPath,store.currentRaw,store.currentLoaded,store.pdfPage,reader.tocOpen],()=>{hint.value=null;bind()},{flush:'post'})
onMounted(bind)
onBeforeUnmount(()=>{scroller?.removeEventListener('scroll',onScroll);cancelAnimationFrame(frame)})
</script>
<style scoped>
.rail-toc{position:absolute;top:50%;right:6px;z-index:5;transform:translateY(-50%);width:32px;max-height:60vh;overflow:hidden;overflow:clip;padding:4px 0}
.rail-toc-handle{display:flex;justify-content:center;align-items:center;width:32px;height:24px;margin-bottom:2px;border-radius:6px;background:transparent;color:var(--c-faint);opacity:.4;transition:opacity .15s,background .15s,color .15s}
.rail-toc:hover .rail-toc-handle{opacity:.85}
.rail-toc-handle:hover,.rail-toc-handle:focus-visible{opacity:1;background:transparent;color:var(--c-accent)}
.rail-toc-stop{display:flex;justify-content:center;align-items:center;width:32px;height:15px;outline-offset:-2px}
.rail-toc-stop span{height:1.5px;flex-shrink:0;border-radius:2px;background:var(--c-faint);opacity:.26;transition:opacity .15s,background .15s}
.rail-toc-stop.active span{opacity:.85;background:var(--c-ink)}
.rail-toc-stop:hover span,.rail-toc-stop:focus-visible span{opacity:1;background:var(--c-accent)}
.rail-toc-hint{position:fixed;transform:translateY(-50%);z-index:var(--layer-hint);max-width:min(280px,calc(100vw - 64px));padding:5px 12px;border:0!important;border-radius:999px;background:transparent!important;box-shadow:none!important;color:var(--c-sub)!important;font-size:11.5px;line-height:1.5;pointer-events:none;overflow:hidden;white-space:nowrap;isolation:isolate;clip-path:inset(0 0 0 0);transition:clip-path 160ms var(--motion-snap),opacity 100ms ease,transform 160ms var(--motion-snap),top 180ms var(--motion-snap),right 180ms var(--motion-snap)}
.rail-toc-hint::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:linear-gradient(to right,transparent 0%,color-mix(in srgb,var(--c-panel) 72%,transparent) 22%,color-mix(in srgb,var(--c-panel) 72%,transparent) 78%,transparent 100%);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.toc-hint-enter-active{transition:clip-path 150ms var(--motion-snap),opacity 90ms ease,transform 150ms var(--motion-snap),top 180ms var(--motion-snap),right 180ms var(--motion-snap)}
.toc-hint-leave-active{transition:clip-path 300ms var(--motion-pop),opacity 260ms ease,transform 300ms var(--motion-pop),top 180ms var(--motion-snap),right 180ms var(--motion-snap)}
.toc-hint-enter-from{opacity:0;clip-path:inset(0 0 0 100%);transform:translateY(-50%) translateX(4px)}
.toc-hint-leave-to{opacity:0;clip-path:inset(0 0 0 70%);transform:translateY(-50%) translateX(4px) scale(.98);filter:blur(1px)}
</style>
