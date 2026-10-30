<script setup>
import shotRead from '../assets/shots/app-base.png'
import shotKeep from '../assets/shots/app-library.png'
import shotReview from '../assets/shots/app-activity.png'
import mobileRead from '../assets/shots/app-mobile.png'
import mobileKeep from '../assets/shots/app-mobile-keep.png'
import mobileReview from '../assets/shots/app-mobile-review.png'

const cards = [
  { label: '读', shot: shotRead, mobile: mobileRead, alt: '在 Typocket 中阅读 Markdown 文档' },
  { label: '收', shot: shotKeep, mobile: mobileKeep, alt: '在 Typocket 中打开知识库和抽屉' },
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
            <source media="(max-width: 800px)" :srcset="card.mobile" />
            <img :src="card.shot" :alt="card.alt" />
          </picture>
          <figcaption>{{ card.label }}</figcaption>
        </figure>
      </div>
    </div>
  </section>
</template>
