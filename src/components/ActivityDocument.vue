<template>
  <div class="activity-document">
    <div v-if="!sourceOnly" class="snapshot-tools" role="group" aria-label="查看改动">
      <template v-if="comparison">
        <button :aria-pressed="!source && side === 'after'" @click="showSide('after')">改动后</button>
        <button :aria-pressed="!source && side === 'before'" @click="showSide('before')">改动前</button>
      </template>
      <button v-else-if="source" @click="showSide('after')">预览</button>
      <button class="snapshot-source" :aria-pressed="source" @click="source = !source">{{ comparison ? '源码对照' : '源码' }}</button>
    </div>
    <TextComparison v-if="(sourceOnly || source) && comparison" :before="diff.before" :after="diff.after"
      before-label="改动前" after-label="改动后" same-label="这次操作没有更改正文" />
    <pre v-else-if="sourceOnly || source" class="snapshot-raw">{{ diff.after }}</pre>
    <div v-else ref="scroll" class="snapshot-scroll" tabindex="0" :aria-label="comparison ? side === 'before' ? '改动前正文' : '改动后正文' : '文档正文'">
      <article v-if="html.trim()" class="snapshot-reading" v-html="html"></article>
      <p v-else class="snapshot-empty">空白文档</p>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import TextComparison from './TextComparison.vue'
import { activitySnapshot } from '../utils/activity-snapshot'

const props = defineProps({ diff: { type: Object, required: true } })
const source = ref(false), side = ref('after'), scroll = ref(null)
const comparison = computed(() => props.diff.kind === 'update' && Boolean(props.diff.versionId))
const snapshot = computed(() => {
  try { return activitySnapshot(props.diff.before, props.diff.after, comparison.value) }
  catch { return null }
})
const sourceOnly = computed(() => {
  if (!snapshot.value) return true
  if (!comparison.value) return Boolean(props.diff.after.trim() && !snapshot.value.after.trim())
  // Formatting syntax and frontmatter can change without altering the rendered page.
  return !snapshot.value.removed && !snapshot.value.added
})
const html = computed(() => snapshot.value?.[side.value] || '')

function showSide(next) {
  side.value = next
  source.value = false
}
watch(snapshot, preview => {
  source.value = false
  side.value = preview?.removed && !preview.added ? 'before' : 'after'
}, { immediate: true })
watch([html, source], async () => {
  await nextTick()
  const area = scroll.value
  if (!area) return
  const marked = area.querySelector('[data-activity-change]')
  area.scrollTop = 0
  if (marked) {
    const offset = marked.getBoundingClientRect().top - area.getBoundingClientRect().top
    if (offset > area.clientHeight * .65) area.scrollTop = Math.max(0, offset - Math.min(area.clientHeight * .3, 90))
  }
}, { immediate: true })
</script>

<style scoped>
.activity-document { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; gap: 6px; }
.snapshot-tools { display: flex; gap: 2px; align-items: center; flex-wrap: wrap; }
.snapshot-tools button { padding: 4px 8px; border-radius: var(--radius-control); font-size: 12px; line-height: 1.5; color: var(--c-sub); }
.snapshot-tools button[aria-pressed="true"] { background: var(--c-active); color: var(--c-ink); }
.snapshot-tools .snapshot-source { margin-inline-start: auto; }
.snapshot-scroll, .snapshot-raw { overflow: auto; overscroll-behavior: contain; min-height: 0; flex: 1; }
.snapshot-scroll:focus-visible { outline-offset: -2px; }
.snapshot-raw { margin: 0; padding: 10px; background: var(--c-field); border-radius: var(--radius-control); white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.65 var(--font-mono); }
.snapshot-empty { margin: 24px 0; text-align: center; color: var(--c-sub); font-size: 12px; }
.snapshot-reading { padding: 4px 8px 24px; color: var(--c-text); font: 14px/1.75 var(--reading-font); overflow-wrap: anywhere; }
.snapshot-reading :deep(:is(h1,h2,h3,h4,h5,h6)) { margin: 1.15em 0 .42em; color: var(--c-ink); font-weight: 650; line-height: 1.35; }
.snapshot-reading :deep(h1) { font-size: 1.55em; }.snapshot-reading :deep(h2) { font-size: 1.28em; }.snapshot-reading :deep(h3) { font-size: 1.12em; }
.snapshot-reading :deep(> :first-child) { margin-block-start: .4em; }
.snapshot-reading :deep(p), .snapshot-reading :deep(blockquote) { margin: .65em 0; }
.snapshot-reading :deep(blockquote) { padding-inline-start: .9em; border-inline-start: 2px solid var(--c-line); color: var(--c-sub); }
.snapshot-reading :deep(:is(ul,ol)) { padding-inline-start: 1.55em; margin-block: .65em; }
.snapshot-reading :deep(ul) { list-style: disc; }.snapshot-reading :deep(ol) { list-style: decimal; }
.snapshot-reading :deep(picture), .snapshot-reading :deep(img) { max-width: 100%; height: auto; }
.snapshot-reading :deep(.table-wrap), .snapshot-reading :deep(pre) { overflow: auto; }
.snapshot-reading :deep(table) { border-collapse: collapse; margin: .5em 0; font-size: .94em; }
.snapshot-reading :deep(:is(th,td)) { border: 1px solid var(--c-line); padding: .35em .7em; text-align: start; }
.snapshot-reading :deep(th) { font-weight: 600; }
.snapshot-reading :deep(pre) { margin: .6em 0; padding: .65em; border-radius: 6px; background: var(--c-code-bg); }
.snapshot-reading :deep(code) { font: .9em/1.6 var(--font-mono); }
.snapshot-reading :deep(a) { text-decoration: underline; text-underline-offset: .16em; }
.snapshot-reading :deep([data-activity-change]) { background: color-mix(in srgb, var(--c-accent) 8%, transparent); }
.snapshot-reading :deep(> [data-activity-change]) { box-shadow: -2px 0 var(--c-accent); padding-inline-start: 6px; }
.snapshot-reading :deep(tr[data-activity-change] > :first-child) { box-shadow: inset 2px 0 var(--c-accent); }
@media (hover:hover) { .snapshot-tools button:hover { background: var(--c-hover); color: var(--c-ink); } }
@media (pointer:coarse) { .snapshot-tools button { min-height: 44px; } }
</style>
