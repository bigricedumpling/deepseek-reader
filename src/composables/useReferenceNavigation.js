import { nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { readerApi } from '../services/readerClient'
import { documentRoutePath } from '../utils/routes.js'
import { foldKey, unfoldKeys } from '../utils/toc-fold.js'
import { scrollToTarget } from '../utils/scroll-target.js'

const headingSelector = 'h1,h2,h3,h4,h5,h6'
const slug = text => text.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s+/g, '-')

function findAnchor(article, fragment) {
  const exact = [...article.querySelectorAll('[id]')].find(el => el.id === fragment)
  if (exact) return exact
  const used = new Set()
  for (const heading of article.querySelectorAll(headingSelector)) {
    const base = slug(heading.textContent)
    let name = base, suffix = 1
    while (used.has(name)) name = base + '-' + suffix++
    used.add(name)
    if (name === fragment.toLowerCase() || heading.textContent.trim() === fragment) return heading
  }
}

function showAnchor(article, target) {
  if (!target.closest('.reader-folded')) return
  const ancestors = [], counts = new Map()
  for (const heading of article.querySelectorAll(headingSelector)) {
    if (heading === target || !(heading.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) break
    const level = Number(heading.tagName[1]), text = heading.textContent.trim(), group = level + '|' + text
    const nth = counts.get(group) || 0
    counts.set(group, nth + 1)
    while (ancestors.length && ancestors.at(-1).level >= level) ancestors.pop()
    ancestors.push({ level, key: foldKey(level, text, nth) })
  }
  unfoldKeys(ancestors.map(heading => heading.key))
}

export function useReferenceNavigation(store, scroller, { stopRestore, restorePosition }) {
  let stopWaiting = () => {}
  let generation = 0
  let index = history.state?.typocketReference?.index ?? 0
  const initialPath = location.pathname
  const initialHash = location.hash.slice(1)

  async function place(file, hash, position) {
    stopWaiting()
    await nextTick()
    if (store.currentPath !== file || !scroller.value) return
    if (/\.pdf$/i.test(file)) {
      const page = position?.page || Number(new URLSearchParams(hash).get('page'))
      if (Number.isInteger(page) && page > 0) store.pdfPage = page
      return
    }
    if (position?.top != null) return restorePosition(position.top)
    if (!hash || !/\.md$/i.test(file)) return
    let fragment
    try { fragment = decodeURIComponent(hash) } catch { return }
    const box = scroller.value
    stopRestore()
    const observer = new MutationObserver(find)
    const events = ['wheel', 'pointerdown', 'keydown', 'touchstart']
    let frame = 0
    function stop() {
      observer.disconnect()
      clearTimeout(timer)
      if (frame) cancelAnimationFrame(frame)
      for (const type of events) window.removeEventListener(type, stop, true)
      stopWaiting = () => {}
    }
    const timer = setTimeout(() => {
      stop()
      if (store.currentPath === file) store.setError('未找到文内位置「' + fragment + '」')
    }, 7000)
    stopWaiting = stop
    for (const type of events) window.addEventListener(type, stop, { capture: true, passive: true })
    function find() {
      if (store.currentPath !== file) return stop()
      const article = box.querySelector('.source-reading .ProseMirror') || box.querySelector('.editor-shell .ProseMirror')
      const target = article && findAnchor(article, fragment)
      if (!target || frame) return
      showAnchor(article, target)
      frame = requestAnimationFrame(() => {
        frame = 0
        if (!target.isConnected || !target.getClientRects().length) return
        stop()
        scrollToTarget(box, target)
      })
    }
    observer.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['id', 'class'] })
    find()
  }

  async function follow(reference) {
    const { file, fragment = '' } = typeof reference === 'string' ? { file: reference } : reference
    if (!file) return
    const request = ++generation
    stopWaiting()
    const previous = { file: store.currentPath, id: store.currentSourceId, index, top: scroller.value?.scrollTop ?? 0, page: store.pdfPage }
    const from = location.href, state = history.state
    if (!await store.select(file) || request !== generation) return
    const opened = store.currentPath
    const url = new URL(location.href)
    url.hash = fragment
    if (from !== url.href && previous.file) {
      history.replaceState({ ...state, typocketReference: previous }, '', from)
      history.pushState({ typocketReference: { index: ++index, file: opened, id: store.currentSourceId } }, '', url)
    }
    await place(opened, fragment)
  }

  async function revisit(event) {
    const entry = event.state?.typocketReference
    if (!entry?.file) return
    const request = ++generation, hash = location.hash.slice(1)
    stopWaiting()
    let file = entry.file
    if (entry.id) {
      try {
        file = (await readerApi('GET', '/resolve?id=' + encodeURIComponent(entry.id))).data.path
      } catch (error) {
        if (request !== generation) return
        store.setError('无法返回原文档：' + error.message)
        file = ''
      }
    }
    if (request !== generation) return
    if (!file || !await store.select(file)) {
      if (request === generation && index !== entry.index) history.go(index - entry.index)
      return
    }
    if (request !== generation) return
    index = entry.index
    store.syncUrl()
    const url = new URL(location.href)
    url.hash = hash
    history.replaceState({ ...history.state, typocketReference: { ...entry, file } }, '', url)
    await place(store.currentPath, hash, entry)
  }

  // A pasted chapter URL can arrive before the library tree or editor is mounted.
  if (initialHash) {
    const unwatch = watch(() => [store.currentPath, store.currentLoaded], ([file, loaded]) => {
      if (!file || !loaded) return
      const suffix = '/' + documentRoutePath(file).split('/').map(encodeURIComponent).join('/')
      if (!initialPath.endsWith(suffix)) return
      unwatch()
      place(file, initialHash)
    }, { flush: 'post' })
  }
  watch(() => store.currentPath, () => stopWaiting(), { flush: 'sync' })
  onMounted(() => window.addEventListener('popstate', revisit))
  onBeforeUnmount(() => {
    generation++
    stopWaiting()
    window.removeEventListener('popstate', revisit)
  })
  return follow
}
