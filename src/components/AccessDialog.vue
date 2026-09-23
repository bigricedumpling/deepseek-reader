<template>
  <Teleport to="body">
    <div v-if="store.accessRequest" class="access-backdrop" @click.self="close">
      <form class="access-dialog ui-font" role="dialog" aria-modal="true" :aria-label="store.accessRequest.label" @submit.prevent="submit">
        <h2>{{ store.accessRequest.label }}</h2>
        <p>{{ store.accessRequest.path || '验证后可管理未公开的资料。' }}</p>
        <p v-if="store.accessRequest.change.locked === false">解锁后，公开范围内的访客可以修改此项及继承此设置的内容。只想自己编辑时，请进入管理工作区，无需解锁。</p>
        <label for="access-password">管理密码</label>
        <input id="access-password" ref="input" v-model="password" type="password" autocomplete="current-password" required autofocus />
        <p v-if="error" class="access-error" role="alert">{{ error }}</p>
        <div class="access-actions"><button type="button" @click="close" :disabled="busy">取消</button><button :disabled="busy">{{ busy ? '处理中…' : '确认' }}</button></div>
      </form>
    </div>
  </Teleport>
</template>
<script setup>
import { ref, watch, nextTick } from 'vue'
import { useDocsStore } from '../stores/docs'
import { API_BASE } from '../utils/api'
const store = useDocsStore()
const password = ref(''), error = ref(''), busy = ref(false), input = ref(null)
watch(() => store.accessRequest, async () => { password.value = ''; error.value = ''; await nextTick(); input.value?.focus() })
function close() { if (!busy.value) store.accessRequest = null }
async function submit() {
  const request = store.accessRequest
  busy.value = true; error.value = ''
  try {
    if (store.isDirty && !(await store.save())) throw new Error('请先保存当前改动')
    const login = !request.path
    const res = await fetch(API_BASE + '/api/' + (login ? 'session' : 'access'), {
      method: login ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: request.path, ...request.change, password: password.value })
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error)
    store.accessRequest = null
    // 重新获取文档树和知识库权限，销毁可能持有旧只读状态的编辑器。
    if (login && window.__readerPublicView) location.assign(location.pathname.replace('/onlyread', '/doc') + location.search)
    else location.reload()
  } catch (e) { error.value = e.message }
  finally { password.value = ''; busy.value = false }
}
</script>
<style scoped>
.access-backdrop { position:fixed; inset:0; background:#0004; z-index:150; display:grid; place-items:center; padding:20px }
.access-dialog { width:min(360px,100%); padding:24px; border-radius:16px; background:var(--c-pop); box-shadow:var(--c-pop-shadow); color:var(--c-text) }
h2 { font-size:17px; margin-bottom:10px } p { font-size:12px; overflow-wrap:anywhere; margin-bottom:14px; color:var(--c-sub) } label { display:block; font-size:12px; margin-bottom:6px }
input { width:100%; border:1px solid var(--c-line); padding:9px; border-radius:7px; background:var(--c-field) }
.access-actions { display:flex; justify-content:flex-end; gap:18px; margin-top:18px; font-size:13px }.access-error{color:#c44;margin-top:10px}
</style>
