export function scrollBehavior(animate = true) {
  return animate && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant'
}

/** Long jumps should finish immediately; smooth scrolling is useful only nearby. */
export function scrollToTarget(scroller, target, offset = 90) {
  if (!scroller || !target) return
  const top = Math.max(0, target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset)
  const distance = Math.abs(top - scroller.scrollTop)
  scroller.scrollTo({ top, behavior: scrollBehavior(distance <= scroller.clientHeight * 1.5) })
}
