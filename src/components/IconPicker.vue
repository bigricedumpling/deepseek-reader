<template><Teleport to="body"><Transition name="pop" appear @after-leave="$emit('close')"><div v-if="visible" class="picker-dismiss" @pointerdown.self="dismiss"><section ref="dialog" tabindex="-1" class="icon-picker reader-dialog" :style="placement" role="dialog" aria-modal="true" aria-label="选择图标">
  <header class="picker-header"><div class="picker-tabs" role="tablist" aria-label="图标来源" @keydown="navigateTabs">
    <button v-for="t in TABS" :key="t" role="tab" :tabindex="tab === t ? 0 : -1" :class="{ 'is-on': tab === t }" :aria-selected="tab === t" @click="tab=t;query='';category=''">{{t}}</button>
  </div>
    <button v-if="current" class="picker-remove" :disabled="busy" @click="choose('')">移除</button>
    <button type="button" class="picker-close" aria-label="关闭" :disabled="busy" @click="dismiss"><PhX :size="16" /></button>
  </header>
  <template v-if="tab!=='上传'">
    <div class="picker-tools">
      <label class="picker-search"><PhMagnifyingGlass :size="14"/><input :autofocus="focusSearch" v-model="query" placeholder="搜索图标" aria-label="搜索图标"/></label>
      <button class="icon-btn picker-shuffle" :disabled="busy" title="随机选择" aria-label="随机选择" @click="shuffle"><PhShuffle :size="15"/></button>
    </div>
    <div class="picker-scroll" @keydown="moveInGrid">
      <template v-for="(group, groupIndex) in groups" :key="group.name"><p>{{ group.name }}</p>
      <div class="icon-grid" role="group" :aria-label="group.name"><button v-for="(item, index) in group.items"
        :tabindex="cursor.group === groupIndex && cursor.index === index ? 0 : -1" @focus="cursor = { group: groupIndex, index }" :key="item.value" :class="{ selected: variantKey(item.value) === currentKey }" :title="item.label" :aria-label="item.label" :aria-pressed="variantKey(item.value) === currentKey" :disabled="busy" @click="choose(item.value)"><ContentIcon :value="iconValue(item.value)" :size="24"/><span v-if="variantKey(item.value) === currentKey" class="icon-check"><PhCheck :size="10" weight="bold"/></span></button></div></template><p v-if="!groups.length" class="picker-empty">没有匹配的图标</p></div>
    <footer v-if="tab==='表情符号'" class="picker-categories"><button v-for="g in emojiGroups" :key="g.name" :title="g.name" :class="{selected:category===g.name}" @click="category=category===g.name?'':g.name;query=''">{{g.icon}}</button><button :class="{selected:!category}" @click="category='';query=''">全部</button></footer>
  </template>
  <div v-else class="icon-upload"><div v-if="customIcons.length" class="uploaded-icons"><p>已上传</p><div class="icon-grid" role="group" aria-label="已上传" @keydown="moveInGrid"><button v-for="(icon, index) in customIcons" :tabindex="cursor.index === index ? 0 : -1" @focus="cursor = { group: 0, index }" :aria-label="'已上传的图标 ' + (index + 1)" :key="icon" type="button" :class="{ selected: baseValue(icon) === currentBase }" title="使用已上传的图标" :aria-pressed="baseValue(icon) === currentBase" :disabled="busy" @click="choose(icon)"><ContentIcon :value="icon" :size="24" /><span v-if="icon === current" class="icon-check"><PhCheck :size="10" weight="bold"/></span></button></div></div><PhImage :size="38"/><button class="reader-button" type="button" :disabled="busy" @click="uploadInput.click()">选择图片</button><input ref="uploadInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="upload"/><p>PNG、JPEG、WebP 或 GIF，最大 10 MB</p></div>
  <p v-if="error" class="reader-error" role="alert">{{error}}</p>
