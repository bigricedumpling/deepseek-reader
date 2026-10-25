<template>
  <!--
    当前窗口连的是哪个库。语气和「恢复副本 / 只读」一致：一行小字，不放图标。
    只在两种情况下出现：开发沙箱，或源码直跑却连着自用库（危险状态）。
    正式安装版不显示，也不进打印。
  -->
  <span v-if="text" class="instance-note" :class="tone" :title="title">{{ text }}</span>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { API_BASE } from '../utils/api'

/* 一次会话里只问一次：这行字只是提示，不值得每次切文档都发请求 */
let cached = null
let pending = null

const info = ref(cached)

onMounted(async () => {
  if (cached) return
  if (!pending) {
    pending = fetch(API_BASE + '/api/instance')
      .then(res => (res.ok ? res.json() : null))
      .then(out => (out?.ok ? out.data : null))
      .catch(() => null)
      .finally(() => { pending = null })
  }
  const data = await pending
  if (data) {
    cached = data
    info.value = data
  }
})

const fromSource = import.meta.env.DEV
const tone = computed(() => (info.value?.profile === 'dev' ? 'is-sandbox' : 'is-live'))

const text = computed(() => {
  if (!info.value) return ''
  /* 沙箱：开发时看的示例库，不是自用资料 */
  if (info.value.profile === 'dev') return '沙箱'
  /* 正式版不显示；源码直跑时标出来，因为这时最可能误连自用库 */
  if (fromSource) return '源码 · 自用库'
  return ''
})

const title = computed(() => {
  if (!info.value) return ''
  const where = info.value.dataDirectory || ''
  return info.value.profile === 'dev'
    ? `开发沙箱：${where}\n自用资料不在这里`
    : `源码运行，数据目录：${where}\n注意：这就是自用库`
})
</script>

<style scoped>
/* 与 DocView 里的 .guest-access-note 同一套处理：淡底色、小圆角、11px、不加边框 */
.instance-note {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  min-height: 24px;
  padding: 2px 9px;
  border-radius: var(--radius-control);
  corner-shape: superellipse(2);
  background: var(--c-field);
  color: var(--c-sub);
  font: 11px var(--font-sans);
  white-space: nowrap;
  user-select: none;
}
.instance-note.is-live {
  color: #c94c4c;
}
@media (max-width: 640px) {
  .instance-note {
    display: none;
  }
}
@media print {
  .instance-note {
    display: none !important;
  }
}
</style>
