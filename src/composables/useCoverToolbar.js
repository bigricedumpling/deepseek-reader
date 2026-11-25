import { onBeforeUnmount, watch } from 'vue'
import { renderCoverFrame } from '../utils/cover-renderer.js'

// Read a small map of the actual cover crop once. Scrolling only looks up
// samples in this map; moving tab labels never trigger a canvas readback.
export function useCoverToolbar(cover, plane, toolbar, overCover) {
  let pixels, frame = 0, needsMap = true
  const targets = '.side-header.is-topbar:not(.is-merged), .doc-tab, .doc-quick, .doc-context, .doc-tools:not(.over-outline)'
  const marked = new Set()

  function readMap(surface) {
    const el = document.createElement('canvas')
    const w = el.width = 96
    const h = el.height = Math.max(8, Math.min(96, Math.round(w * surface.clientHeight / surface.clientWidth)))
    const ctx = el.getContext('2d', { willReadFrequently: true })
    if (!ctx || !cover.value || !surface.clientWidth) return
    if (cover.value.type === 'gradient') {
      // Use a stable frame so animated materials cannot make the text pulse.
      if (!renderCoverFrame(el, cover.value, 0)) return
    } else {
      const img = [...surface.querySelectorAll('img')].findLast(img => !img.closest('.cover-swap-leave-active'))
      if (!img?.complete || !img.naturalWidth) return
      const scale = Math.max(surface.clientWidth / img.naturalWidth, surface.clientHeight / img.naturalHeight)
      const sw = surface.clientWidth / scale, sh = surface.clientHeight / scale
      const sy = (img.naturalHeight - sh) * (cover.value.position ?? 50) / 100
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, sy, sw, sh, 0, 0, w, h)
    }
    try { return ctx.getImageData(0, 0, w, h) } catch { return undefined }
  }

  function toneAt(rect, bounds, previous) {
    if (!pixels || !bounds.width || !bounds.height) return 'unknown'
    const left = Math.max(bounds.left, rect.left), right = Math.min(bounds.right, rect.right)
    const y = Math.max(0, Math.min(pixels.height - 1, Math.floor(((rect.top + rect.height / 2 - bounds.top) / bounds.height) * pixels.height)))
    const levels = []
    for (const fraction of [.1, .3, .5, .7, .9]) {
      const x = Math.max(0, Math.min(pixels.width - 1, Math.floor(((left + (right - left) * fraction - bounds.left) / bounds.width) * pixels.width)))
      const at = (y * pixels.width + x) * 4
      if (pixels.data[at + 3] < 200) continue
      let luma = 0
      for (let i = 0; i < 3; i++) {
        const s = pixels.data[at + i] / 255
        luma += [.2126, .7152, .0722][i] * (s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4)
      }
      levels.push(luma)
    }
    if (!levels.length) return 'unknown'
    levels.sort((a, b) => a - b)
    const threshold = previous === 'dark' ? .21 : .18
    return levels[Math.floor(levels.length / 2)] > threshold ? 'light' : 'dark'
  }

  function clear() {
    for (const el of marked) el.removeAttribute('data-cover-surface')
    marked.clear()
  }
  function update() {
    frame = 0
    const surface = plane.value, bar = toolbar.value?.closest('.app-topbar')
    if (!overCover.value || !bar || !surface) { clear(); return }
    if (needsMap) { pixels = readMap(surface); needsMap = false }
    const bounds = surface.getBoundingClientRect()
    const next = new Map()
    for (const el of bar.querySelectorAll(targets)) {
      const rect = el.getBoundingClientRect()
      if (rect.width && rect.right > bounds.left && rect.left < bounds.right)
        next.set(el, toneAt(rect, bounds, el.dataset.coverSurface))
    }
    for (const el of marked) if (!next.has(el)) { el.removeAttribute('data-cover-surface'); marked.delete(el) }
    for (const [el, tone] of next) {
      if (el.dataset.coverSurface !== tone) el.dataset.coverSurface = tone
      marked.add(el)
    }
  }
  function measure() { if (!frame) frame = requestAnimationFrame(update) }
  function invalidate() { needsMap = true; measure() }
  watch(cover, invalidate, { deep: true, flush: 'post' })
  watch([plane, toolbar, overCover], ([surface, node, visible], _, cleanup) => {
    invalidate()
    const bar = node?.closest('.app-topbar')
    if (!surface || !bar || !visible) return
    const surfaceSize = new ResizeObserver(invalidate)
    const toolbarSize = new ResizeObserver(measure)
    const tabs = new MutationObserver(measure)
    surfaceSize.observe(surface)
    toolbarSize.observe(bar)
    const left = bar.querySelector('#app-topbar-left')
    if (left) toolbarSize.observe(left)
    tabs.observe(bar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] })
    surface.addEventListener('load', invalidate, true)
    bar.addEventListener('scroll', measure, true)
    bar.addEventListener('transitionend', measure)
    cleanup(() => {
      surfaceSize.disconnect(); toolbarSize.disconnect(); tabs.disconnect()
      surface.removeEventListener('load', invalidate, true)
      bar.removeEventListener('scroll', measure, true)
      bar.removeEventListener('transitionend', measure)
    })
  }, { flush: 'post' })
  onBeforeUnmount(() => { cancelAnimationFrame(frame); clear() })
  return measure
}