</section></div></Transition></Teleport></template>
<script setup>
const visible=ref(true)
import {ref,computed,watch,onMounted,toRef} from 'vue'
import {PhMagnifyingGlass,PhShuffle,PhImage,PhCheck,PhX} from '../icons/remix'
import { navigateTabs } from '../utils/navigate-tabs'
import { useDialogFocus } from '../composables/useDialogFocus'
import { usePickerPlacement } from '../composables/usePickerPlacement'
import ContentIcon from './ContentIcon.vue'
import {lineIcons,solidIcons,emojiGroups,ensureIconPaths} from '../utils/icon-catalog'
import {nucleoIconGroups} from '../utils/nucleo-icons'
import {glassIcons} from '../utils/glass-icons'
import {API_BASE} from '../utils/api'
import {storageJSON,storageSet} from '../utils/storage'
const iconLabel=Object.fromEntries([...lineIcons,...solidIcons,...glassIcons,...nucleoIconGroups.flatMap(g=>g.items)].map(x=>[x.value,x.label]))
const props=defineProps({save:Function,anchor:Object,current:{type:String,default:''}});const emit=defineEmits(['close'])
const TABS=['表情符号','图标','实心','Nucleo','玻璃','上传']
const query=ref(''),busy=ref(false),error=ref(''),tab=ref('表情符号'),category=ref(''),recent=ref([]),customIcons=ref([])
try{const seen=new Set();recent.value=storageJSON('reader:recent-icons',[]).filter(x=>typeof x==='string').filter(x=>{const base=variantKey(x);if(seen.has(base))return false;seen.add(base);return true}).slice(0,16);storageSet('reader:recent-icons',JSON.stringify(recent.value))}catch{}
const currentBase=computed(()=>baseValue(props.current))
const currentKey=computed(()=>variantKey(props.current))
function baseValue(value){return String(value||'').split('?')[0]}
function variantKey(value){const s=String(value||'');return s.split('?')[0]+(s.includes('weight=fill')?'?weight=fill':'')}
// Reselecting an existing icon preserves the color stored with that document.
function iconValue(value) {
  return value && value === currentKey.value ? props.current : value
}
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
const dialog = ref(null)
const placement = usePickerPlacement(dialog, toRef(props, 'anchor'), 400)
const focusSearch = !window.matchMedia('(pointer: coarse)').matches
const uploadInput = ref(null)
const cursor = ref({ group: 0, index: 0 })
function dismiss() {
  if (!busy.value) visible.value = false
}
useDialogFocus(visible, dialog, dismiss, () => props.anchor)

watch([groups, tab, customIcons], () => {
  const group = groups.value.findIndex(g => g.items.some(item => variantKey(item.value) === currentKey.value))
  const index = tab.value === '上传' ? customIcons.value.indexOf(props.current)
    : group < 0 ? 0 : groups.value[group].items.findIndex(item => variantKey(item.value) === currentKey.value)
  cursor.value = { group: Math.max(0, group), index: Math.max(0, index) }
}, { immediate: true })

