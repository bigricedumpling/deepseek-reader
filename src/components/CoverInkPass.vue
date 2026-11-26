<template>
  <span ref="frame" class="cover-ink-frame" aria-hidden="true">
    <svg v-if="started && active && allowed" class="cover-ink-pass" :class="{'is-paused': !running}"
      :data-cover-ink="artwork.id" focusable="false" viewBox="-600 0 2400 400" :style="placement">
      <use class="wet-line" :href="artwork.inkUrl" />
      <use class="pen-tip" :href="artwork.inkUrl" />
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
.cover-ink-frame {
  display:block; position:absolute; inset:0; container-type:size; overflow:clip;
  border-radius:inherit; pointer-events:none; --ink-cycle:6500ms;
}
.cover-ink-pass {
  position:absolute; left:50%; width:max(100cqw, 600cqh); height:auto; max-width:none;
  animation:ink-dry var(--ink-cycle) linear infinite;
}
.wet-line {
  stroke:#3a70b3; stroke-dasharray:1 1;
  --pen-start:1; --pen-end:0;
}
.pen-tip {
  stroke:#6796cd; stroke-dasharray:.09 1;
  --pen-start:.09; --pen-end:-.91;
}
use { animation:ink-draw var(--ink-cycle) linear infinite; }
/* Draw for ~1.15 s, let the wet ink settle, then rest on the original paper. */
@keyframes ink-draw {
  0%, 1.5% { stroke-dashoffset:var(--pen-start); animation-timing-function:cubic-bezier(.36,.12,.32,.96); }
  19%, 100% { stroke-dashoffset:var(--pen-end); }
}
@keyframes ink-dry {
  0%, 1.5% { opacity:0; }
  3.5%, 20% { opacity:1; }
  27%, 100% { opacity:0; }
}
.cover-ink-pass.is-paused, .cover-ink-pass.is-paused use { animation-play-state:paused; }
@media print,(prefers-reduced-motion:reduce) { .cover-ink-frame {display:none} }
</style>
