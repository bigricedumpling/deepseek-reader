<template>
  <main class="entry-page ui-font">
    <section class="entry-card">
      <PhBooks class="entry-mark" :size="28" weight="regular" aria-hidden="true" />
      <h1>{{ loginRequired ? '管理工作区' : '知识库' }}</h1>
      <p class="intro">{{ loginRequired ? '验证管理身份后，继续访问你的资料。' : '阅读、整理，继续你的思考。' }}</p>
      <div class="entry-options">
        <a :href="base + '/onlyread/'" class="entry-option">
          <PhBookOpen :size="21" class="option-icon" />
          <span class="option-copy"><strong>公开浏览</strong><span>浏览公开资料，体验示例知识库</span></span>
          <PhArrowRight :size="17" class="option-arrow" />
        </a>
        <button class="entry-option" @click="enterManagement">
          <PhSquaresFour :size="21" class="option-icon" />
          <span class="option-copy"><strong>管理工作区</strong><span>{{ isOwner ? '已登录，可直接进入' : '使用管理密码，编辑和整理全部资料' }}</span></span>
          <PhArrowRight :size="17" class="option-arrow" />
        </button>
      </div>
      <form v-if="showLogin && !isOwner" class="entry-login" @submit.prevent="login">
        <label for="entry-password">管理密码</label>
        <div class="login-row"><input id="entry-password" ref="passwordInput" v-model="password" type="password" autocomplete="current-password" required /><button :disabled="busy">{{ busy ? '验证中…' : '进入工作区' }}</button></div>
        <p>验证身份不会改变文档的公开或锁定状态。</p>
      </form>
      <p v-if="error" class="entry-error" role="alert">{{ error }}</p>
      <div v-if="isOwner" class="session-row"><span><PhCheck :size="13" /> 管理身份已验证</span><button :disabled="busy" @click="logout">退出管理身份</button></div>

    </section>
  </main>
</template>
<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { PhBooks, PhBookOpen, PhSquaresFour, PhArrowRight, PhCheck } from '@phosphor-icons/vue'
import { API_BASE as base } from '../utils/api'
const props = defineProps({ loginRequired: Boolean })
const isOwner = ref(window.__readerMode === 'owner')
const showLogin = ref(props.loginRequired)
const password = ref(''), error = ref(''), busy = ref(false), passwordInput = ref(null)
function destination() {
  return props.loginRequired ? location.pathname + location.search : base + '/doc/'
}
async function enterManagement() {
  if (isOwner.value) return location.assign(destination())
  showLogin.value = true
  await nextTick(); passwordInput.value?.focus()
}
async function login() {
  busy.value = true; error.value = ''
  try {
    const res = await fetch(base + '/api/session', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:password.value}) })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || '验证失败')
    location.assign(destination())
  } catch (e) { error.value = e.message }
  finally { password.value = ''; busy.value = false }
}
async function logout() {
  busy.value = true; error.value = ''
  try {
    const res = await fetch(base + '/api/session', {method:'DELETE',headers:{'Content-Type':'application/json'},body:'{}'})
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || '退出失败')
    window.__readerMode = 'guest'; isOwner.value = false
    showLogin.value = false
  } catch(e) { error.value = e.message }
  finally { busy.value = false }
}
onMounted(() => { if (props.loginRequired) passwordInput.value?.focus() })
</script>
<style scoped>
.entry-page { min-height:100dvh; display:grid; place-items:center; padding:32px 24px; background:var(--c-surface); color:var(--c-text) }
.entry-card { width:min(400px,100%); padding-bottom:32px }
.entry-mark { color:var(--c-ink); margin-bottom:22px }
h1 { font-size:24px; font-weight:600; letter-spacing:-.025em; line-height:1.4 }
.intro { font-size:13px; color:var(--c-sub); margin-top:8px; line-height:1.7 }
.entry-options { display:flex; flex-direction:column; gap:8px; margin-top:28px }
.entry-option { width:100%; display:flex; align-items:center; gap:15px; text-align:left; padding:17px 16px; border:1px solid var(--c-line); border-radius:var(--radius-surface); color:var(--c-text); text-decoration:none; transition:background .15s,border-color .15s; cursor:pointer }
.entry-option:hover { background:var(--c-field); border-color:var(--c-faint) }
.entry-option:focus-visible,.login-row button:focus-visible,.session-row button:focus-visible { outline:2px solid var(--c-ink); outline-offset:3px }
.option-icon { color:var(--c-sub); flex-shrink:0 }.option-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}.option-copy strong{font-size:14px;font-weight:500}.option-copy>span{font-size:12px;color:var(--c-sub);line-height:1.6}.option-arrow{flex-shrink:0;color:var(--c-faint)}
.entry-login { margin-top:24px }.entry-login label { font-size:12px; color:var(--c-sub) }.login-row { display:flex; gap:8px; margin-top:8px }.login-row input { min-width:0; flex:1; border:1px solid var(--c-line); border-radius:var(--radius-control); padding:9px; background:var(--c-field) }.login-row button { border:1px solid var(--c-line); border-radius:var(--radius-control); padding:9px 12px; font-size:12px; white-space:nowrap }.entry-login p { font-size:11px; color:var(--c-sub); margin-top:10px; line-height:1.6 }
.session-row { display:flex; align-items:center; justify-content:space-between; font-size:11px; color:var(--c-faint); margin-top:18px }.session-row>span{display:flex;align-items:center;gap:4px}.session-row button { padding:5px 7px; border-radius:var(--radius-control); color:var(--c-sub) }.session-row button:hover{background:var(--c-field);color:var(--c-text)}.entry-error{color:#c44;font-size:12px;margin-top:12px}
@media(max-width:520px){.entry-card{padding-bottom:0}.entry-option{padding:16px 13px;gap:12px}}
</style>
