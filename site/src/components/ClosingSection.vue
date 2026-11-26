<script setup>
import RIcon from './RIcon.vue'

const releaseUrl = 'https://github.com/bigricedumpling/typocket/releases'
const repoUrl = 'https://github.com/bigricedumpling/typocket'
</script>

<template>
  <section class="section closing">
    <div class="container closing-inner" data-reveal>
      <h2>文件始终<br />在本机。</h2>
      <div class="closing-copy">
        <p>
          正文和附件都保存在本机。下载发行包，用 Node.js 启动编辑器，即可通过 MCP 接入 Agent。在 DSH 中也可以直接安装插件。
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
