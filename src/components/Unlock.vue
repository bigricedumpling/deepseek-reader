<template>
  <div class="unlock ui-font">
    <form class="unlock-box" @submit.prevent="tryOpen">
      <h1>编辑模式</h1>
      <p>请输入密码。</p>
      <input
        ref="inputEl"
        v-model="pass"
        type="password"
        class="unlock-input"
        placeholder="密码"
        autocomplete="current-password"
      />
      <p v-if="error" class="unlock-error">{{ error }}</p>
      <button class="unlock-btn" type="submit" :disabled="busy || !pass">
        {{ busy ? '验证中…' : '进入编辑' }}
      </button>
      <a class="unlock-alt" :href="API_BASE + '/onlyread'">只看，不编辑 →</a>
    </form>
  </div>
</template>

<script setup>
/*
 * /edit 的密码门。
 *
 * 密码本身由服务端校验（x-reader-pass），这里只是收一下：
 * 对了就写进 localStorage 再重载（重载后 main.js 才会把应用挂起来）。
 */
import { onMounted, ref } from 'vue'
import { API_BASE } from '../utils/api'

const pass = ref('')
const error = ref('')
const busy = ref(false)
const inputEl = ref(null)

onMounted(() => inputEl.value?.focus())

async function tryOpen() {
  if (!pass.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await fetch(API_BASE + '/api/me', {
      headers: { 'x-reader-mode': 'owner', 'x-reader-pass': pass.value }
    })
    const json = await res.json()
    if (json.ok && json.data.role === 'owner') {
      localStorage.setItem('reader_pass', pass.value)
      location.reload()
      return
    }
    error.value = json.error || '密码不对'
  } catch (e) {
    error.value = String(e.message || e)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.unlock {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.unlock-box {
  width: 100%;
  max-width: 320px;
  text-align: center;
}
.unlock-box h1 {
  font-family: var(--stack-serif, serif);
  font-size: 19px;
  margin: 0 0 8px;
  color: var(--c-ink);
}
.unlock-box p {
  font-size: 12.5px;
  line-height: 1.9;
  color: var(--c-sub);
  margin: 0 0 16px;
}
.unlock-input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border-radius: 9px;
  background: var(--c-field);
  border: 1px solid var(--c-line);
  font-size: 13px;
  color: var(--c-ink);
  outline: none;
  text-align: center;
  letter-spacing: 0.12em;
}
.unlock-input:focus {
  background: var(--c-pop);
  border-color: var(--c-line);
}
.unlock-error {
  margin-top: 10px !important;
  color: #c0392b !important;
  font-size: 12px !important;
}
.unlock-btn {
  width: 100%;
  height: 38px;
  margin-top: 14px;
  border-radius: 9px;
  background: var(--color-ds, #4b6ea8);
  color: #fff;
  font-size: 13px;
}
.unlock-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.unlock-alt {
  display: inline-block;
  margin-top: 16px;
  font-size: 11.5px;
  color: var(--c-faint);
  text-decoration: none;
}
.unlock-alt:hover {
  color: var(--c-ink);
  text-decoration: underline;
}
</style>
