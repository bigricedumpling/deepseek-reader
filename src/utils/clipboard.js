/** Clipboard with a legacy fallback for non-secure/local host contexts. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through */ }
  const area = document.createElement('textarea')
  const previousFocus = document.activeElement
  const selection = document.getSelection()
  const ranges = Array.from({ length: selection?.rangeCount || 0 }, (_, i) => selection.getRangeAt(i).cloneRange())
  try {
    area.value = text
    area.setAttribute('readonly', '')
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
    document.body.append(area)
    area.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    const restore = document.activeElement === area
    area.remove()
    if (restore && previousFocus?.isConnected) {
      previousFocus.focus({ preventScroll: true })
      selection?.removeAllRanges()
      for (const range of ranges) selection.addRange(range)
    }
  }
}
