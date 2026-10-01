<template>
  <Teleport to="body">
    <Transition name="overlay" appear>
    <div v-if="store.accessRequest" class="access-backdrop" @click.self="close">
      <form class="access-dialog ui-font" role="dialog" aria-modal="true" :aria-label="store.accessRequest.label" @submit.prevent="submit">
        <h2>{{ store.accessRequest.label }}</h2>
        <p class="access-path" :title="store.accessRequest.path">{{ store.accessRequest.path }}</p>
        <p v-if="error" class="access-error" role="alert">{{ error }}</p>
        <div class="access-actions"><button type="button" @click="close" :disabled="busy">取消</button><button :disabled="busy">{{ busy ? '处理中…' : '确认' }}</button></div>
      </form>
    </div>
    </Transition>
  </Teleport>
</template>
<script setup>
import { ref } from 'vue'
import { useDocsStore } from '../stores/docs'
import { API_BASE } from '../utils/api'
const store = useDocsStore()
const error = ref(''), busy = ref(false)
function close() { if (!busy.value) store.accessRequest = null }
async function submit() {
  const request = store.accessRequest
  busy.value = true; error.value = ''
  try {
    if (store.isDirty && !(await store.save())) throw new Error('请先保存当前改动')
    if (store.isGuest || !request.path) throw Error('访客不能修改公开权限')
    const res = await fetch(API_BASE + '/api/access', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: request.path, ...request.change })
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error)
    store.accessRequest = null
    // 重新获取文档树和知识库权限，销毁可能持有旧只读状态的编辑器。
    location.reload()
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
</script>
<style scoped>
.access-backdrop { position:fixed; inset:0; background:var(--c-overlay); z-index:150; display:grid; place-items:center; padding:20px }
.access-dialog { width:min(360px,100%); padding:24px; border-radius:36px; corner-shape:superellipse(2); border:1px solid var(--c-line); background:var(--c-pop); box-shadow:var(--c-pop-shadow); color:var(--c-text) }
h2 { font-weight:400; font-size:17px; margin-bottom:10px } p { font-size:12px; overflow-wrap:anywhere; margin-bottom:14px; color:var(--c-sub) } .access-path{white-space:nowrap;overflow:hidden;text-overflow:ellipsis} label { display:block; font-size:12px; margin-bottom:6px }
.access-backdrop.overlay-enter-active .access-dialog,.access-backdrop.overlay-leave-active .access-dialog{transition:transform var(--motion-enter) var(--motion-ease),opacity var(--motion-enter) ease}
.access-backdrop.overlay-enter-from .access-dialog,.access-backdrop.overlay-leave-to .access-dialog{transform:translateY(5px) scale(.975);opacity:0}
.access-actions { display:flex; justify-content:flex-end; gap:18px; margin-top:18px; font-size:13px }.access-error{color:#c44;margin-top:10px}
</style>
