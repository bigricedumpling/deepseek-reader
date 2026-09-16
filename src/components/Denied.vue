<template>
  <div class="denied ui-font">
    <div class="denied-box">
      <h1>禁止访问</h1>
      <p>这个项目必须在两种模式里选一个打开：</p>
      <div class="denied-links">
        <a :href="API_BASE + '/edit'">/edit<span>编辑模式</span></a>
        <a :href="API_BASE + '/onlyread'">/onlyread<span>只读模式</span></a>
      </div>
    </div>
  </div>
</template>

<script setup>
/* 没有明确模式时的落地页：不给看内容，也不发任何 /api 请求 */
import { API_BASE } from '../utils/api'
</script>

<style scoped>
.denied {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.denied-box {
  max-width: 420px;
  text-align: center;
}
.denied-box h1 {
  font-family: var(--stack-serif, serif);
  font-size: 20px;
  margin: 0 0 10px;
  color: var(--c-ink);
}
.denied-box p {
  font-size: 13px;
  line-height: 1.9;
  color: var(--c-sub);
  margin: 0 0 18px;
}
.denied-links {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-bottom: 18px;
}
.denied-links a {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 132px;
  padding: 12px 14px;
  border: 1px solid var(--c-line);
  border-radius: 10px;
  background: var(--c-pop);
  color: var(--c-ink);
  text-decoration: none;
  font-family: var(--font-mono);
  font-size: 12px;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.denied-links a:hover {
  border-color: #ded8cc;
  transform: translateY(-1px);
}
.denied-links a span {
  font-family: var(--font-sans);
  font-size: 11.5px;
  color: var(--c-faint);
}
</style>
