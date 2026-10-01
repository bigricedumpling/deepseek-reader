<template>
  <main class="entry-page ui-font">
    <section class="entry-card">
      <PhBooks class="entry-mark" :size="28" weight="regular" aria-hidden="true" />
      <h1>管理工作区</h1>
      <form class="entry-login" @submit.prevent="login">
        <label for="entry-password">管理密码</label>
        <div class="login-row">
          <input id="entry-password" ref="passwordInput" v-model="password" type="password" autocomplete="current-password" required />
          <button :disabled="busy">{{ busy ? '验证中…' : '进入工作区' }}</button>
        </div>
      </form>
      <p v-if="error" class="entry-error" role="alert">{{ error }}</p>
      <a class="public-link" :href="base + '/onlyread/'">浏览公开版 <PhArrowRight :size="14" /></a>
    </section>
  </main>
</template>
<script setup>
import { ref, onMounted } from 'vue'
import { PhBooks, PhArrowRight } from '@phosphor-icons/vue'
import { API_BASE as base } from '../utils/api'
const password = ref(''), error = ref(''), busy = ref(false), passwordInput = ref(null)
async function login() {
  busy.value = true; error.value = ''
  try {
    const res = await fetch(base + '/api/session', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:password.value}) })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || '验证失败')
    location.replace(location.pathname + location.search)
  } catch (e) { error.value = e.message }
  finally { password.value = ''; busy.value = false }
}
onMounted(() => passwordInput.value?.focus())
</script>
<style scoped>
.entry-page{min-height:100dvh;display:grid;place-items:center;padding:32px 24px;background:var(--c-surface);color:var(--c-text)}
.entry-card{width:min(400px,100%);padding-bottom:32px}.entry-mark{color:var(--c-ink);margin-bottom:22px}
h1{font-size:24px;font-weight:400;letter-spacing:-.025em;line-height:1.4}.intro{font-size:13px;color:var(--c-sub);margin-top:8px;line-height:1.7}
.entry-login{margin-top:28px}.entry-login label{font-size:12px;color:var(--c-sub)}.login-row{display:flex;gap:8px;margin-top:8px}
.login-row input{min-width:0;flex:1;border:1px solid var(--c-line);border-radius:var(--radius-control);padding:9px;background:var(--c-field)}
.login-row button{border:0;border-radius:var(--radius-control);padding:9px 12px;font-size:12px;white-space:nowrap;background:var(--c-field);cursor:pointer}
.login-row button:hover{background:var(--c-hover)}.login-row button:focus-visible,.public-link:focus-visible{outline:2px solid var(--c-ink);outline-offset:3px}
.entry-error{color:#c44;font-size:12px;margin-top:12px}.public-link{display:inline-flex;align-items:center;gap:5px;margin-top:26px;color:var(--c-sub);font-size:12px;text-decoration:none}.public-link:hover{color:var(--c-ink)}
</style>
