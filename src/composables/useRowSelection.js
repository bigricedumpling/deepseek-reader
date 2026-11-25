import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { createRowSelectionMotion } from '../utils/row-selection-motion'

// The marker lives inside the selected row, so a layout change (sort, scroll,
// folder collapse) carries it with the content. Only a new selection travels.
export function useRowSelection({ viewport, selector, selection, scope, visible, layout }) {
  const row = shallowRef(null)
  const marker = ref(null)
  const motion = createRowSelectionMotion()
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  let pending = null

  function stop() {
    pending = null
    motion.stop()
  }
  function onPreferenceChange() {
    if (preference.matches) stop()
  }
  preference.addEventListener('change', onPreferenceChange)
  onBeforeUnmount(() => {
    stop()
    preference.removeEventListener('change', onPreferenceChange)
  })

  watch([selection, scope], ([next, context], [previous, oldContext]) => {
    if (next === previous || context !== oldContext || !visible() || preference.matches) {
      stop()
      return
    }
    // Read the presented pose before Vue moves the marker, even on reversal.
    pending = { from: motion.capture(marker.value, viewport.value) }
  }, { flush: 'pre' })

  watch([viewport, selection, scope, visible, ...layout], async () => {
    const transition = pending
    pending = null
    const target = visible() ? viewport.value?.querySelector(selector) : null
    const nextRow = target && !target.closest('[inert]') ? target : null
    if (!nextRow || (!transition && nextRow !== row.value)) motion.stop()
    row.value = nextRow
    if (!nextRow || !transition || preference.matches) return
    await nextTick()
    if (row.value === nextRow && marker.value?.parentElement === nextRow && visible() && !preference.matches) {
      motion.move(marker.value, viewport.value, transition.from)
    }
  }, { flush: 'post', immediate: true })

  return { row, marker }
}
