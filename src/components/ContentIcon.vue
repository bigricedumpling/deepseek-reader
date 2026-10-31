<template><svg v-if="base === 'icon:draft'" class="content-icon" :style="{fontSize:size+'px'}" :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4.5h10.5L20 9v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-13A2 2 0 0 1 5 4.5Z" fill="currentColor" opacity=".24"/><path d="M15.5 4.5V9H20M8 13h8M8 16h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><img v-else-if="image" :src="source" alt="" loading="lazy" decoding="async" class="content-icon" :style="imageStyle" /><svg v-else-if="named" class="content-icon" :style="{fontSize:size+'px'}" :width="size" :height="size" viewBox="0 0 256 256" :fill="tintColor || 'currentColor'" aria-hidden="true" v-html="named[weight] || named.regular" /><span v-else-if="base" class="content-icon emoji" :style="{fontSize:size+'px'}">{{ base }}</span><PhFileText v-else :size="size" weight="fill" :color="tintColor || 'currentColor'" class="content-icon" :style="{fontSize:size+'px'}" /></template>
<script setup>
import {computed,ref,watch} from 'vue'
import {PhFileText} from '../icons/remix'
import {iconPaths,ensureIconPaths} from '../utils/icon-catalog'
import {assetUrl,API_BASE} from '../utils/api'
const props=defineProps({value:{type:String,default:''},size:{type:Number,default:18}})
const raw=computed(()=>String(props.value||''))
const tinted=computed(()=>raw.value.startsWith('icon:')||raw.value.startsWith('glass:'))
const base=computed(()=>tinted.value?raw.value.split('?')[0]:raw.value)
const params=computed(()=>{const i=raw.value.indexOf('?');return new URLSearchParams(tinted.value&&i>=0?raw.value.slice(i+1):'')})
const tintColor=computed(()=>params.value.get('color')||'')
const weight=computed(()=>params.value.get('weight')||'regular')
const tintHue=computed(()=>Number(params.value.get('hue')||0)||0)
const GLASS_FILTERS={
  145:'grayscale(1) sepia(1) saturate(2.6) hue-rotate(145deg) brightness(1.05)',
  158:'grayscale(1) sepia(1) saturate(3) hue-rotate(158deg) brightness(.95)',
  170:'grayscale(1) sepia(1) saturate(3.2) hue-rotate(170deg) brightness(.85)',
  178:'grayscale(1) sepia(1) saturate(3.4) hue-rotate(178deg) brightness(.72)'
}
const GLASS_LEGACY={198:145,216:158,234:170,252:178,180:158}
function glassFilter(hue){const key=GLASS_LEGACY[hue]||hue;return GLASS_FILTERS[key]||('grayscale(1) sepia(1) saturate(2.8) hue-rotate('+key+'deg)')}
const named=ref(null)
function resolveNamed(){
  if(!base.value.startsWith('icon:')||base.value==='icon:draft'){named.value=null;return}
  const token=base.value.slice(5)
  named.value=iconPaths(token)
  if(named.value)return
  /* 非常用图标：等完整表下载完再补渲染，首屏不为它阻塞。 */
  ensureIconPaths().then(()=>{if(base.value==='icon:'+token)named.value=iconPaths(token)})
}
watch(base,resolveNamed,{immediate:true})
const glassName=computed(()=>base.value.startsWith('glass:')?base.value.slice(6):'')
const nucleoName=computed(()=>base.value.startsWith('nucleo:')?base.value.slice(7):'')
const image=computed(()=>base.value==='__SITE_ICON__'||!!glassName.value||!!nucleoName.value||/^(data:image\/|\/|https?:\/\/)/.test(base.value))
const source=computed(()=>glassName.value?API_BASE+'/icons/glass/'+encodeURIComponent(glassName.value)+'.svg':nucleoName.value?API_BASE+'/icons/nucleo/'+nucleoName.value+'.svg':base.value==='__SITE_ICON__'?API_BASE+'/favicon.svg':assetUrl(base.value))
const imageStyle=computed(()=>({fontSize:props.size+'px',filter:glassName.value&&tintHue.value?glassFilter(tintHue.value):undefined,imageRendering:nucleoName.value.startsWith('arcade/')?'pixelated':undefined}))
</script>
<style scoped>.content-icon{display:inline-block;width:1em;height:1em;object-fit:contain;flex-shrink:0;vertical-align:middle}.emoji{line-height:1.1;width:auto}</style>
