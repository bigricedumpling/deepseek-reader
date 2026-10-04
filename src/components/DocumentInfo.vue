<template><Teleport to="body"><Transition name="overlay"><div v-if="open" class="reader-modal-shade" @mousedown.self="emit('close')"><section ref="dialog" tabindex="-1" class="reader-dialog document-info" role="dialog" aria-modal="true" aria-label="文档信息"><header><h2>文档信息</h2><button class="btn-icon" title="关闭" @click="emit('close')"><PhX :size="18"/></button></header><dl><dt>位置</dt><dd>{{ path }}</dd><dt>内容类型</dt><dd>{{ /\.pdf$/i.test(path)?'PDF 预览':/\.html?$/i.test(path)?'H5 预览':'Markdown 文档' }}</dd><dt>保存方式</dt><dd>{{ collected?'已收录的独立副本':'本地文件' }}</dd></dl><p v-if="error" role="alert">{{ error }}</p><h3 v-if="sources.length">来源</h3><ul><li v-for="source in sources" :key="source.id"><b>{{ source.workspace || labels[source.kind] || '来源记录' }}</b><span>{{ source.reference }}</span><small>{{ new Date(source.at).toLocaleString() }}</small><p v-if="source.note">{{ source.note }}</p></li></ul></section></div></Transition></Teleport></template>
<script setup>
import {computed,ref,watch} from 'vue'
import {PhX} from '@phosphor-icons/vue'
import {readerRequest} from '../contracts/reader'
import {useDialogFocus} from '../composables/useDialogFocus'
const props=defineProps({open:Boolean,path:String}),emit=defineEmits(['close'])
const dialog=ref(null),sources=ref([]),error=ref(''),labels={'workspace-file':'工作区文件',conversation:'Agent 对话',import:'导入',manual:'手动记录'}
const collected=computed(()=>sources.value.some(source=>source.kind==='workspace-file'))
let generation=0
useDialogFocus(()=>props.open,dialog,()=>emit('close'))
watch(()=>[props.open,props.path],async()=>{const current=++generation;sources.value=[];error.value='';if(!props.open)return;try{const data=await readerRequest('/sources?path='+encodeURIComponent(props.path));if(current===generation)sources.value=data.sources}catch(e){if(current===generation)error.value=e.message}})
</script>
<style scoped>.document-info{width:min(520px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:24px}header{display:flex;align-items:center;justify-content:space-between}h2{font-size:16px}dl{display:grid;grid-template-columns:72px 1fr;gap:12px;font-size:13px}dt,.info-note,small{color:var(--c-sub)}dd{margin:0;overflow-wrap:anywhere}h3{font-size:13px;margin-top:24px}ul{list-style:none;padding:0}li{padding:10px 0;border:0}li b,li span,li small{display:block;overflow-wrap:anywhere}li b{font-size:13px;font-weight:500}li span,.info-note,li p{font-size:12px;line-height:1.7}li small{font-size:11px;margin-top:4px}</style>
