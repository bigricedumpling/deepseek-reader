<script setup>
import RIcon from './RIcon.vue'
import appDesktop from '../assets/shots/app-base.png'
import appMobile from '../assets/shots/app-mobile.png'

const releaseUrl = 'https://github.com/bigricedumpling/deepseek-reader/releases'
const liveUrl = 'http://127.0.0.1:8093/doc/%E7%A0%94%E7%A9%B6/%E4%B8%80%E6%AC%A1%E8%B0%83%E7%A0%94%E7%95%99%E4%B8%8B%E7%9A%84%EF%BC%8C%E4%B8%8D%E5%8F%AA%E6%98%AF%E7%BB%93%E8%AE%BA?lib=%E7%A0%94%E7%A9%B6'
</script>

<template>
  <section id="top" class="hero">
    <div class="container hero-copy" data-reveal>
      <h1>给 Agent 写下的文件，<br />一间阅览室。</h1>
      <p>
        Typocket 是 DSH 的插件。读工作区的 Markdown、PDF 和网页，<br class="desktop-break" />
        把值得留下的收进抽屉。文件始终留在本机。
      </p>
      <div class="hero-actions">
        <a class="button button-primary" :href="releaseUrl" target="_blank" rel="noreferrer">
          下载 Preview <RIcon name="download-2" :size="15" />
        </a>
        <a class="button button-quiet" :href="liveUrl" target="_blank" rel="noreferrer">
          打开实际界面 <RIcon name="external-link" :size="13" />
        </a>
      </div>
    </div>

    <div class="container hero-visual" data-reveal style="--d:90ms">
      <a class="app-frame" :href="liveUrl" target="_blank" rel="noreferrer" aria-label="打开实际运行的 Typocket 界面">
        <picture>
          <source media="(max-width: 800px)" :srcset="appMobile" />
          <img :src="appDesktop" alt="Typocket 阅读界面：一次调研留下的，不只是结论" />
        </picture>
      </a>
    </div>
  </section>
</template>
