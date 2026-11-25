import { ref, watch } from 'vue'

/** Keep an anchored picker inside the visible viewport, including the on-screen keyboard. */
export function usePickerPlacement(panel, anchor, preferredWidth, align = 'start') {
  const style = ref({ position: 'fixed', visibility: 'hidden' })
  watch(panel, (element, _, cleanup) => {
    if (!element) return
    const viewport = window.visualViewport
    const gutter = 12
    function place() {
      const x = viewport?.offsetLeft || 0
      const y = viewport?.offsetTop || 0
      const width = Math.min(preferredWidth, (viewport?.width || innerWidth) - gutter * 2)
      const maxHeight = Math.max(1, (viewport?.height || innerHeight) - gutter * 2)
      const right = x + (viewport?.width || innerWidth) - gutter
      const bottom = y + maxHeight + gutter
      const height = Math.min(element.offsetHeight, maxHeight)
      const rect = anchor.value?.isConnected ? anchor.value.getBoundingClientRect() : null
      const left = rect ? (align === 'end' ? rect.right - width : rect.left) : (x + gutter + right - width) / 2
      let top = rect ? rect.bottom + 6 : y + gutter
      if (rect && top + height > bottom && rect.top - 6 - height >= y + gutter) top = rect.top - 6 - height
      style.value = {
        position: 'fixed', width: width + 'px', maxHeight: maxHeight + 'px',
        left: Math.max(x + gutter, Math.min(left, right - width)) + 'px',
        top: Math.max(y + gutter, Math.min(top, bottom - height)) + 'px'
      }
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(element)
    window.addEventListener('resize', place)
    viewport?.addEventListener('resize', place)
    viewport?.addEventListener('scroll', place)
    cleanup(() => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      viewport?.removeEventListener('resize', place)
      viewport?.removeEventListener('scroll', place)
    })
  }, { flush: 'post' })
  return style
}
