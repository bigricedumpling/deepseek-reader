<template>
  <div ref="surface" class="gradient-cover" :style="background">
    <canvas ref="canvas" aria-hidden="true" />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { coverPalettes } from '../utils/cover-presets'
import { renderCoverFrame } from '../utils/cover-renderer'

const props = defineProps({
  cover: { type: Object, required: true },
  active: { type: Boolean, default: true }
})
const surface = ref(null)
const canvas = ref(null)
const background = computed(() => {
  const [a, b, c] = props.cover.colors || coverPalettes[0]
  return { backgroundImage: `radial-gradient(ellipse at 20% 30%, ${a}, transparent 75%), linear-gradient(110deg, ${b}, ${c})` }
})

let intersections, sizes, reduced, print
let inView = false
let seconds = 0
let lastTick = 0
let frame = 0
let timer = 0
let lastPaint = -1

function cancel() {
  clearTimeout(timer)
  cancelAnimationFrame(frame)
  timer = frame = lastTick = 0
}

function redraw() {
  const el = canvas.value
  if (!el || !el.clientWidth || !el.clientHeight) return false
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 1280 / el.clientWidth, 550 / el.clientHeight)
  const width = Math.max(1, Math.round(el.clientWidth * ratio))
  const height = Math.max(1, Math.round(el.clientHeight * ratio))
  if (width !== el.width || height !== el.height) {
    el.width = width
    el.height = height
    lastPaint = -1
  }
  if (lastPaint === seconds) return true
  if (!renderCoverFrame(el, props.cover, seconds)) return false
  lastPaint = seconds
  return true
}

function moving() {
  return props.active && props.cover.animated && inView && !document.hidden && !reduced.matches && !print.matches
}
function tick(now) {
  frame = 0
  if (!moving()) { cancel(); return }
  if (lastTick) seconds += Math.min(now - lastTick, 160) / 1000
  lastTick = now
  // Aim for a steady 30 fps. Leave room for the next display refresh, including
  // time spent drawing; animating artwork must not monopolize the editor's frames.
  if (redraw()) timer = setTimeout(() => { frame = requestAnimationFrame(tick) },
    Math.max(0, 1000 / 30 - (performance.now() - now) - 8))
}
function sync() {
  cancel()
  if (!canvas.value || !reduced) return
  if (reduced.matches || print.matches || !props.cover.animated) seconds = 0
  if (redraw() && moving()) frame = requestAnimationFrame(tick)
}
watch(() => props.cover, () => { seconds = 0; lastPaint = -1; sync() }, { deep: true, flush: 'post' })
watch(() => props.active, sync)
onMounted(() => {
  reduced = matchMedia('(prefers-reduced-motion: reduce)')
  print = matchMedia('print')
  reduced.addEventListener('change', sync)
  print.addEventListener('change', sync)
  document.addEventListener('visibilitychange', sync)
  // A translated cover can touch the top edge with an empty intersection.
  intersections = new IntersectionObserver(([entry]) => {
    inView = entry.intersectionRatio > 0
    sync()
  }, { threshold: [0, .001] })
  intersections.observe(surface.value)
  sizes = new ResizeObserver(sync)
  sizes.observe(surface.value)
  sync()
})
onBeforeUnmount(() => {
  cancel()
  intersections?.disconnect()
  sizes?.disconnect()
  reduced?.removeEventListener('change', sync)
  print?.removeEventListener('change', sync)
  document.removeEventListener('visibilitychange', sync)
})
</script>

<style scoped>
.gradient-cover, .gradient-cover canvas { display: block; width: 100%; height: 100%; }
</style>
