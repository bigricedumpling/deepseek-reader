<script setup>
import RIcon from './RIcon.vue'
import appDesktop from '../assets/shots/app-base.webp'
import appMobile from '../assets/shots/app-mobile.webp'
import { demoUrl } from '../config'

const releaseUrl = 'https://github.com/bigricedumpling/typocket/releases'
</script>

<template>
  <section id="top" class="hero">
    <div class="container hero-copy" data-reveal>
      <h1>和 Agent 共写<br />一篇本地笔记。</h1>
      <p>
        在浏览器里写 Markdown、读 PDF 和网页。<br class="desktop-break" />
        把一段话交给常用的 Agent，再回来逐行核对它的修改。
      </p>
      <div class="hero-actions">
        <a class="button button-primary" :href="releaseUrl" target="_blank" rel="noreferrer">
          下载 Preview <RIcon name="download-2" :size="15" />
        </a>
        <a v-if="demoUrl" class="button button-quiet" :href="demoUrl" target="_blank" rel="noreferrer">
          打开实际界面 <RIcon name="external-link" :size="13" />
        </a>
      </div>
    </div>

    <div class="container hero-visual" data-reveal style="--d:90ms">
      <component
        :is="demoUrl ? 'a' : 'div'"
        class="app-frame"
        :class="{ 'app-frame--static': !demoUrl }"
        :href="demoUrl || undefined"
        :target="demoUrl ? '_blank' : undefined"
        :rel="demoUrl ? 'noreferrer' : undefined"
        :aria-label="demoUrl ? '打开实际运行的 Typocket 界面' : undefined"
      >
        <picture>
          <source media="(max-width: 800px)" type="image/webp" :srcset="appMobile" />
          <img
            :src="appDesktop"
            alt="Typocket 阅读界面：一次调研留下的，不只是结论"
            fetchpriority="high"
            decoding="async"
          />
        </picture>
      </component>
    </div>
  </section>
</template>
