<template>
  <Teleport to="body"><Transition name="overlay" appear @after-leave="$emit('close')"><div v-if="visible" class="public-sharing-backdrop" @click.self="visible=false">
    <section ref="dialog" tabindex="-1" class="public-sharing-panel" role="dialog" aria-modal="true" aria-label="分享只读副本">
      <header><button class="icon-btn" aria-label="返回抽屉" @click="visible=false"><PhArrowLeft :size="18" /></button><h2>分享只读副本</h2></header>

      <div v-if="loading" class="public-sharing-time" role="status">正在读取分享范围…</div>
      <details v-else-if="state.scope" class="sharing-scope"><summary>{{ state.active ? '下次更新范围' : '本次分享范围' }}，{{ state.scope.libraries.length }} 个抽屉，{{ state.scope.documents }} 篇</summary><ul><li v-for="lib in state.scope.libraries" :key="lib.name"><strong>{{ lib.name }}</strong><ul><li v-for="file in lib.documents" :key="file">{{ file.startsWith(lib.name+'/') ? file.slice(lib.name.length+1) : file }}</li></ul></li></ul></details>
      <p v-if="state.scope && !state.scope.documents" class="public-sharing-time">尚未选择文档。返回抽屉设置分享范围。</p>
      <div class="public-sharing-status"><span>{{ state.active ? '链接已开启' : '链接未开启' }}</span><span v-if="state.active"><PhLock :size="13"/> 只读，{{ state.documents || 0 }} 篇</span></div>
      <div v-if="state.active" class="public-sharing-link"><input :value="state.url" readonly aria-label="访客地址" /><button @click="copy">{{ copied ? '已复制' : '复制地址' }}</button></div>
      <p v-if="state.updated" class="public-sharing-time">{{ new Date(state.updated).toLocaleString('zh-CN') }} 更新</p>
      <p v-if="state.available === false && !state.active" class="public-sharing-time">此设备暂未配置公网分享。你仍可从文档菜单导出文件。</p>
      <p v-if="error" class="public-sharing-error" role="alert">{{ error }}</p>
      <footer>
        <template v-if="state.active"><button :disabled="busy" @click="control('stop')">关闭链接</button><a :href="state.url" target="_blank" rel="noopener noreferrer">浏览器打开</a><button :disabled="busy" @click="control('update')">{{ busy ? '处理中…' : '更新链接内容' }}</button></template>
        <button v-else :disabled="busy || loading || !!error || state.available === false || !state.scope?.documents" @click="control('start')">{{ busy ? '正在连接…' : '生成只读链接' }}</button>
      </footer>
    </section>
  </div></Transition></Teleport>
</template>
<script setup>
import { ref, onMounted } from 'vue'
import {useDialogFocus} from '../composables/useDialogFocus'
import { PhArrowLeft, PhLock } from '@phosphor-icons/vue'
import { API_BASE } from '../utils/api'
defineEmits(['close'])
const loading=ref(true)
const state = ref({}), busy = ref(false), error = ref(''), copied = ref(false), visible = ref(true)
const dialog=ref(null)
useDialogFocus(()=>visible.value,dialog,()=>{if(!busy.value)visible.value=false})
async function load() { try { const result = await fetch(API_BASE + '/api/public-session').then(r => r.json()); if (!result.ok) throw Error(result.error); state.value = result.data } catch (e) { error.value = e.message } finally {loading.value=false} }
async function control(action) {
  if (busy.value) return
  busy.value = true; error.value = ''; copied.value = false
  try { const result = await fetch(API_BASE + '/api/public-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }).then(r => r.json()); if (!result.ok) throw Error(result.error); state.value = result.data } catch (e) { error.value = e.message } finally { busy.value = false }
}
async function copy() { try { await navigator.clipboard.writeText(state.value.url); copied.value = true } catch { error.value = '复制失败，可直接选择地址复制' } }
onMounted(load)
</script>
<style>
.public-sharing-backdrop{position:fixed;inset:0;z-index:110;background:var(--c-overlay);display:grid;place-items:center;padding:20px}
.public-sharing-panel{max-height:calc(100dvh - 40px);overflow:auto;width:min(460px,100%);padding:24px;border:1px solid var(--c-line);border-radius:38px;corner-shape:superellipse(2);background:var(--c-pop);box-shadow:var(--c-pop-shadow)}
.public-sharing-backdrop.overlay-enter-active .public-sharing-panel,.public-sharing-backdrop.overlay-leave-active .public-sharing-panel{transition:transform var(--motion-enter) var(--motion-ease),opacity var(--motion-enter) ease}
.public-sharing-backdrop.overlay-enter-from .public-sharing-panel,.public-sharing-backdrop.overlay-leave-to .public-sharing-panel{transform:translateY(5px) scale(.975);opacity:0}
.public-sharing-panel header{display:flex;align-items:center;gap:10px;margin-bottom:24px}.public-sharing-panel h2{font-size:17px;font-weight:400;margin:0}
.snapshot-description{font-size:12px;line-height:1.7;color:var(--c-sub);margin:0 0 16px}.public-sharing-status span{display:inline-flex;align-items:center;gap:4px}.public-sharing-status{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px}.public-sharing-status span:last-child,.public-sharing-time{color:var(--c-sub);font-size:11px}
.public-sharing-link{display:flex;gap:8px;margin-top:16px}.public-sharing-link input{min-width:0;flex:1;background:var(--c-field);border:1px solid var(--c-line);border-radius:var(--radius-control);padding:10px;font:inherit;font-size:12px;color:var(--c-sub)}
.public-sharing-panel button:not(.icon-btn),.public-sharing-panel footer a{background:var(--c-field);border-radius:var(--radius-control);corner-shape:superellipse(2);padding:9px 12px;font-size:12px;white-space:nowrap;color:var(--c-text)}.public-sharing-panel button:hover,.public-sharing-panel footer a:hover{background:var(--c-hover);text-decoration:none}.public-sharing-panel button:disabled{opacity:.5;cursor:default}
.public-sharing-panel footer{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:8px;margin-top:22px}.public-sharing-error{font-size:12px;color:#bb4b4b;margin-top:14px}.public-sharing-time{margin-top:10px}
.sharing-scope{margin:14px 0;font-size:12px;line-height:1.7}.sharing-scope summary{cursor:pointer;color:var(--c-ink)}.sharing-scope>ul{max-height:180px;overflow:auto;padding-left:18px}.sharing-scope li{overflow-wrap:anywhere}.sharing-scope li ul{color:var(--c-sub);padding-left:16px}
</style>
