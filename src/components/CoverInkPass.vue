<template>
  <span ref="frame" class="cover-ink-frame" aria-hidden="true">
    <svg v-if="started && active && allowed" class="cover-ink-pass" :class="{'is-paused': !running}"
      :data-cover-ink="artwork.id" focusable="false" viewBox="-600 0 2400 400" :style="placement">
      <use class="paper-gesture" :href="artwork.inkUrl + '#gesture'" />
      <g class="ink-writing">
        <use class="wet-line" :href="artwork.inkUrl + '#nib'" />
        <use class="pen-tip" :href="artwork.inkUrl + '#nib'" />
      </g>
      <use class="ink-answer" :href="artwork.inkUrl + '#answer'" />
    </svg>
  </span>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  artwork: { type: Object, required: true },
  position: { type: Number, default: 50 },
  active: { type: Boolean, default: true }
})
const frame = ref(null)
const inView = ref(false), pageVisible = ref(false), allowed = ref(false), started = ref(false)
const running = computed(() => props.active && inView.value && pageVisible.value && allowed.value)
const placement = computed(() => ({
  top: props.position + '%', transform: 'translate(-50%, -' + props.position + '%)'
}))
// Defer the external stroke until its *cropped frame* first appears. After that,
// leaving the viewport pauses the current beat instead of replaying its beginning.
watch(running, visible => { if (visible) started.value = true }, { flush:'sync' })
let observer, reduced, print
function syncEnvironment() {
  pageVisible.value = !document.hidden
  allowed.value = !reduced.matches && !print.matches
}
onMounted(() => {
  reduced = matchMedia('(prefers-reduced-motion: reduce)')
  print = matchMedia('print')
  reduced.addEventListener('change', syncEnvironment)
  print.addEventListener('change', syncEnvironment)
  document.addEventListener('visibilitychange', syncEnvironment)
  syncEnvironment()
  observer = new IntersectionObserver(([entry]) => { inView.value = entry.intersectionRatio > 0 }, {threshold:[0,.001]})
  observer.observe(frame.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  reduced?.removeEventListener('change', syncEnvironment)
  print?.removeEventListener('change', syncEnvironment)
  document.removeEventListener('visibilitychange', syncEnvironment)
})
</script>

<style scoped>
/* The fixed mask stays registered with the print while the paper inside it moves. */
@property --paper-lift {
  syntax: '<number>';
  inherits: true;
  initial-value: 0;
}
.cover-ink-frame {
  display:block; position:absolute; inset:0; container-type:size; overflow:clip;
  border-radius:inherit; pointer-events:none; --ink-cycle:7200ms;
}
.cover-ink-pass {
  position:absolute; left:50%; width:max(100cqw, 600cqh); height:auto; max-width:none;
}
.cover-ink-pass :is(g, use) { animation-duration:var(--ink-cycle); animation-iteration-count:infinite; animation-timing-function:linear; }
.paper-gesture { animation-name:paper-lift; }
[data-cover-ink="ink-margin"] .paper-gesture { animation-name:underline; }
.ink-writing { animation-name:ink-dry; }
.wet-line {
  animation-name:ink-draw; stroke:#3a70b3; stroke-dasharray:1 1;
  --pen-start:1; --pen-end:0;
}
.pen-tip {
  animation-name:ink-draw; stroke:#6796cd; stroke-dasharray:.09 1;
  --pen-start:.09; --pen-end:-.91;
}
.ink-answer { animation-name:ink-answer; stroke:#60758a; stroke-dasharray:.27 1; }
/* Paper moves first, wet ink crosses the subject, then a quieter stroke
   travels a little farther out. The whole printed plate rests between passes. */
@keyframes paper-lift {
  0%, 1% { --paper-lift:0; opacity:0; animation-timing-function:cubic-bezier(.32,0,.22,1); }
  4% { opacity:1; }
  16%, 20% { --paper-lift:1; animation-timing-function:cubic-bezier(.46,0,.28,1); }
  35% { --paper-lift:0; opacity:1; }
  37%, 100% { --paper-lift:0; opacity:0; }
}
/* A pencil mark fades where it was written; only a physical sheet moves back. */
@keyframes underline {
  0%, 1% { --paper-lift:0; opacity:0; animation-timing-function:cubic-bezier(.32,0,.22,1); }
  4% { opacity:1; }
  16%, 22% { --paper-lift:1; opacity:1; }
  35%, 100% { --paper-lift:1; opacity:0; }
}
@keyframes ink-draw {
  0%, 11% { stroke-dashoffset:var(--pen-start); animation-timing-function:cubic-bezier(.36,.12,.32,.96); }
  32%, 100% { stroke-dashoffset:var(--pen-end); }
}
@keyframes ink-dry {
  0%, 11% { opacity:0; }
  15%, 32% { opacity:1; }
  41%, 100% { opacity:0; }
}
@keyframes ink-answer {
  0%, 29% { opacity:0; stroke-dashoffset:.27; }
  34% { opacity:.88; }
  47% { opacity:.76; }
  54%, 100% { opacity:0; stroke-dashoffset:-1; }
}
.cover-ink-pass.is-paused :is(g, use) { animation-play-state:paused; }
@media print,(prefers-reduced-motion:reduce) { .cover-ink-frame {display:none} }
</style>
