import { readonly, ref } from 'vue'

// Palette values live here; components consume semantic CSS tokens only.
export const ACCENT_PRESETS = Object.freeze([
  { id: 'blue', label: '蓝色', light: '#465fd1', dark: '#a7b8ff' },
  { id: 'graphite', label: '石墨', light: '#303030', dark: '#e0e0e0' },
  { id: 'green', label: '松绿', light: '#357359', dark: '#94c9ab' },
  { id: 'violet', label: '紫色', light: '#7655bd', dark: '#c3acf0' },
  { id: 'clay', label: '陶土', light: '#9c5b36', dark: '#e2b28f' }
])
const KEY = 'typocket.accent'
const current = ref('blue')
let installed = false
const rgb = hex => hex.slice(1).match(/../g).map(value => parseInt(value, 16)).join(' ')

function apply(id) {
  const preset = ACCENT_PRESETS.find(item => item.id === id) || ACCENT_PRESETS[0]
  current.value = preset.id
  document.body.dataset.accent = preset.id
  for (const tone of ['light', 'dark']) {
    document.documentElement.style.setProperty('--accent-' + tone, preset[tone])
    document.documentElement.style.setProperty('--accent-rgb-' + tone, rgb(preset[tone]))
  }
}
function sync(event) {
  if (event.key === KEY || event.key === null) apply(event.newValue)
}
export function initAccent() {
  if (installed) return
  installed = true
  let saved
  try { saved = localStorage.getItem(KEY) } catch {}
  apply(saved)
  window.addEventListener('storage', sync)
}
export function useAccent() {
  initAccent()
  return {
    accent: readonly(current),
    setAccent(id) {
      if (!ACCENT_PRESETS.some(item => item.id === id)) return
      apply(id)
      try { localStorage.setItem(KEY, id) } catch {}
    }
  }
}
if (import.meta.hot) import.meta.hot.dispose(() => window.removeEventListener('storage', sync))
