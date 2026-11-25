const headingSelector = 'h1,h2,h3,h4,h5,h6'
const changesHeadings = node => node.nodeType === 1 &&
  (node.matches(headingSelector) || (node.childElementCount && node.querySelector(headingSelector)))

// The editor can mount late, replace its document or switch to a rendered
// reading surface. Rebuild only when a heading enters or leaves the DOM.
export function createOutlinePosition(onChange) {
  let scroller = null
  let headings = null
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(changesHeadings))) {
      headings = null
      onChange()
    }
  })
  function bind(next) {
    if (next === scroller) return
    observer.disconnect()
    headings = null
    scroller = next
    if (next) observer.observe(next, { childList: true, subtree: true })
  }
  function list() {
    if (!headings) {
      // Startup recovery can retain the hidden editor host beside the readable
      // article. Both carry ProseMirror's typography; only one is the document.
      const article = scroller?.querySelector('.source-reading .ProseMirror') || scroller?.querySelector('.editor-shell .ProseMirror')
      headings = [...(article?.querySelectorAll(headingSelector) || [])]
        .filter(node => !node.closest('.reader-rich-block,.reader-columns,.reader-raw-block'))
    }
    return headings
  }
  function atViewport() {
    const items = list()
    if (!items.length) return -1
    const limit = scroller.getBoundingClientRect().top + 120
    let first = 0, last = items.length - 1, active = 0
    while (first <= last) {
      const mid = (first + last) >>> 1
      let visible = mid
      while (visible <= last && !items[visible].getClientRects().length) visible++
      if (visible <= last && items[visible].getBoundingClientRect().top <= limit) {
        active = visible
        first = visible + 1
      } else last = mid - 1
    }
    return active
  }
  return { bind, list, atViewport }
}
