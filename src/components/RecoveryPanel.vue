<template>
<Teleport to="body"><Transition name="overlay"><div v-if="open" class="reader-modal-shade" @mousedown.self="close">
<section ref="dialog" tabindex="-1" class="reader-dialog recovery-panel" role="dialog" aria-modal="true" aria-label="恢复与备份">
<header><h2>恢复与备份</h2><button class="btn-icon" title="关闭" :disabled="busy" @click="close"><PhX :size="18" /></button></header>
<div class="recovery-tabs" role="group" aria-label="恢复方式"><button :aria-pressed="tab==='trash'" :disabled="busy" @click="tab='trash'">回收站</button><button v-if="local" :aria-pressed="tab==='backup'" :disabled="busy" @click="tab='backup';loadBackups()">完整备份</button></div>
<p v-if="error" role="alert" class="reader-error">{{ error }}</p><p v-if="message" role="status" class="recovery-message">{{ message }}</p>
<template v-if="tab==='trash'">
<p class="recovery-note">恢复到原位置，默认不公开。</p>
<p v-if="loading">正在读取…</p><p v-else-if="!items.length && !legacyCount" class="empty">回收站是空的</p>
<ul class="recovery-list"><li v-for="item in items" :key="item.id"><component :is="item.kind==='folder'?PhFolder:PhFileText" :size="20"/><div><b>{{ item.original.split('/').pop() }}</b><span>{{ item.original }} · {{ date(item.at) }}</span></div><button :disabled="busy" @click="restoreItem(item.id)">恢复</button></li></ul>
<template v-if="legacyCount"><p class="recovery-note">旧记录没有原路径，请选择恢复位置。</p><ul class="recovery-list"><li v-for="item in legacyItems" :key="item.id"><PhFileText :size="20"/><div><b>{{ item.name }}</b><span>旧回收记录</span></div><button :disabled="busy" @click="chooseLegacy(item)">选择位置</button></li></ul><div v-if="legacyChoice" class="legacy-target"><label>知识库<select v-model="legacyLibrary"><option value="" disabled>选择知识库</option><option v-for="lib in libraries" :key="lib.name" :value="lib.name">{{ lib.name }}</option></select></label><label>名称<input v-model="legacyName" /></label><button :disabled="busy||!legacyLibrary||!legacyName.trim()" @click="restoreLegacy">恢复到这里</button><button @click="legacyChoice=null">取消</button></div></template>
</template>
<template v-else>
<div class="backup-actions"><p class="recovery-note">包含正文、附件、设置和历史，不包含 Agent 授权。</p><button class="reader-button" :disabled="busy" @click="backup('create')">{{ busy ? '正在处理…' : '创建备份' }}</button></div>
<p v-if="!backupItems.length && !loading" class="empty">还没有完整备份</p>
<ul class="recovery-list"><li v-for="item in backupItems" :key="item.id"><PhArchive :size="20"/><div><b>{{ date(item.at) }}</b><span>完整知识库</span></div><button :disabled="busy" @click="backup('restore',item.id)">恢复副本</button></li></ul>
<h3 v-if="restoredItems.length" class="restored-heading">已恢复的副本</h3><ul class="recovery-list"><li v-for="item in restoredItems" :key="item.id"><PhFolder :size="20"/><div><b>{{ date(item.at) }}</b><span>独立资料，可继续阅读和编辑</span></div><button :disabled="busy" @click="openRestored(item.id)">打开</button></li></ul><a v-if="restoredLink" class="restored-link" :href="restoredLink" target="_blank" rel="noopener">打开恢复副本 ↗</a>
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
const dialog=ref(null),tab=ref('trash'),items=ref([]),backupItems=ref([]),restoredItems=ref([]),restoredLink=ref(''),legacyCount=ref(0),loading=ref(false),busy=ref(false),error=ref(''),message=ref('')
const legacyItems=ref([]),legacyChoice=ref(null),legacyLibrary=ref(''),legacyName=ref(''),libraries=ref([])
const local=fileManagerAvailable(),date=value=>new Date(value).toLocaleString()
const post=(route,body)=>readerRequest(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
function close(){if(!busy.value)emit('close')}
useDialogFocus(()=>props.open,dialog,close)
async function loadTrash(){const result=await readerRequest('/trash');items.value=result.items;legacyCount.value=result.legacyCount;legacyItems.value=result.legacyItems||[]}
watch(()=>props.open,async visible=>{if(!visible)return;tab.value='trash';error.value='';message.value='';loading.value=true;try{await loadTrash()}catch(e){error.value=e.message}finally{loading.value=false}})
async function loadBackups(){error.value='';message.value='';loading.value=true;try{const result=await readerRequest('/backups');backupItems.value=result.items;restoredItems.value=result.restored||[]}catch(e){error.value=e.message}finally{loading.value=false}}
async function chooseLegacy(item){legacyChoice.value=item;legacyName.value=item.name;try{libraries.value=(await readerRequest('/libs')).libs}catch(e){error.value=e.message}}
async function restoreLegacy(){busy.value=true;error.value='';try{await post('/trash/restore',{legacyId:legacyChoice.value.id,destination:legacyLibrary.value+'/'+legacyName.value.trim(),requestId:crypto.randomUUID()});legacyChoice.value=null;await loadTrash();message.value='已恢复到所选知识库';emit('restored')}catch(e){error.value=e.message}finally{busy.value=false}}
async function restoreItem(id){busy.value=true;error.value='';message.value='';try{const result=await post('/trash/restore',{trashId:id,requestId:crypto.randomUUID()});await loadTrash();message.value='已恢复：'+result.path;emit('restored')}catch(e){error.value=e.message}finally{busy.value=false}}
async function openRestored(id){busy.value=true;error.value='';try{const data=await post('/backups',{action:'open',restoredId:id});restoredLink.value=data.url}catch(e){error.value=e.message}finally{busy.value=false}}
async function backup(action,id){busy.value=true;error.value='';message.value='';try{const result=await post('/backups',{action,backupId:id});await loadBackups();if(action==='restore')await openRestored(result.restoredId);message.value=action==='create'?'备份已创建':action==='restore'?'恢复副本已保存，可在新窗口打开。':''}catch(e){error.value=e.message}finally{busy.value=false}}
</script>
<style scoped>
.restored-heading{font-size:13px;margin:4px 0 0}.restored-link{color:var(--color-ds);font-size:13px;align-self:flex-start}.legacy-target{display:grid;gap:10px;padding:12px;background:var(--c-field);border-radius:10px}.legacy-target label{font-size:12px;display:grid;gap:6px}.legacy-target input,.legacy-target select{padding:8px;border-radius:6px;background:var(--c-surface);color:var(--c-ink)}.legacy-target button{font-size:12px;padding:6px}.recovery-panel{width:min(620px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:24px;display:flex;flex-direction:column;gap:16px}.recovery-panel header,.backup-actions,footer{display:flex;align-items:center;justify-content:space-between;gap:16px}h2{font-size:16px;margin:0}.recovery-tabs{display:flex;gap:4px;background:var(--c-field);border-radius:10px;padding:4px;align-self:flex-start}.recovery-tabs button{padding:7px 14px;border-radius:7px;font-size:13px}.recovery-tabs button[aria-pressed=true]{background:var(--c-surface);color:var(--color-ds)}.recovery-note,footer,.recovery-message{font-size:12px;color:var(--c-sub);margin:0}.recovery-message{overflow-wrap:anywhere}.recovery-list{list-style:none;padding:0;margin:0;overflow:auto;min-height:0;max-height:50dvh}.recovery-list li{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--c-field)}li div{flex:1;min-width:0}li b{display:block;font-size:13px;font-weight:500;overflow-wrap:anywhere}li span{display:block;font-size:11px;color:var(--c-sub);overflow-wrap:anywhere;margin-top:4px}li button,footer button{flex-shrink:0;font-size:12px;color:var(--color-ds);padding:6px 8px}.empty{padding:24px;text-align:center;color:var(--c-sub);font-size:13px}button:disabled{opacity:.45;cursor:default}.backup-actions>.reader-button{flex-shrink:0}@media(max-width:480px){.recovery-panel{padding:18px}.backup-actions{align-items:flex-start}footer{align-items:flex-start}}
</style>
