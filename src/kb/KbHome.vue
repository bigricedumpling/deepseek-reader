<template>
  <div class="kb">
    <header class="kb-head">
      <img class="kb-logo" :src="logo" alt="" />
      <h1 class="kb-title">{{ title }}</h1>
      <div class="kb-theme">
        <button
          v-for="t in THEMES"
          :key="t.id"
          class="kb-theme-btn"
          :class="{ 'is-on': theme === t.id }"
          :title="t.label"
          @click="pick(t.id)"
        >
          {{ t.label }}
        </button>
      </div>
    </header>

    <p class="kb-lead">点进去直接看，只读，不用登录。</p>

    <div class="kb-list">
      <a v-for="lib in libs" :key="lib.href" class="kb-card" :href="lib.href">
        <div class="kb-card-top">
          <span class="kb-card-name">{{ lib.name }}</span>
          <span class="kb-card-meta">{{ lib.meta }}</span>
        </div>
        <p class="kb-card-desc">{{ lib.desc }}</p>
      </a>
    </div>

    <footer class="kb-foot">
      加一个抽屉：编辑 <code>public/kb.json</code>，刷新即可，不用重新构建。
    </footer>
  </div>
</template>

<script setup>
import { BRAND_NAME } from '../../brand.mjs'
import { computed, onMounted, ref } from 'vue'
import { API_BASE } from '../utils/api'

/*
 * 抽屉首页。
 *
 * 跟阅读器是同一个工程里的第二个入口（kb/index.html），共用：
 *   - tokens.css 的配色（浅色 / 护眼 / 深色三套，跟阅读器同一份变量）
 *   - 同一套字体（思源宋做标题、思源黑做界面）
 *   - 同一条 localStorage 里的主题选择（reader.theme）与自定图标（reader.brandLogo）
 * 这样两边的"气质"不会各走一条路 —— 以前那份手写的静态 HTML 就是栽在这儿。
 */

const FALLBACK = [
  {
    name: `打开 ${BRAND_NAME}`,
    desc: '阅读、编辑和整理文档。',
    href: '/',
    meta: ''
  }
]

const THEMES = [
  { id: 'light', label: '浅色' },
  { id: 'sepia', label: '护眼' },
  { id: 'dark', label: '深色' }
]

const title = ref(BRAND_NAME)
const libs = ref(FALLBACK)
const theme = ref(localStorage.getItem('reader.theme') || 'light')
const logo = computed(() => localStorage.getItem('reader.brandLogo') || '__SITE_ICON__')

function pick(id) {
  theme.value = id
  localStorage.setItem('reader.theme', id)
  document.body.dataset.theme = id
}

onMounted(async () => {
  document.body.dataset.theme = theme.value
  try {
    const res = await fetch(API_BASE + '/kb.json', { cache: 'no-store' })
    const data = await res.json()
    if (data && typeof data.title === 'string' && data.title) title.value = data.title
    if (Array.isArray(data?.libs) && data.libs.length) libs.value = data.libs
  } catch {
    /* 读不到就用内置的那一条，不白屏 */
  }
})
</script>

<style scoped>
.kb {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 14vh 24px 72px;
}
.kb-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 34px;
}
.kb-logo {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-control);
}
.kb-title {
  font-family: var(--stack-serif, serif);
  font-size: 17px;
  font-weight: 600;
  margin: 0;
  letter-spacing: 0.01em;
}
.kb-theme {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
.kb-theme-btn {
  padding: 3px 9px;
  border-radius: var(--radius-control);
  font-size: 11.5px;
  color: var(--c-faint);
  transition: background 0.15s ease, color 0.15s ease;
}
.kb-theme-btn:hover {
  background: var(--c-hover);
  color: var(--c-ink);
}
.kb-theme-btn.is-on {
  background: var(--c-chip);
  color: var(--c-ink);
}
.kb-lead {
  margin: 0 0 22px;
  font-size: 13px;
  line-height: 1.95;
  color: var(--c-sub);
}
.kb-list {
  display: grid;
  gap: 10px;
}
.kb-card {
  display: block;
  padding: 16px 18px;
  background: var(--c-pop);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-surface);
  text-decoration: none;
  color: inherit;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}
.kb-card:hover {
  border-color: var(--c-line);
  box-shadow: var(--c-pop-shadow);
  transform: translateY(-1px);
}
.kb-card-top {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}
.kb-card-name {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--c-ink);
}
.kb-card-meta {
  margin-left: auto;
  font-size: 11px;
  color: var(--c-faint);
}
.kb-card-desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.85;
  color: var(--c-sub);
}
.kb-foot {
  margin-top: 32px;
  padding-top: 14px;
  border-top:0;
  font-size: 11.5px;
  line-height: 1.9;
  color: var(--c-faint);
}
.kb-foot code {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--c-field);
  padding: 1px 5px;
  border-radius: var(--radius-control);
  color: var(--c-sub);
}
</style>
