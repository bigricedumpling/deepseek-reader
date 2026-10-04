<template>
<Teleport to="body"><Transition name="overlay"><div v-if="open" class="reader-modal-shade" @mousedown.self="close">
<section ref="dialog" tabindex="-1" class="reader-dialog recovery-panel" role="dialog" aria-modal="true" :aria-label="tab==='trash'?'回收站':'备份与恢复'">
<header><h2>{{tab==='trash'?'回收站':'备份与恢复'}}</h2><button ref="closeButton" class="btn-icon" title="关闭" :disabled="busy" @click="close"><PhX :size="18" /></button></header>
<p v-if="error" role="alert" class="reader-error">{{ error }}</p><p v-if="message" role="status" class="recovery-message">{{ message }}</p>
<template v-if="tab==='trash'">
<input v-if="items.length || legacyCount" v-model="query" class="recovery-search" type="search" placeholder="搜索已删除的内容" aria-label="搜索已删除的内容" />
<p v-if="loading">正在读取…</p><p v-else-if="!items.length && !legacyCount" class="empty">回收站是空的</p>
<ul v-if="filteredItems.length" class="recovery-list"><li v-for="item in filteredItems" :key="item.id"><component :is="item.kind==='folder'?PhFolder:PhFileText" :size="20"/><div><b>{{ item.original.split('/').pop() }}</b><span>{{ item.original }}<time>{{ date(item.at) }}</time></span></div><button :disabled="busy" @click="restoreItem(item.id)">恢复</button></li></ul>
<p v-if="query && (items.length || legacyCount) && !filteredItems.length && !filteredLegacy.length && !loading" class="empty">没有匹配的内容</p><template v-if="legacyCount"><h3 class="restored-heading">待选择恢复位置</h3><ul class="recovery-list"><li v-for="item in filteredLegacy" :key="item.id"><PhFileText :size="20"/><div><b>{{ item.name }}</b><span>旧回收记录</span></div><button :disabled="busy" @click="chooseLegacy(item)">选择位置</button></li></ul><div v-if="legacyChoice" class="legacy-target"><h3>恢复 {{ legacyChoice.name }}</h3><label>知识库<select v-model="legacyLibrary"><option value="" disabled>选择知识库</option><option v-for="lib in libraries" :key="lib.name" :value="lib.name">{{ lib.name }}</option></select></label><label>名称<input v-model="legacyName" /></label><button :disabled="busy||!legacyLibrary||!legacyName.trim()" @click="restoreLegacy">恢复到这里</button><button @click="legacyChoice=null">取消</button></div></template>
</template>
<template v-else>
<div class="backup-actions"><div><p class="backup-scope">{{ backupLibraries.length }} 个知识库</p></div><button class="reader-button" :disabled="busy" @click="backup('create')">{{ busy ? '正在处理…' : '创建备份' }}</button></div>
<p v-if="loading" role="status">正在读取…</p><p v-if="!backupItems.length && !loading" class="empty">还没有完整备份</p>
<ul class="recovery-list"><li v-for="item in backupItems" :key="item.id"><PhArchive :size="20"/><div><b>{{ date(item.at) }}</b><span>{{ item.libraries ? `${item.libraries.length} 个知识库` : '全部知识库（旧备份）' }}</span><small v-if="item.libraries?.length">{{ item.libraries.join('、') }}</small></div><button :disabled="busy" @click="backup('restore',item.id)">恢复副本</button></li></ul>
<h3 v-if="restoredItems.length" class="restored-heading">已恢复的副本</h3><ul class="recovery-list"><li v-for="item in restoredItems" :key="item.id"><PhFolder :size="20"/><div><b>{{ date(item.at) }}</b></div><a v-if="restoredUrls[item.id]" :href="restoredUrls[item.id]">打开副本 ↗</a><button v-else :disabled="busy" @click="openRestored(item.id)">打开副本</button></li></ul>
<footer><button :disabled="busy" @click="backup('reveal')">{{ fileManagerLabel() }}</button></footer>
</template>
</section></div></Transition></Teleport>
</template>
<script setup>
import {ref,watch,computed,nextTick} from 'vue'
import {PhX,PhFolder,PhFileText,PhArchive} from '@phosphor-icons/vue'
import {readerRequest} from '../contracts/reader'
import {useDialogFocus} from '../composables/useDialogFocus'
import {fileManagerLabel} from '../utils/reveal'
const props=defineProps({open:Boolean,initialTab:{type:String,default:'trash'}}), emit=defineEmits(['close','restored'])
const dialog=ref(null),tab=ref('trash'),items=ref([]),backupItems=ref([]),restoredItems=ref([]),legacyCount=ref(0),loading=ref(false),busy=ref(false),error=ref(''),message=ref('')
const legacyItems=ref([]),legacyChoice=ref(null),legacyLibrary=ref(''),legacyName=ref(''),libraries=ref([])
const closeButton=ref(null)
const backupLibraries=ref([]),query=ref(''),restoredUrls=ref({})
const filteredItems=computed(()=>items.value.filter(item=>item.original.toLowerCase().includes(query.value.trim().toLowerCase())))
const filteredLegacy=computed(()=>legacyItems.value.filter(item=>item.name.toLowerCase().includes(query.value.trim().toLowerCase())))
const date=value=>new Date(value).toLocaleString()
const post=(route,body)=>readerRequest(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
function close(){if(!busy.value)emit('close')}
useDialogFocus(()=>props.open,dialog,close)
async function loadTrash(){const result=await readerRequest('/trash');items.value=result.items;legacyCount.value=result.legacyCount;legacyItems.value=result.legacyItems||[]}
watch(()=>props.open,async visible=>{if(!visible)return;tab.value=props.initialTab;query.value='';legacyChoice.value=null;error.value='';message.value='';loading.value=true;try{if(tab.value==='backup')await loadBackups();else await loadTrash()}catch(e){error.value=e.message}finally{loading.value=false}})
async function loadBackups(){error.value='';message.value='';loading.value=true;try{const result=await readerRequest('/backups');backupLibraries.value=result.libraries||[];backupItems.value=result.items;restoredItems.value=result.restored||[]}catch(e){error.value=e.message}finally{loading.value=false}}
async function chooseLegacy(item){legacyChoice.value=item;legacyName.value=item.name;legacyLibrary.value='';try{libraries.value=(await readerRequest('/libs')).libs}catch(e){error.value=e.message}}
async function restoreLegacy(){busy.value=true;error.value='';try{await post('/trash/restore',{legacyId:legacyChoice.value.id,destination:legacyLibrary.value+'/'+legacyName.value.trim(),requestId:crypto.randomUUID()});legacyChoice.value=null;await loadTrash();message.value='已恢复到所选知识库';emit('restored')}catch(e){error.value=e.message}finally{busy.value=false}}
async function restoreItem(id){busy.value=true;error.value='';message.value='';try{const result=await post('/trash/restore',{trashId:id,requestId:crypto.randomUUID()});await loadTrash();query.value='';message.value='已恢复：'+result.path;emit('restored');await nextTick();closeButton.value?.focus()}catch(e){error.value=e.message}finally{busy.value=false}}
async function openRestored(id, launch=true){busy.value=true;error.value='';try{const data=await post('/backups',{action:'open',restoredId:id});restoredUrls.value[id]=data.url;if(launch)window.location.assign(data.url)}catch(e){error.value=e.message}finally{busy.value=false}}
async function backup(action,id){busy.value=true;error.value='';message.value='';try{const result=await post('/backups',{action,backupId:id});await loadBackups();if(action==='restore')await openRestored(result.restoredId,false);message.value=action==='create'?'备份已创建':action==='restore'?'副本已恢复':''}catch(e){error.value=e.message}finally{busy.value=false}}
</script>
<style scoped>
.restored-heading{font-size:13px;margin:4px 0 0}.restored-link{color:var(--color-ds);font-size:13px;align-self:flex-start}.legacy-target{display:grid;gap:10px;padding:12px;background:var(--c-field);border-radius:10px}.legacy-target label{font-size:12px;display:grid;gap:6px}.legacy-target input,.legacy-target select{padding:8px;border-radius:6px;background:var(--c-surface);color:var(--c-ink)}.legacy-target button{font-size:12px;padding:6px}.recovery-panel{width:min(480px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:24px;display:flex;flex-direction:column;gap:16px}.recovery-panel header,.backup-actions,footer{display:flex;align-items:center;justify-content:space-between;gap:16px}h2{font-size:16px;margin:0}.recovery-tabs{display:flex;gap:4px;background:var(--c-field);border-radius:10px;padding:4px;align-self:flex-start}.recovery-tabs button{padding:7px 14px;border-radius:7px;font-size:13px}.recovery-tabs button[aria-pressed=true]{background:var(--c-surface);color:var(--color-ds)}.recovery-note,footer,.recovery-message{font-size:12px;color:var(--c-sub);margin:0}.recovery-message{overflow-wrap:anywhere}.recovery-list{list-style:none;padding:0;margin:0;overflow:visible;min-height:0}.recovery-list li{display:flex;align-items:center;gap:12px;padding:12px 0;border:0}li div{flex:1;min-width:0}li b{display:block;font-size:13px;font-weight:500;overflow-wrap:anywhere}li span{display:block;font-size:11px;color:var(--c-sub);overflow-wrap:anywhere;margin-top:4px}li button,footer button{flex-shrink:0;font-size:12px;color:var(--color-ds);padding:6px 8px}.empty{padding:24px;text-align:center;color:var(--c-sub);font-size:13px}button:disabled{opacity:.45;cursor:default}.backup-actions>.reader-button{flex-shrink:0}@media(max-width:480px){.recovery-panel{padding:18px}.backup-actions{align-items:flex-start}footer{align-items:flex-start}}
.backup-scope{font-size:13px;color:var(--c-ink);margin:0 0 4px}.recovery-list small{display:block;font-size:11px;color:var(--c-sub);overflow-wrap:anywhere;margin-top:3px}
.recovery-search{width:100%;padding:10px 12px;border-radius:10px;background:var(--c-field);font:inherit;font-size:13px}.recovery-list time{display:block;margin-top:3px;color:var(--c-faint)}.recovery-list a{font-size:12px;color:var(--color-ds);white-space:nowrap}footer{justify-content:flex-end}
</style>
