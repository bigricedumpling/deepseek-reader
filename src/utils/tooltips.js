/** One lightweight tooltip for existing title-bearing controls. */
export function installTooltips() {
  const tip = document.createElement('div')
  tip.className = 'reader-tooltip'
  tip.setAttribute('role', 'tooltip')
  tip.setAttribute('aria-hidden', 'true')
  document.body.append(tip)

  let active = null
  let timer = 0
  let keyboardFocus = false
  function hide() {
    clearTimeout(timer)
    active = null
    tip.classList.remove('is-visible')
    tip.setAttribute('aria-hidden', 'true')
  }
  function show(anchor) {
    if (active === anchor && tip.classList.contains('is-visible')) return
    hide()
    const label = anchor.getAttribute('title') || anchor.dataset.tooltip
    if (!label) return
    // Text buttons already explain themselves; reserve automatic hints for icon controls.
    if (!anchor.dataset.tooltip && anchor.textContent.trim().length > 2) {
      anchor.removeAttribute('title')
      return
    }
    anchor.dataset.tooltip = label
    anchor.removeAttribute('title')
    if (!anchor.getAttribute('aria-label') && !anchor.textContent.trim()) anchor.setAttribute('aria-label', label)
    active = anchor
    tip.textContent = label
    tip.classList.toggle('is-long', label.length > 22)
    timer = window.setTimeout(() => {
      if (active !== anchor || !anchor.isConnected || anchor.getAttribute('aria-expanded') === 'true') return
      const rect = anchor.getBoundingClientRect()
      tip.classList.add('is-visible')
      tip.setAttribute('aria-hidden', 'false')
      const width = tip.offsetWidth
      const height = tip.offsetHeight
      const left = Math.min(innerWidth - width - 8, Math.max(8, rect.left + rect.width / 2 - width / 2))
      const below = rect.top < height + 16
      tip.style.left = left + 'px'
      tip.style.top = (below ? rect.bottom + 8 : rect.top - height - 8) + 'px'
    }, 550)
  }
  function anchorFor(target) { return target?.closest?.('[title], [data-tooltip]') }
  document.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse' || !window.matchMedia('(any-hover: hover)').matches) return
    const anchor = anchorFor(event.target)
    if (anchor && anchor !== active) show(anchor)
  })
  document.addEventListener('pointerout', event => {
    if (active && active.contains(event.target) && !active.contains(event.relatedTarget)) hide()
  })
  document.addEventListener('focusin', event => {
    const anchor = anchorFor(event.target)
    if (anchor && keyboardFocus) show(anchor)
  })
  document.addEventListener('focusout', event => {
    if (active && active.contains(event.target) && !active.contains(event.relatedTarget)) hide()
  })
  document.addEventListener('pointerdown', event => {
    keyboardFocus = false; hide()
    if (event.pointerType !== 'mouse') {
      const anchor = anchorFor(event.target)
      if (anchor?.hasAttribute('title')) {
        const label = anchor.getAttribute('title')
        anchor.dataset.tooltip = label; anchor.removeAttribute('title')
        if (!anchor.getAttribute('aria-label') && !anchor.textContent.trim()) anchor.setAttribute('aria-label', label)
      }
    }
  }, true)
  document.addEventListener('click', hide, true)
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') keyboardFocus = true
    if (event.key === 'Escape') hide()
  }, true)
  new MutationObserver(() => { if (active && (!active.isConnected || active.getAttribute('aria-expanded') === 'true')) hide() }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded'] })
  window.addEventListener('scroll', hide, true)
  window.addEventListener('resize', hide)
}
