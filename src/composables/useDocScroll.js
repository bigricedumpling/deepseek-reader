/**
 * 正文区的滚动：切文档时记住读到哪，并在异步渲染期间把位置落回去。
 *
 * 这部分原先散在 DocView.vue 里，和工具条 UI、搜索、导出混在一个 700 行的文件里。
 * 它和界面长什么样没关系，只是谁在滚、滚到哪了，所以单独拿出来。
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

export function useDocScroll({ scroller, docId, onRestore }) {
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
    if (docId.value) {
      positions.value[docId.value] = el.scrollTop
      savePositions()
    }
  }

  /*
   * 还原阅读位置。
   *
   * 正文是异步挂载的：切到另一篇时，容器可能还是上一篇的高度，
   * 这时把 scrollTop 设成目标值会被浏览器夹回去，等新正文渲染完位置就丢了。
   * 所以不赌一次 120ms 的延时，而是在内容高度追上目标之前逐帧重试；
   * 用户一旦滚动、触摸或按键，就立刻停手，不能把用户拽回旧位置。
   */
  let restoreFrame = 0
  let restoreToken = 0
  const RESTORE_TIMEOUT = 2000
  const CANCEL_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown']

  function stopRestore() {
    restoreToken += 1
    if (restoreFrame) cancelAnimationFrame(restoreFrame)
    restoreFrame = 0
    for (const type of CANCEL_EVENTS) window.removeEventListener(type, stopRestore)
  }

  function restorePosition(pos) {
    stopRestore()
    const target = Math.max(0, Number(pos) || 0)
    const el = scroller.value
    if (!target) {
      if (el) el.scrollTop = 0
      return
    }
    const token = restoreToken
    const started = performance.now()
    for (const type of CANCEL_EVENTS) window.addEventListener(type, stopRestore, { passive: true })

    const attempt = () => {
      if (token !== restoreToken) return
      restoreFrame = 0
      const box = scroller.value
      if (box) {
        if (onRestore) onRestore(target)
        else box.scrollTop = target
        // 目标位置已经落定，或者内容高度不够但等得够久了，就不再逐帧试
        if (Math.abs(box.scrollTop - target) <= 1 || performance.now() - started >= RESTORE_TIMEOUT) {
          stopRestore()
          return
        }
      } else if (performance.now() - started >= RESTORE_TIMEOUT) {
        stopRestore()
        return
      }
      restoreFrame = requestAnimationFrame(attempt)
    }
    restoreFrame = requestAnimationFrame(attempt)
  }

  /* 切文档：先记下上一篇读到哪，再把这一篇的位置还原回去 */
  watch(docId, (_new, old) => {
    const el = scroller.value
    if (el && old) positions.value[old] = el.scrollTop
    restorePosition(positions.value[docId.value] || 0)
  })

  onMounted(() => {
    scroller.value?.addEventListener('scroll', onScroll, { passive: true })
    // 刷新进来的第一篇也要接着上次的位置
    restorePosition(positions.value[docId.value] || 0)
  })
  onBeforeUnmount(() => {
    stopRestore()
    scroller.value?.removeEventListener('scroll', onScroll)
  })

  return { positions, onScroll }
}
