<template><img v-if="image" :src="assetUrl(value)" alt="" class="content-icon" :style="{fontSize:size+'px'}" /><component v-else-if="named" :is="named" :size="size" weight="fill" class="content-icon" :style="{fontSize:size+'px'}" /><span v-else-if="value" class="content-icon emoji" :style="{fontSize:size+'px'}">{{ value }}</span><PhFileText v-else :size="size" weight="fill" class="content-icon" :style="{fontSize:size+'px'}" /></template>
<script setup>
import {computed} from 'vue'
import {PhFileText} from '@phosphor-icons/vue'
import {iconNames} from '../utils/icon-catalog'
import {assetUrl} from '../utils/api'
const props=defineProps({value:{type:String,default:''},size:{type:Number,default:18}})
const named=computed(()=>iconNames[props.value.replace('icon:','')])
const image=computed(()=>/^(data:image\/|\/|https?:\/\/)/.test(props.value))
</script>
<style scoped>.content-icon{display:inline-block;width:1em;height:1em;object-fit:contain;flex-shrink:0;vertical-align:middle}.emoji{line-height:1.1;width:auto}</style>
