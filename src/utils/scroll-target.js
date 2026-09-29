/** Long jumps should finish immediately; smooth scrolling is useful only nearby. */
export function scrollToTarget(scroller, target, offset = 90) {
  if (!scroller || !target) return
  const top = Math.max(0, target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset)
  const distance = Math.abs(top - scroller.scrollTop)
  scroller.scrollTo({ top, behavior: distance > scroller.clientHeight * 1.5 ? 'auto' : 'smooth' })
}