function moveInGrid(event) {
  const buttons = [...dialog.value.querySelectorAll('.icon-grid button:not(:disabled)')]
  const index = buttons.indexOf(event.target)
  if (index < 0) return
  let next
  switch (event.key) {
    case 'Home': next = buttons[0]; break
    case 'End': next = buttons.at(-1); break
    case 'ArrowLeft': next = buttons[index - 1]; break
    case 'ArrowRight': next = buttons[index + 1]; break
    case 'ArrowUp':
    case 'ArrowDown': {
      const here = buttons[index].getBoundingClientRect()
      const direction = event.key === 'ArrowUp' ? -1 : 1
      let rowDistance = Infinity, columnDistance = Infinity
      for (const button of buttons) {
        const rect = button.getBoundingClientRect()
        const dy = (rect.top - here.top) * direction
        const dx = Math.abs(rect.left - here.left)
        if (dy > 1 && (dy < rowDistance || (dy === rowDistance && dx < columnDistance))) {
          next = button
          rowDistance = dy
          columnDistance = dx
        }
      }
      break
    }
    default: return
  }
  event.preventDefault()
  next?.focus()
}
watch(tab,value=>{if(value==='图标'||value==='实心')ensureIconPaths()},{immediate:true})
onMounted(() => {
  const current = props.current
  if (current.startsWith('glass:')) tab.value = '玻璃'
  else if (current.startsWith('icon:')) tab.value = current.includes('weight=fill') ? '实心' : '图标'
  else if (current.startsWith('nucleo:')) tab.value = 'Nucleo'
  else if (/^(data:|\/|https?:\/\/)/.test(current)) tab.value = '上传'
  fetch(API_BASE + '/api/icon-history')
    .then(response => response.json())
    .then(json => { if (json.ok && Array.isArray(json.data)) customIcons.value = json.data })
    .catch(() => {})
})
async function choose(value){if(busy.value)return;const chosen=iconValue(value);busy.value=true;error.value='';try{if(chosen.startsWith('data:image/png;base64,')&&!customIcons.value.includes(chosen)){const response=await fetch(API_BASE+'/api/icon-history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:chosen})});const json=await response.json();if(json.ok)customIcons.value=json.data;else if(response.status!==403)throw Error(json.error||'图标历史保存失败')}await props.save(chosen);if(chosen&&!chosen.startsWith('data:')){recent.value=[chosen,...recent.value.filter(x=>variantKey(x)!==variantKey(chosen))].slice(0,16);storageSet('reader:recent-icons',JSON.stringify(recent.value))}visible.value=false}catch(e){error.value=e.message}finally{busy.value=false}}
function shuffle(){const items=groups.value.flatMap(g=>g.items);if(items.length)choose(items[Math.floor(Math.random()*items.length)].value)}
async function upload(e){const f=e.target.files?.[0];if(!f)return;try{if(f.size>10*1024*1024)throw Error('请选择小于 10 MB 的图片');const bitmap=await createImageBitmap(f);const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');const scale=Math.min(128/bitmap.width,128/bitmap.height);c.drawImage(bitmap,(128-bitmap.width*scale)/2,(128-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);bitmap.close();await choose(canvas.toDataURL('image/png'))}catch(e){error.value=e.message}}
</script>
<style scoped>
.picker-dismiss{position:fixed;inset:0;z-index:2200}
.icon-picker.reader-dialog{padding:0 12px 10px;display:flex;flex-direction:column;border:1px solid var(--c-line);max-height:calc(100dvh - 24px)}
.icon-picker > .picker-header { margin:0; display:flex; align-items:center; gap:4px; padding-top:5px; flex:none; min-width:0; }
.picker-tabs { flex:1; min-width:0; display:flex; gap:2px; overflow-x:auto; overscroll-behavior-inline:contain; scrollbar-width:none; }
.picker-tabs button,.picker-remove,.picker-close { flex:none; padding:5px 7px; min-height:32px; border-radius:var(--radius-row); color:var(--c-sub); white-space:nowrap; font-size:12px; }
.picker-tabs button:focus-visible { outline:2px solid var(--c-focus); outline-offset:-2px; }
.picker-tabs button.is-on { background:var(--c-active); color:var(--c-ink); }
.picker-header button:hover { background:var(--c-hover); }
.picker-close { width:32px; display:grid; place-items:center; padding:0; }
.picker-tools{display:flex;align-items:center;gap:6px;margin:10px 0 2px}
.icon-picker .picker-search{display:flex;margin:0;flex:1;min-width:0;display:flex;align-items:center;gap:7px;height:32px;padding:0 9px;border:1px solid var(--c-line);border-radius:8px;background:var(--c-field)}
.picker-search svg{flex:none;color:var(--c-faint)}
.picker-search input,.picker-search input:not([type=checkbox]):not([type=file]):not([type=range]){flex:1;min-width:0;width:auto!important;height:auto!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;outline:none;color:var(--c-ink);font:inherit;font-size:12px;padding:0!important;margin:0!important}
.picker-search:focus-within{border-color:var(--c-ink);box-shadow:0 0 0 1px var(--c-ink)}
.picker-shuffle{flex:none;width:32px;height:32px;border:1px solid var(--c-line);border-radius:8px;color:var(--c-sub)}
.picker-shuffle:hover:not(:disabled){background:var(--c-hover);color:var(--c-ink)}
.picker-scroll{height:260px;max-height:44dvh;overflow:auto;padding:0 3px 6px 0;scrollbar-width:thin}
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
.picker-categories{display:flex;flex-wrap:wrap;align-items:center;gap:1px;margin:6px -12px 0;padding:6px 12px 0}
.picker-categories button{display:grid;place-items:center;width:24px;height:24px;padding:0;border-radius:6px;font-size:13px}
.picker-categories button:hover,.picker-categories button.selected{background:var(--c-hover)}
.picker-categories button:last-child{width:auto;margin-left:auto;padding:0 6px;font-size:10.5px;color:var(--c-sub)}
.icon-upload{min-height:0;overflow:auto;text-align:center;padding:22px 0 8px}
.icon-upload>svg{margin:auto;color:var(--c-faint)}
.uploaded-icons{text-align:left;margin:0 0 22px}
.uploaded-icons p{margin:0 0 8px;color:var(--c-sub);font-size:12px}
.uploaded-icons .icon-grid{grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:4px}
.uploaded-icons .icon-grid button{background:var(--c-field)}
@media (pointer:coarse) {
 .picker-header button,.picker-shuffle { min-width:44px; min-height:44px; }
 .picker-search { height:44px; }
 .icon-grid,.uploaded-icons .icon-grid { grid-template-columns:repeat(auto-fill,minmax(44px,1fr)); }
 .icon-grid button,.uploaded-icons .icon-grid button { height:44px; }
 .picker-categories { flex-wrap:nowrap; overflow:auto; scrollbar-width:none; }
 .picker-categories button { min-width:44px; min-height:44px; flex:none; }
}
.icon-picker.reader-dialog { overflow:auto; }
.picker-scroll { min-height:44px; overscroll-behavior:contain; }
</style>
