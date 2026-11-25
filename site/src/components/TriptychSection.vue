<script setup>
import shotRead from '../assets/shots/app-base.webp'
import shotKeep from '../assets/shots/app-library.webp'
import shotReview from '../assets/shots/app-activity.webp'
import mobileRead from '../assets/shots/app-mobile.webp'
import mobileKeep from '../assets/shots/app-mobile-keep.webp'
import mobileReview from '../assets/shots/app-mobile-review.webp'

const cards = [
  { label: '读', shot: shotRead, mobile: mobileRead, alt: '在 Typocket 中阅读 Markdown 文档' },
  { label: '收', shot: shotKeep, mobile: mobileKeep, alt: '在文档总览中浏览知识库' },
  { label: '看', shot: shotReview, mobile: mobileReview, alt: '在 Typocket 中查看 Agent 改动' }
]
</script>

<template>
  <section class="section triptych">
    <div class="container" data-reveal>
      <h2>读。收。看。</h2>
      <p class="section-lead">Agent 的工作不需要被搬进另一个系统。</p>

      <div class="triptych-row">
        <figure v-for="card in cards" :key="card.label" class="triptych-card">
          <picture>
            <source media="(max-width: 800px)" type="image/webp" :srcset="card.mobile" />
            <img
              :src="card.shot"
              :alt="card.alt"
              loading="lazy"
              decoding="async"
            />
          </picture>
          <figcaption>{{ card.label }}</figcaption>
        </figure>
      </div>
    </div>
  </section>
</template>
