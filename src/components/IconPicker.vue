<template><Teleport to="body"><Transition name="overlay" appear @after-leave="$emit('close')"><div v-if="visible" class="picker-dismiss" @pointerdown.self="visible=false" @keydown.esc="visible=false"><section class="icon-picker reader-dialog" :style="placement" role="dialog" aria-modal="true" aria-label="选择图标">
  <div class="picker-tabs" role="tablist" aria-label="图标来源">
    <button v-for="t in TABS" :key="t" role="tab" :tabindex="tab === t ? 0 : -1" :class="{ 'is-on': tab === t }" :aria-selected="tab === t" @click="tab=t;query='';category=''" @keydown="tabKey($event)">{{t}}</button>
    <button class="picker-remove" :disabled="busy" @click="choose('')">移除</button>
  </div>
  <template v-if="tab!=='上传'">
    <div class="picker-tools">
      <label class="picker-search"><PhMagnifyingGlass :size="14"/><input ref="search" v-model="query" placeholder="搜索图标" aria-label="搜索图标"/></label>
      <button class="icon-btn picker-shuffle" :disabled="busy" title="随机选择" aria-label="随机选择" @click="shuffle"><PhShuffle :size="15"/></button>
    </div>
    <div v-if="tab==='图标'||tab==='玻璃'" class="picker-tint">
      <span>{{ tab==='玻璃' ? '色调' : '颜色' }}</span>
      <button v-for="t in tintOptions" :key="t.value" :class="{on: activeTint===t.value}" :style="{background:t.swatch}" :title="t.label" :aria-label="t.label" @click="setTint(t.value)"></button>
    </div>
    <div class="picker-scroll"><template v-for="group in groups" :key="group.name"><p>{{group.name}}</p><div class="icon-grid"><button v-for="item in group.items" :key="item.value" :class="{ selected: variantKey(item.value) === currentKey }" :title="item.label" :aria-label="item.label" :aria-pressed="variantKey(item.value) === currentKey" :disabled="busy" @click="choose(item.value)"><ContentIcon :value="previewValue(item.value)" :size="24"/><span v-if="variantKey(item.value) === currentKey" class="icon-check"><PhCheck :size="10" weight="bold"/></span></button></div></template><p v-if="!groups.length" class="picker-empty">没有匹配的图标</p></div>
    <footer v-if="tab==='表情符号'" class="picker-categories"><button v-for="g in emojiGroups" :key="g.name" :title="g.name" :class="{selected:category===g.name}" @click="category=category===g.name?'':g.name;query=''">{{g.icon}}</button><button :class="{selected:!category}" @click="category='';query=''">全部</button></footer>
  </template>
  <div v-else class="icon-upload"><div v-if="customIcons.length" class="uploaded-icons"><p>已上传</p><div class="icon-grid"><button v-for="icon in customIcons" :key="icon" type="button" :class="{ selected: baseValue(icon) === currentBase }" title="使用已上传的图标" :aria-pressed="baseValue(icon) === currentBase" :disabled="busy" @click="choose(icon)"><ContentIcon :value="icon" :size="24" /><span v-if="icon === current" class="icon-check"><PhCheck :size="10" weight="bold"/></span></button></div></div><PhImage :size="38"/><p>选择一张图片作为图标</p><label class="reader-button">选择图片<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="upload"/></label><p>PNG、JPEG、WebP 或 GIF，最大 10 MB</p></div>
  <p v-if="error" class="reader-error">{{error}}</p>
