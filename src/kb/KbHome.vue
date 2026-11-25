<template>
  <div class="kb">
    <header class="kb-head">
      <img class="kb-logo" :src="logo" alt="" />
      <h1 class="kb-title">{{ title }}</h1>
      <div class="kb-theme" role="group" aria-label="外观">
        <button
          v-for="t in THEMES"
          :key="t.id"
          class="kb-theme-btn"
          :class="{ 'is-on': theme === t.id }"
          :aria-pressed="theme === t.id"
          @click="pick(t.id)"
        >
          {{ t.label }}
        </button>
      </div>
    </header>

    <div class="kb-list" :aria-busy="loading">
      <a v-for="lib in libs" :key="lib.href" class="kb-card" :href="lib.href">
        <div class="kb-card-top">
          <span class="kb-card-name">{{ lib.name }}</span>
          <span class="kb-card-meta">{{ lib.meta }}</span>
        </div>
        <p class="kb-card-desc">{{ lib.desc }}</p>
      </a>
    </div>

  </div>
</template>

<script setup>
import { BRAND_NAME } from '../../brand.mjs'
import { computed, onMounted, ref } from 'vue'
import { API_BASE } from '../utils/api'
import { storageGet, storageSet } from '../utils/storage'

/*
 * 知识库首页。
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
    href: API_BASE + '/',
    meta: ''
  }
]

const THEMES = [
  { id: 'light', label: '浅色' },
  { id: 'sepia', label: '柔和' },
  { id: 'dark', label: '深色' }
]

const title = ref(BRAND_NAME)
const libs = ref([])
const loading = ref(true)
const theme = ref(storageGet('reader.theme') || 'light')
const logo = computed(() => storageGet('reader.brandLogo') || document.querySelector('link[rel="icon"]')?.href || API_BASE + '/favicon.svg')

function pick(id) {
  theme.value = id
  storageSet('reader.theme', id)
  document.body.dataset.theme = id
}

onMounted(async () => {
  document.body.dataset.theme = theme.value
  try {
    const res = await fetch(API_BASE + '/kb.json', { cache: 'no-store' })
    const data = await res.json()
    if (data && typeof data.title === 'string' && data.title) title.value = data.title
    if (Array.isArray(data?.libs)) libs.value = data.libs
  } catch {
    // The plugin distribution omits the optional standalone catalog.
  } finally {
    if (!libs.value.length) libs.value = FALLBACK
    loading.value = false
  }
})
</script>

<style scoped>
:global(body) {
  margin: 0;
  color: var(--c-text);
  background: var(--c-surface);
  font-family: var(--font-sans);
}
.kb {
  box-sizing: border-box;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 14vh 24px 72px;
}
.kb-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.kb-logo {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-control);
}
.kb-title {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  font-family: "Noto Serif SC", serif;
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
  border: 0;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
  min-height: 32px;
  padding: 3px 9px;
  border-radius: var(--radius-control);
  font-size: 12px;
  color: var(--c-sub);
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
.kb-card:focus-visible,
.kb-theme-btn:focus-visible {
  outline: 2px solid var(--c-focus);
  outline-offset: 2px;
}
.kb-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
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
@media (hover: hover) and (pointer: fine) {
  .kb-card:hover {
    box-shadow: var(--c-pop-shadow);
    transform: translateY(-1px);
  }
}
@media (pointer: coarse) {
  .kb-theme-btn { min-width: 44px; min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .kb-card, .kb-theme-btn { transition: none; }
  .kb-card:hover { transform: none; }
}
.kb-card-top {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}
.kb-card-name, .kb-card-desc, .kb-card-meta { min-width: 0; overflow-wrap: anywhere; }
.kb-card-name {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--c-ink);
}
.kb-card-meta {
  flex: none;
  max-width: 40%;
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
</style>
