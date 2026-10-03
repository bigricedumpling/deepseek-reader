import { watch, nextTick, onBeforeUnmount } from 'vue'
const stack = []
/** Trap focus only for the top dialog; restore the invoking control on close. */
export function useDialogFocus(open, element, cancel) {
  const token = {}; let previous
  function keydown(event) {
    if (stack.at(-1) !== token || !element.value) return
    if (event.key === 'Escape' && cancel) { event.preventDefault(); event.stopPropagation(); cancel(); return }
    if (event.key !== 'Tab') return
    const controls = [...element.value.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter(el => el.getClientRects().length)
    const first = controls[0] || element.value, last = controls.at(-1) || first
    if (!element.value.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus()
    }
  }
  function release() {
    const wasTop = stack.at(-1) === token, index = stack.indexOf(token)
    if (index >= 0) stack.splice(index, 1)
    document.removeEventListener('keydown', keydown, true)
    if (wasTop && previous?.isConnected) previous.focus()
  }
  watch(open, async visible => {
    if (!visible) { release(); return }
    previous = document.activeElement; stack.push(token)
    document.addEventListener('keydown', keydown, true)
    await nextTick()
    if (stack.at(-1) === token) (element.value?.querySelector('input,button:not(:disabled),textarea') || element.value)?.focus()
  })
  onBeforeUnmount(release)
}