</section></div></Transition></Teleport></template>
<script setup>
const visible=ref(true)
import {ref,computed,watch,onMounted,onBeforeUnmount,nextTick} from 'vue'
import {PhMagnifyingGlass,PhShuffle,PhImage,PhCheck} from '../icons/remix'
import ContentIcon from './ContentIcon.vue'
import {lineIcons,solidIcons,emojiGroups,ensureIconPaths} from '../utils/icon-catalog'
import {nucleoIconGroups} from '../utils/nucleo-icons'
import {glassIcons} from '../utils/glass-icons'
import {API_BASE} from '../utils/api'
import {storageJSON,storageSet} from '../utils/storage'
const iconLabel=Object.fromEntries([...lineIcons,...solidIcons,...glassIcons,...nucleoIconGroups.flatMap(g=>g.items)].map(x=>[x.value,x.label]))
const props=defineProps({save:Function,anchor:Object,current:{type:String,default:''}});const emit=defineEmits(['close'])
const TABS=['表情符号','图标','实心','Nucleo','玻璃','上传']
const colorTints=[{value:'',swatch:'var(--c-ink)',label:'跟随主题'},{value:'#2f6fed',swatch:'#2f6fed',label:'蓝'},{value:'#1e3a8a',swatch:'#1e3a8a',label:'藏蓝'},{value:'#4a6fa5',swatch:'#4a6fa5',label:'雾蓝'},{value:'#374151',swatch:'#374151',label:'石墨'}]
const hueTints=[{value:'0',swatch:'#bfc0c2',label:'原色'},{value:'145',swatch:'#6fc2c8',label:'冰蓝'},{value:'158',swatch:'#6fadbe',label:'湖蓝'},{value:'170',swatch:'#7193ac',label:'靛蓝'},{value:'178',swatch:'#6b7a94',label:'深蓝'}]
const query=ref(''),busy=ref(false),error=ref(''),tab=ref('表情符号'),category=ref(''),search=ref(null),placement=ref({}),recent=ref([]),customIcons=ref([]),iconTint=ref(''),glassHue=ref('0')
try{const seen=new Set();recent.value=storageJSON('reader:recent-icons',[]).filter(x=>typeof x==='string').filter(x=>{const base=variantKey(x);if(seen.has(base))return false;seen.add(base);return true}).slice(0,16);storageSet('reader:recent-icons',JSON.stringify(recent.value))}catch{}
const tintOptions=computed(()=>tab.value==='玻璃'?hueTints:colorTints)
const activeTint=computed(()=>tab.value==='玻璃'?glassHue.value:iconTint.value)
const currentBase=computed(()=>baseValue(props.current))
const currentKey=computed(()=>variantKey(props.current))
function baseValue(value){return String(value||'').split('?')[0]}
function variantKey(value){const s=String(value||'');return s.split('?')[0]+(s.includes('weight=fill')?'?weight=fill':'')}
function setTint(value){if(tab.value==='玻璃')glassHue.value=value;else iconTint.value=value}
function tabKey(e){const i=TABS.indexOf(tab.value);const next=e.key==='ArrowRight'?(i+1)%TABS.length:e.key==='ArrowLeft'?(i-1+TABS.length)%TABS.length:e.key==='Home'?0:e.key==='End'?TABS.length-1:-1;if(next<0)return;e.preventDefault();const bar=e.currentTarget.parentElement;tab.value=TABS[next];query.value='';category.value='';nextTick(()=>bar?.querySelector('[role=tab][aria-selected=true]')?.focus())}
function previewValue(value){if(!value)return '';if(String(value).includes('?'))return value;const base=baseValue(value);if(tab.value==='玻璃')return glassHue.value&&glassHue.value!=='0'?base+'?hue='+glassHue.value:base;if(tab.value==='图标'&&iconTint.value)return base+'?color='+encodeURIComponent(iconTint.value);return base}
const groups=computed(()=>{
  let list
  if(tab.value==='图标') list=[{name:'图标',items:lineIcons}]
  else if(tab.value==='实心') list=[{name:'实心图标',items:solidIcons}]
  else if(tab.value==='Nucleo') list=nucleoIconGroups
  else if(tab.value==='玻璃') list=[{name:'玻璃图标',items:glassIcons}]
  else list=emojiGroups.filter(g=>!category.value||g.name===category.value)
  if(!query.value&&!category.value&&recent.value.length&&tab.value!=='Nucleo'){
    const isSolid=x=>x.startsWith('icon:')&&x.includes('weight=fill')
    const isIcon=x=>x.startsWith('icon:')&&!isSolid(x)
    const isGlass=x=>x.startsWith('glass:')
    const isNucleo=x=>x.startsWith('nucleo:')
    const accept=tab.value==='图标'?isIcon:tab.value==='实心'?isSolid:tab.value==='玻璃'?isGlass:x=>!isIcon(x)&&!isSolid(x)&&!isGlass(x)&&!isNucleo(x)
    list=[{name:'最近',items:recent.value.filter(accept).map(value=>({value,label:iconLabel[value]||iconLabel[baseValue(value)]||value}))},...list]
  }
  const q=query.value.toLowerCase()
  return list.map(g=>({...g,items:g.items.filter(x=>!q||x.label.toLowerCase().includes(q)||x.value.includes(q)||String(x.tags||'').toLowerCase().includes(q))})).filter(g=>g.items.length)
})
function place(){const r=props.anchor?.getBoundingClientRect?.();const w=Math.min(400,innerWidth-24);const estimated=Math.min(520,innerHeight-24);const natural=(r?.bottom??80)+10;const top=Math.max(12,Math.min(natural,innerHeight-estimated-12));placement.value={position:'fixed',width:w+'px',left:Math.max(12,Math.min(r?.left??(innerWidth-w)/2,innerWidth-w-12))+'px',top:top+'px',maxHeight:'calc(100dvh - 24px)'}}
watch(tab,value=>{if(value==='图标'||value==='实心')ensureIconPaths()},{immediate:true})
onMounted(()=>{place();const cur=String(props.current||'');const fill=cur.includes('weight=fill');tab.value=cur.startsWith('glass:')?'玻璃':cur.startsWith('icon:')?(fill?'实心':'图标'):cur.startsWith('nucleo:')?'Nucleo':/^(data:|\/|https?:\/\/)/.test(cur)?'上传':'表情符号';const q=cur.indexOf('?')>=0?new URLSearchParams(cur.slice(cur.indexOf('?')+1)):null;if(cur.startsWith('glass:')){const h=q?.get('hue')||'0';glassHue.value=({'198':'145','216':'158','234':'170','252':'178','180':'158'})[h]||h}else if(cur.startsWith('icon:'))iconTint.value=q?.get('color')||'';window.addEventListener('resize',place);nextTick(()=>search.value?.focus());fetch(API_BASE+'/api/icon-history').then(r=>r.json()).then(json=>{if(json.ok&&Array.isArray(json.data))customIcons.value=json.data}).catch(()=>{})});onBeforeUnmount(()=>window.removeEventListener('resize',place))
async function choose(value){if(busy.value)return;const chosen=previewValue(value);busy.value=true;error.value='';try{if(chosen.startsWith('data:image/png;base64,')&&!customIcons.value.includes(chosen)){const response=await fetch(API_BASE+'/api/icon-history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:chosen})});const json=await response.json();if(json.ok)customIcons.value=json.data;else if(response.status!==403)throw Error(json.error||'图标历史保存失败')}await props.save(chosen);if(chosen&&!chosen.startsWith('data:')){recent.value=[chosen,...recent.value.filter(x=>variantKey(x)!==variantKey(chosen))].slice(0,16);storageSet('reader:recent-icons',JSON.stringify(recent.value))}visible.value=false}catch(e){error.value=e.message}finally{busy.value=false}}
function shuffle(){const items=groups.value.flatMap(g=>g.items);if(items.length)choose(items[Math.floor(Math.random()*items.length)].value)}
async function upload(e){const f=e.target.files?.[0];if(!f)return;try{if(f.size>10*1024*1024)throw Error('请选择小于 10 MB 的图片');const bitmap=await createImageBitmap(f);const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');const scale=Math.min(128/bitmap.width,128/bitmap.height);c.drawImage(bitmap,(128-bitmap.width*scale)/2,(128-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);bitmap.close();await choose(canvas.toDataURL('image/png'))}catch(e){error.value=e.message}}
</script>
<style scoped>
.picker-dismiss{position:fixed;inset:0;z-index:2200}
.icon-picker.reader-dialog{padding:0 12px 10px;display:flex;flex-direction:column;border:1px solid var(--c-line);border-radius:16px!important;max-height:calc(100dvh - 24px)}
.picker-tabs{display:flex;align-items:center;gap:12px;margin:0 -12px;padding:0 12px;border-bottom:1px solid var(--c-line);overflow-x:auto;scrollbar-width:none}.picker-tabs::-webkit-scrollbar{display:none}
.picker-tabs button{position:relative;padding:11px 0 8px;color:var(--c-sub);font-size:12.5px;white-space:nowrap;transition:color 160ms ease}
.picker-tabs button::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--c-ink);transform:scaleX(0);transform-origin:left;transition:transform 220ms var(--motion-pop)}
.picker-tabs button.is-on{color:var(--c-ink)}
.picker-tabs button.is-on::after{transform:scaleX(1)}
.picker-tabs button:hover{color:var(--c-ink)}
.picker-tabs .picker-remove{margin-left:auto;color:var(--c-sub);font-size:11px;padding-right:1px}
.picker-tabs .picker-remove::after{display:none}
.picker-tabs .picker-remove:hover{color:var(--c-ink)}
.picker-tools{display:flex;align-items:center;gap:6px;margin:10px 0 2px}
.picker-tint{display:flex;align-items:center;gap:6px;min-height:24px;margin:0 0 1px;padding:0 2px}
.picker-tint span{margin-right:2px;color:var(--c-sub);font-size:11px}
.picker-tint button{width:16px;height:16px;flex:none;border-radius:50%;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c-ink) 14%,transparent);transition:transform 160ms var(--motion-snap),box-shadow 160ms var(--motion-snap)}
.picker-tint button:hover{transform:scale(1.12)}
.picker-tint button.on{box-shadow:0 0 0 2px var(--c-pop),0 0 0 3px var(--c-ink)}
.picker-search{flex:1;min-width:0;display:flex;align-items:center;gap:7px;height:32px;padding:0 9px;border:1px solid var(--c-line);border-radius:8px;background:var(--c-field)}
.picker-search svg{flex:none;color:var(--c-faint)}
.picker-search input,.picker-search input:not([type=checkbox]):not([type=file]):not([type=range]){flex:1;min-width:0;width:auto!important;height:auto!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;outline:none;color:var(--c-ink);font:inherit;font-size:12px;padding:0!important;margin:0!important}
.picker-search:focus-within{border-color:var(--c-ink);box-shadow:0 0 0 1px var(--c-ink)}
.picker-shuffle{flex:none;width:32px;height:32px;border:1px solid var(--c-line);border-radius:8px;color:var(--c-sub)}
.picker-shuffle:hover:not(:disabled){background:var(--c-hover);color:var(--c-ink)}
.picker-scroll{height:260px;max-height:44dvh;overflow:auto;padding:0 3px 6px 0;scrollbar-width:thin;mask-image:linear-gradient(to bottom,#000 calc(100% - 22px),transparent 100%);-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 22px),transparent 100%)}
.picker-scroll p{margin:11px 4px 5px;color:var(--c-sub);font-size:11px}
.picker-scroll p:first-child{margin-top:10px}
.icon-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(32px,1fr));gap:2px}
.icon-grid button{position:relative;height:32px;display:grid;place-items:center;border-radius:8px;color:var(--c-text);transition:background .12s ease,transform .12s ease}
.icon-grid button:hover:not(:disabled){background:var(--c-hover)}
.icon-grid button:active:not(:disabled){transform:scale(.94)}
.icon-grid button.selected{background:var(--c-hover);color:var(--c-ink);box-shadow:inset 0 0 0 1px var(--c-line)}
.icon-grid button:disabled{opacity:.5;cursor:default}
.icon-check{position:absolute;right:2px;bottom:2px;display:grid;place-items:center;width:12px;height:12px;border-radius:50%;background:var(--c-ink);color:var(--c-pop);box-shadow:0 1px 2px #0002;pointer-events:none;animation:icon-check-in 180ms var(--motion-pop) both}
.picker-empty{margin:24px 4px;text-align:center;color:var(--c-faint)}
.picker-categories{display:flex;flex-wrap:wrap;align-items:center;gap:1px;margin:6px -12px 0;padding:6px 12px 0;border-top:1px solid var(--c-line)}
.picker-categories button{display:grid;place-items:center;width:24px;height:24px;padding:0;border-radius:6px;font-size:13px}
.picker-categories button:hover,.picker-categories button.selected{background:var(--c-hover)}
.picker-categories button:last-child{width:auto;margin-left:auto;padding:0 6px;font-size:10.5px;color:var(--c-sub)}
.icon-upload{text-align:center;padding:22px 0 8px}
.icon-upload>svg{margin:auto;color:var(--c-faint)}
.uploaded-icons{text-align:left;margin:0 0 22px}
.uploaded-icons p{margin:0 0 8px;color:var(--c-sub);font-size:12px}
.uploaded-icons .icon-grid{grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:4px}
.uploaded-icons .icon-grid button{background:var(--c-field)}
@media(max-width:480px){.icon-picker{padding:0 12px 10px}.picker-tabs{gap:12px;margin:0 -12px;padding:0 12px}.picker-tabs button{font-size:12px}.picker-tabs .picker-remove{font-size:10.5px}.picker-categories{margin:6px -12px 0;padding:6px 12px 0}.picker-search{height:30px}.picker-shuffle{width:30px;height:30px}.picker-scroll{height:240px}}
</style>
