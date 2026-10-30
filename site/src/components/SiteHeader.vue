<script setup>
import RIcon from './RIcon.vue'

const releaseUrl = 'https://github.com/bigricedumpling/deepseek-reader/releases'
const repoUrl = 'https://github.com/bigricedumpling/deepseek-reader'
</script>

<template>
  <header class="site-header">
    <div class="header-inner">
      <a class="wordmark" href="#top" aria-label="Typocket 首页">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.25" y="4.5" width="17.5" height="15" rx="4.25" stroke="currentColor" stroke-width="1.5" />
          <path d="M8.2 4.8v9.4l3.8-2.4 3.8 2.4V4.8" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
        <span>Typocket</span>
      </a>

      <div class="header-actions">
        <a class="header-github" :href="repoUrl" target="_blank" rel="noreferrer">
          GitHub <RIcon name="external-link" :size="11" />
        </a>
        <a class="button button-primary" :href="releaseUrl" target="_blank" rel="noreferrer">
          下载 Preview <RIcon name="download-2" :size="14" />
        </a>
      </div>
    </div>
  </header>
</template>
