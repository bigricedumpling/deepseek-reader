<template><svg v-if="value === 'icon:draft'" class="content-icon" :style="{fontSize:size+'px'}" :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4.5h10.5L20 9v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-13A2 2 0 0 1 5 4.5Z" fill="currentColor" opacity=".24"/><path d="M15.5 4.5V9H20M8 13h8M8 16h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><img v-else-if="image" :src="value === '__SITE_ICON__' ? API_BASE + '/favicon.svg' : assetUrl(value)" alt="" class="content-icon" :style="{fontSize:size+'px'}" /><component v-else-if="named" :is="named" :size="size" weight="fill" class="content-icon" :style="{fontSize:size+'px'}" /><span v-else-if="value" class="content-icon emoji" :style="{fontSize:size+'px'}">{{ value }}</span><PhFileText v-else :size="size" weight="fill" class="content-icon" :style="{fontSize:size+'px'}" /></template>
<script setup>
import {computed} from 'vue'
import {PhFileText} from '@phosphor-icons/vue'
import {iconNames} from '../utils/icon-catalog'
import {assetUrl,API_BASE} from '../utils/api'
const props=defineProps({value:{type:String,default:''},size:{type:Number,default:18}})
const named=computed(()=>iconNames[props.value.replace('icon:','')])
const image=computed(()=>props.value==='__SITE_ICON__'||/^(data:image\/|\/|https?:\/\/)/.test(props.value))
</script>
<style scoped>.content-icon{display:inline-block;width:1em;height:1em;object-fit:contain;flex-shrink:0;vertical-align:middle}.emoji{line-height:1.1;width:auto}</style>
