<script setup>
import RIcon from './RIcon.vue'

const releaseUrl = 'https://github.com/bigricedumpling/deepseek-reader/releases'
const repoUrl = 'https://github.com/bigricedumpling/deepseek-reader'
</script>

<template>
  <section class="section closing">
    <div class="container closing-inner" data-reveal>
      <h2>文件始终<br />在本机。</h2>
      <div class="closing-copy">
        <p>
          正文是普通 Markdown，附件是普通文件。Typocket 只是一个 DSH 插件：下载 .tgz，在「插件 → 添加插件」里打开，三步。
        </p>
        <div class="closing-actions">
          <a class="button button-primary" :href="releaseUrl" target="_blank" rel="noreferrer">
            下载 Preview <RIcon name="download-2" :size="15" />
          </a>
          <a class="closing-link" :href="repoUrl" target="_blank" rel="noreferrer">
            在 GitHub 查看源码 <RIcon name="external-link" :size="12" />
          </a>
        </div>
        <p class="closing-meta">源码 MIT · 无需账号 · macOS 已验证</p>
      </div>
    </div>
  </section>
</template>
