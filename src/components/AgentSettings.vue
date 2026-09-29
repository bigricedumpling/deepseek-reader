<template><Teleport to="body"><Transition name="overlay" appear @after-leave="$emit('close')"><div v-if="visible" class="reader-modal-shade" @click.self="visible=false"><section class="reader-dialog" role="dialog" aria-modal="true" aria-label="Agent 连接"><header><b>Agent 连接</b><button @click="visible=false">×</button></header><p>只授权所选知识库，可随时撤销。已有令牌不会再次显示。</p><template v-if="!token"><label>连接名称<input v-model="name" placeholder="例如：我的写作助手" /></label><label>知识库<select v-model="scope"><option v-for="l in libraries" :value="l.path" :key="l.path">{{l.name}}</option></select></label><label><input type="checkbox" v-model="write" />允许修改文档</label><label>有效期<select v-model="days"><option :value="7">7 天</option><option :value="30">30 天</option><option :value="90">90 天</option></select></label><button class="reader-button" :disabled="busy||!scope" @click="create">生成连接令牌</button></template><template v-else><p>请现在复制并保存，关闭后无法再查看。</p><textarea readonly :value="token" aria-label="连接令牌" /><button class="reader-button" @click="copy">{{copied?'已复制':'复制令牌'}}</button><p>在插件环境中设置 READER_URL 为当前阅读器地址，READER_TOKEN 为此令牌。</p></template><div class="agent-list"><div v-for="k in keys.filter(x=>!x.revoked)" :key="k.id"><span>{{k.name}}<small>{{k.permissions.includes('write')?'可读写':'只读'}}，{{new Date(k.expires).toLocaleDateString()}} 到期</small></span><button :disabled="busy" @click="revoke(k.id)">撤销</button></div></div><p v-if="error" class="reader-error">{{error}}</p></section></div></Transition></Teleport></template>
<script setup>
const visible=ref(true)
import {ref,onMounted} from 'vue'
import {API_BASE} from '../utils/api'
const props=defineProps({library:String});defineEmits(['close'])
const name=ref('我的 Agent'),scope=ref(props.library),write=ref(false),days=ref(30),token=ref(''),keys=ref([]),libraries=ref([]),busy=ref(false),error=ref(''),copied=ref(false)
async function request(method,route,body){const res=await fetch(API_BASE+'/api/'+route,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const out=await res.json();if(!out.ok)throw Error(out.error);return out.data}
async function run(fn){busy.value=true;error.value='';try{await fn()}catch(e){error.value=e.message}finally{busy.value=false}}
async function refresh(){keys.value=await request('GET','agent-keys')}
function create(){run(async()=>{const out=await request('POST','agent-keys',{name:name.value,scopes:[scope.value],write:write.value,days:days.value});token.value=out.token;await refresh()})}
function revoke(id){run(async()=>{await request('DELETE','agent-keys',{id});await refresh()})}
async function copy(){try{await navigator.clipboard.writeText(token.value);copied.value=true}catch{error.value='请手动选中并复制令牌'}}
onMounted(()=>run(async()=>{await refresh();const out=await request('GET','libs');libraries.value=out.libs||out;if(!scope.value)scope.value=libraries.value[0]?.path}))
</script>
<style scoped>.agent-list{margin-top:20px;max-height:180px;overflow:auto}.agent-list>div{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--c-line)}small{display:block;color:var(--c-faint);font-size:11px;margin-top:4px}</style>
