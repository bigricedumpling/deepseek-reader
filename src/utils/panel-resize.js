let finishCurrent
/** The full-window shield keeps PDF/HTML frames from swallowing pointer events. */
export function resizePanel(event, onMove, onEnd = () => {}) {
  if (event.button !== 0) return
  finishCurrent?.()
  event.preventDefault()
  const shield = document.createElement('div')
  shield.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:col-resize;touch-action:none;user-select:none'
  document.body.append(shield)
  const target = event.currentTarget
  try { target.setPointerCapture(event.pointerId) } catch {}
  const move = e => { if(e.pointerId === event.pointerId) onMove(e) }
  const finish = () => {
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', finish, true)
    window.removeEventListener('pointercancel', finish, true)
    window.removeEventListener('blur', finish)
    try { target.releasePointerCapture(event.pointerId) } catch {}
    shield.remove(); finishCurrent = null; onEnd()
  }
  finishCurrent = finish
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', finish, true)
  window.addEventListener('pointercancel', finish, true)
  window.addEventListener('blur', finish)
  return finish
}
