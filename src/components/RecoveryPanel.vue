<template>
<Teleport to="body"><Transition name="overlay"><div v-if="open" class="reader-modal-shade" @mousedown.self="close">
<section ref="dialog" tabindex="-1" class="reader-dialog recovery-panel" role="dialog" aria-modal="true" aria-label="恢复与备份">
<header><h2>恢复与备份</h2><button class="btn-icon" title="关闭" :disabled="busy" @click="close"><PhX :size="18" /></button></header>
<div class="recovery-tabs" role="group" aria-label="恢复方式"><button :aria-pressed="tab==='trash'" :disabled="busy" @click="tab='trash'">回收站</button><button v-if="local" :aria-pressed="tab==='backup'" :disabled="busy" @click="tab='backup';loadBackups()">完整备份</button></div>
<p v-if="error" role="alert" class="reader-error">{{ error }}</p><p v-if="message" role="status" class="recovery-message">{{ message }}</p>
<template v-if="tab==='trash'">
<p class="recovery-note">恢复到原位置，默认不公开。</p>
<p v-if="loading">正在读取…</p><p v-else-if="!items.length" class="empty">回收站是空的</p>
<ul class="recovery-list"><li v-for="item in items" :key="item.id"><component :is="item.kind==='folder'?PhFolder:PhFileText" :size="20"/><div><b>{{ item.original.split('/').pop() }}</b><span>{{ item.original }} · {{ date(item.at) }}</span></div><button :disabled="busy" @click="restoreItem(item.id)">恢复</button></li></ul>
<p v-if="legacyCount" class="recovery-note">{{ legacyCount }} 项旧记录缺少原路径，仍保留在知识库的 .回收站 文件夹。</p>
</template>
<template v-else>
<div class="backup-actions"><p class="recovery-note">包含正文、附件、设置和历史，不包含 Agent 授权。</p><button class="reader-button" :disabled="busy" @click="backup('create')">{{ busy ? '正在处理…' : '创建备份' }}</button></div>
<p v-if="!backupItems.length && !loading" class="empty">还没有完整备份</p>
<ul class="recovery-list"><li v-for="item in backupItems" :key="item.id"><PhArchive :size="20"/><div><b>{{ date(item.at) }}</b><span>完整知识库</span></div><button :disabled="busy" @click="backup('restore',item.id)">恢复副本</button></li></ul>
<footer><span>恢复副本不会替换当前知识库。</span><button :disabled="busy" @click="backup('reveal')">{{ fileManagerLabel() }}</button></footer>
</template>
</section></div></Transition></Teleport>
</template>
<script setup>
import {ref,watch} from 'vue'
import {PhX,PhFolder,PhFileText,PhArchive} from '@phosphor-icons/vue'
import {readerRequest} from '../contracts/reader'
import {useDialogFocus} from '../composables/useDialogFocus'
import {fileManagerAvailable,fileManagerLabel} from '../utils/reveal'
const props=defineProps({open:Boolean}), emit=defineEmits(['close','restored'])
const dialog=ref(null),tab=ref('trash'),items=ref([]),backupItems=ref([]),legacyCount=ref(0),loading=ref(false),busy=ref(false),error=ref(''),message=ref('')
const local=fileManagerAvailable(),date=value=>new Date(value).toLocaleString()
const post=(route,body)=>readerRequest(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
function close(){if(!busy.value)emit('close')}
useDialogFocus(()=>props.open,dialog,close)
async function loadTrash(){const result=await readerRequest('/trash');items.value=result.items;legacyCount.value=result.legacyCount}
watch(()=>props.open,async visible=>{if(!visible)return;tab.value='trash';error.value='';message.value='';loading.value=true;try{await loadTrash()}catch(e){error.value=e.message}finally{loading.value=false}})
async function loadBackups(){error.value='';message.value='';loading.value=true;try{backupItems.value=(await readerRequest('/backups')).items}catch(e){error.value=e.message}finally{loading.value=false}}
async function restoreItem(id){busy.value=true;error.value='';message.value='';try{const result=await post('/trash/restore',{trashId:id,requestId:crypto.randomUUID()});await loadTrash();message.value='已恢复：'+result.path;emit('restored')}catch(e){error.value=e.message}finally{busy.value=false}}
async function backup(action,id){busy.value=true;error.value='';message.value='';try{const result=await post('/backups',{action,backupId:id});await loadBackups();message.value=action==='create'?'备份已创建':action==='restore'?'恢复副本已保存，可在文件管理器查看。':''}catch(e){error.value=e.message}finally{busy.value=false}}
</script>
<style scoped>
.recovery-panel{width:min(620px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:24px;display:flex;flex-direction:column;gap:16px}.recovery-panel header,.backup-actions,footer{display:flex;align-items:center;justify-content:space-between;gap:16px}h2{font-size:16px;margin:0}.recovery-tabs{display:flex;gap:4px;background:var(--c-field);border-radius:10px;padding:4px;align-self:flex-start}.recovery-tabs button{padding:7px 14px;border-radius:7px;font-size:13px}.recovery-tabs button[aria-pressed=true]{background:var(--c-surface);color:var(--color-ds)}.recovery-note,footer,.recovery-message{font-size:12px;color:var(--c-sub);margin:0}.recovery-message{overflow-wrap:anywhere}.recovery-list{list-style:none;padding:0;margin:0;overflow:auto;min-height:0;max-height:50dvh}.recovery-list li{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--c-field)}li div{flex:1;min-width:0}li b{display:block;font-size:13px;font-weight:500;overflow-wrap:anywhere}li span{display:block;font-size:11px;color:var(--c-sub);overflow-wrap:anywhere;margin-top:4px}li button,footer button{flex-shrink:0;font-size:12px;color:var(--color-ds);padding:6px 8px}.empty{padding:24px;text-align:center;color:var(--c-sub);font-size:13px}button:disabled{opacity:.45;cursor:default}.backup-actions>.reader-button{flex-shrink:0}@media(max-width:480px){.recovery-panel{padding:18px}.backup-actions{align-items:flex-start}footer{align-items:flex-start}}
</style>
