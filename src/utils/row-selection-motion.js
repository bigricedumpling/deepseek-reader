// Each list owns one in-flight selection. The row continues to own its fill, so
// scrolling and reordering don't need a frame loop or a synthetic position.
const steps = [0, .125, .25, .375, .5, .625, .75, .875, 1]
const ease = 'cubic-bezier(.32,0,.18,1)'

function intersects(box, view) {
  return box.width > 0 && box.height > 0 && view.width > 0 && view.height > 0
    && box.top < view.bottom && box.bottom > view.top && box.left < view.right && box.right > view.left
}

function transform(x, y, scaleX, scaleY) {
  return `translate(${x}px,${y}px) scale(${scaleX},${scaleY})`
}

function stretchFrames(from, to, initialWaist, opacity) {
  const topTravel = to.top - from.top
  const bottomTravel = to.bottom - from.bottom
  const down = topTravel > 0
  // Both edges stay between their endpoints, including on a mid-flight reversal.
  const stretch = topTravel * bottomTravel > 0
    ? Math.min(17, Math.min(Math.abs(topTravel), Math.abs(bottomTravel)) * .24, to.height * .38)
    : 0
  return steps.map(p => {
    const remaining = 1 - p
    const tension = 4 * p * remaining * stretch
    const head = tension * remaining
    const tail = tension * p
    const y = -topTravel * remaining - (down ? tail : head)
    const height = from.height * remaining + to.height * p + tension
    const width = from.width * remaining + to.width * p
    return {
      offset: p,
      transformOrigin: '0 0',
      transform: transform((from.left - to.left) * remaining, y, width / to.width, height / to.height),
      opacity: opacity * remaining + p,
      '--row-waist': (initialWaist * remaining + tension * .23) + 'px'
    }
  })
}

export function createRowSelectionMotion() {
  let active
  let exit
  let departing

  function stop() {
    if (active) {
      active.effect.target.classList.remove('row-selection-stretching')
      active.cancel()
      active = null
    }
    exit?.cancel()
    exit = null
    departing?.remove()
    departing = null
  }

  function readPose(marker, viewport) {
    if (!marker?.isConnected || !viewport?.contains(marker)) return null
    const row = marker.parentElement
    const style = getComputedStyle(marker)
    const rect = marker.getBoundingClientRect()
    return {
      rect, row, viewport, origin: row.getBoundingClientRect(),
      visible: intersects(rect, viewport.getBoundingClientRect()),
      clip: row.closest('.tree-children-inner'),
      opacity: Number(style.opacity), waist: parseFloat(style.getPropertyValue('--row-waist')) || 0
    }
  }

  function capture(marker, viewport) {
    const snapshot = readPose(marker, viewport)
    if (snapshot) {
      snapshot.template = marker.cloneNode(true)
      // On an immediate A → B → A, A may still be visibly fading out.
      snapshot.retiring = readPose(departing, viewport)
    }
    stop()
    return snapshot
  }

  function move(marker, viewport, snapshot) {
    stop()
    if (!marker?.animate || !viewport?.contains(marker) || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const view = viewport.getBoundingClientRect()
    const to = marker.getBoundingClientRect()
    const visible = intersects(to, view)
    const sameList = snapshot?.viewport === viewport && viewport.contains(snapshot.row)
    // Anchor the captured pose to its original row if the scroll offset changed.
    let from
    let sourceVisible = false
    if (sameList) {
      const current = snapshot.row.getBoundingClientRect()
      from = new DOMRect(snapshot.rect.x + current.x - snapshot.origin.x,
        snapshot.rect.y + current.y - snapshot.origin.y, snapshot.rect.width, snapshot.rect.height)
      sourceVisible = current.width > 0 && current.height > 0 && snapshot.visible
        && intersects(from, view) && !snapshot.row.closest('[inert]')
    }
    const distance = from ? Math.abs(to.top - from.top) : 0
    const direction = from ? Math.sign(to.top - from.top) : 0
    const returning = sameList && snapshot.retiring?.row === marker.parentElement && snapshot.retiring.visible
      ? snapshot.retiring : null
    const near = !returning && visible && sourceVisible && snapshot.clip === marker.closest('.tree-children-inner')
      && distance <= Math.min(160, to.height * 3.4)
    let frames
    let duration
    if (near) {
      frames = stretchFrames(from, to, snapshot.waist, snapshot.opacity)
      duration = Math.min(350, 245 + distance * .72)
      marker.classList.add('row-selection-stretching')
    } else {
      if (sourceVisible && snapshot.row !== marker.parentElement) {
        departing = snapshot.template
        departing.classList.add('row-selection-departure')
        departing.classList.toggle('row-selection-stretching', snapshot.waist > 0)
        departing.setAttribute('aria-hidden', 'true')
        snapshot.row.append(departing)
        const rest = departing.getBoundingClientRect()
        const x = from.x - rest.x, y = from.y - rest.y
        const sx = from.width / (rest.width || from.width), sy = from.height / (rest.height || from.height)
        exit = departing.animate([
          { transformOrigin: '0 0', transform: transform(x, y, sx, sy),
            opacity: snapshot.opacity, '--row-waist': snapshot.waist + 'px' },
          { transformOrigin: '0 0', transform: transform(x, y + direction * 3, sx, sy * .96),
            opacity: 0, '--row-waist': '0px' }
        ], { duration: 145, easing: 'ease-out', fill: 'forwards' })
        const ghost = departing
        exit.onfinish = () => {
          ghost.remove()
          if (departing === ghost) { departing = null; exit = null }
        }
      }
      if (!visible) return
      if (returning) {
        const rect = returning.rect
        if (returning.waist) marker.classList.add('row-selection-stretching')
        frames = [
          { transformOrigin: '0 0', transform: transform(rect.x - returning.origin.x, rect.y - returning.origin.y,
            rect.width / to.width, rect.height / to.height), opacity: returning.opacity, '--row-waist': returning.waist + 'px' },
          { transformOrigin: '0 0', transform: 'none', opacity: 1, '--row-waist': '0px' }
        ]
      } else {
        frames = [
          { opacity: 0, transform: `translateY(${-direction * 5}px) scale(.99,.94)` },
          { opacity: 1, transform: 'none' }
        ]
      }
      duration = 215
    }
    const animation = marker.animate(frames, { duration, easing:ease })
    active = animation
    animation.onfinish = () => {
      if (active !== animation) return
      marker.classList.remove('row-selection-stretching')
      active = null
    }
  }

  return { capture, move, stop }
}
