import { readonly, ref } from 'vue'

export const UI_FONT_OPTIONS = Object.freeze([
  { id: 'default', label: '默认' },
  { id: 'serif', label: '衬线' },
  { id: 'sans', label: '无衬线' },
  { id: 'harmony', label: '鸿蒙黑体' },
  { id: 'kai', label: '楷体' },
  { id: 'ping', label: '苹方' }
])

const KEY = 'typocket.uiFont'
const FALLBACK_FONT = 'default'
const current = ref(FALLBACK_FONT)
let installed = false

function apply(id) {
  const siteDefault = window.__typocketUiFontDefault
  const fallback = UI_FONT_OPTIONS.some(item => item.id === siteDefault) ? siteDefault : FALLBACK_FONT
  const next = UI_FONT_OPTIONS.some(item => item.id === id) ? id : fallback
  current.value = next
  document.body.dataset.uiFont = next
}

function sync(event) {
  if (event.key === KEY || event.key === null) apply(event.newValue)
}

export function initUiFont() {
  if (installed) return
  installed = true
  let saved
  try { saved = localStorage.getItem(KEY) } catch {}
  apply(saved)
  window.addEventListener('storage', sync)
}

export function useUiFont() {
  initUiFont()
  return {
    uiFont: readonly(current),
    setUiFont(id) {
      if (!UI_FONT_OPTIONS.some(item => item.id === id)) return
      apply(id)
      try { localStorage.setItem(KEY, id) } catch {}
    }
  }
}

if (import.meta.hot) import.meta.hot.dispose(() => window.removeEventListener('storage', sync))
