<template>
  <Teleport to="body">
    <div ref="dialog" role="dialog" aria-modal="true" aria-label="图片预览" class="reader-image-lightbox" @click.self="close">
      <div ref="scrim" class="reader-lightbox-scrim" aria-hidden="true"></div>
      <button ref="button" type="button" class="reader-lightbox-close" aria-label="关闭大图" @click="close"><PhX :size="20" /></button>
      <figure>
        <img ref="picture" :src="image.src" :alt="image.alt" :width="image.source?.naturalWidth || undefined"
          :height="image.source?.naturalHeight || undefined" />
        <figcaption v-if="image.caption" ref="caption">{{ image.caption }}</figcaption>
      </figure>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { PhX } from '../icons/remix'
import { useDialogFocus } from '../composables/useDialogFocus'

const props = defineProps({ image: { type: Object, required: true } })
const emit = defineEmits(['close'])
const dialog = ref(null), picture = ref(null), scrim = ref(null), button = ref(null), caption = ref(null)
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
let closing = false
let animations = []

// The invoking toolbar and context menu both disappear. Return keyboard focus to
// the same illustration, including in a read-only document, without scrolling.
function returnFocus() {
  const { source, editor } = props.image
  const target = source?.isConnected && source.getClientRects().length ? source : editor
  if (target && !target.hasAttribute('tabindex') && !target.isContentEditable) target.tabIndex = -1
  return target
}
useDialogFocus(() => !!dialog.value, dialog, close, returnFocus)

function originTransform() {
  const source = props.image.source
  if (!source?.isConnected || !source.naturalWidth || source.currentSrc !== props.image.src) return
  const origin = source.getBoundingClientRect(), end = picture.value.getBoundingClientRect()
  if (!origin.width || !origin.height || !end.width || !end.height) return
  let left = 0, top = 0, right = window.innerWidth, bottom = window.innerHeight
  for (let parent = source.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
    const bounds = parent.getBoundingClientRect()
    if (style.overflowX !== 'visible') { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right) }
    if (style.overflowY !== 'visible') { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom) }
  }
  if (origin.right <= left || origin.bottom <= top || origin.left >= right || origin.top >= bottom) return
  const x = origin.left + origin.width / 2 - end.left - end.width / 2
  const y = origin.top + origin.height / 2 - end.top - end.height / 2
  return `translate(${x}px, ${y}px) scale(${Math.min(origin.width / end.width, origin.height / end.height)})`
}
function cancelMotion() {
  for (const animation of animations) animation.cancel()
  animations = []
}
function play(leave) {
  const img = picture.value
  if (reduced.matches || !img?.animate) {
    cancelMotion()
    if (leave) emit('close')
    return
  }
  // A close during entry starts from the currently painted frame.
  const start = { transform: getComputedStyle(img).transform, opacity: getComputedStyle(img).opacity }
  const chrome = [scrim.value, button.value, caption.value].filter(Boolean)
  const opacity = chrome.map(el => leave ? getComputedStyle(el).opacity : '0')
  cancelMotion()
  const origin = originTransform()
  const atSource = { transform: origin || (leave ? start.transform : 'none'), opacity: origin ? 1 : 0 }
  const atRest = { transform: 'none', opacity: 1 }
  const timing = { duration: origin ? (leave ? 210 : 270) : 130, easing: 'cubic-bezier(.22,.72,.2,1)', fill: 'both' }
  const flight = img.animate(leave ? [start, atSource] : [atSource, atRest], timing)
  animations = [flight, ...chrome.map((el, i) =>
    el.animate([{ opacity: opacity[i] }, { opacity: leave ? 0 : 1 }], timing))]
  flight.onfinish = () => {
    if (leave) emit('close')
    else cancelMotion()
  }
}
function close() {
  if (closing) return
  closing = true
  play(true)
}
function preferenceChanged() {
  if (!reduced.matches) return
  cancelMotion()
  if (closing) emit('close')
}
onMounted(() => {
  props.image.source?.classList.add('reader-lightbox-source')
  reduced.addEventListener('change', preferenceChanged)
  play(false)
})
onBeforeUnmount(() => {
  reduced.removeEventListener('change', preferenceChanged)
  cancelMotion()
  props.image.source?.classList.remove('reader-lightbox-source')
  if (closing && document.activeElement === document.body) returnFocus()?.focus({ preventScroll: true })
})
</script>
