/**
 * 正文区的滚动：回顶按钮的显隐、T 键回顶、以及切文档时记住读到哪。
 *
 * 这部分原先散在 DocView.vue 里，和工具条 UI、搜索、导出混在一个 700 行的文件里。
 * 它和界面长什么样没关系，只是谁在滚、滚到哪了，所以单独拿出来。
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

/** 滚过这个距离才值得显示回顶按钮，太早出现会一直晃 */
const SHOW_AFTER = 420

export function useDocScroll({ scroller, docId, scrollTopSignal, onRestore }) {
  const showTop = ref(false)
  /** 每篇文档读到哪。存一份到 localStorage：硬刷新（改完代码要刷新）之后还能接上 */
  const POS_KEY = 'reader.pos'
  const positions = ref(loadPositions())

  function loadPositions() {
    try {
      const raw = localStorage.getItem(POS_KEY)
      return raw ? JSON.parse(raw) || {} : {}
    } catch {
      return {}
    }
  }

  let saveTimer = null
  function savePositions() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(positions.value))
      } catch {
        /* 写不了就算了，只是丢个位置 */
      }
    }, 600)
  }

  function onScroll() {
    const el = scroller.value
    if (!el) return
    showTop.value = el.scrollTop > SHOW_AFTER
    if (docId.value) {
      positions.value[docId.value] = el.scrollTop
      savePositions()
    }
  }

  function scrollTop() {
    scroller.value?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** T 键回顶。在输入框或正文里打字时不能抢键 */
  function onKey(e) {
    const el = e.target
    const tag = (el.tagName || '').toLowerCase()
    if (el.isContentEditable || tag === 'input' || tag === 'textarea') return
    if (e.key === 't' || e.key === 'T') scrollTop()
  }

  /* 目录里的回顶按钮不直接操作 DOM，靠这个计数信号转一手 */
  watch(() => scrollTopSignal.value, scrollTop)

  /* 切文档：先记下上一篇读到哪，再把这一篇的位置还原回去 */
  watch(docId, (_new, old) => {
    const el = scroller.value
    if (el && old) positions.value[old] = el.scrollTop
    onRestore?.(positions.value[docId.value] || 0)
  })

  onMounted(() => {
    scroller.value?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('keydown', onKey)
    // 刷新进来的第一篇也要接着上次的位置（正文异步渲染，等两拍再落）
    const pos = positions.value[docId.value]
    if (pos) {
      setTimeout(() => onRestore?.(pos), 400)
      setTimeout(() => onRestore?.(pos), 1500)
    }
  })
  onBeforeUnmount(() => {
    scroller.value?.removeEventListener('scroll', onScroll)
    window.removeEventListener('keydown', onKey)
  })

  return { showTop, positions, scrollTop, onScroll }
}
