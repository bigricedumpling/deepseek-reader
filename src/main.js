import { initAccent } from './composables/useAccent'
import { initUiFont } from './composables/useUiFont'
import { createApp } from 'vue'
initAccent()
initUiFont()
import { createPinia } from 'pinia'

/* 正文字体一：思源宋体 */
import '@fontsource/noto-serif-sc/chinese-simplified-400.css'
import '@fontsource/noto-serif-sc/chinese-simplified-600.css'
import '@fontsource/noto-serif-sc/chinese-simplified-900.css'
import '@fontsource/noto-serif-sc/latin-400.css'
import '@fontsource/noto-serif-sc/latin-600.css'

/* 正文字体二：思源黑体 */
import '@fontsource/noto-sans-sc/chinese-simplified-400.css'
import '@fontsource/noto-sans-sc/chinese-simplified-600.css'
import '@fontsource/noto-sans-sc/latin-400.css'
import '@fontsource/noto-sans-sc/latin-600.css'

import App from './App.vue'
import EntryPage from './components/EntryPage.vue'
import './style.css'
import './styles/shapes.css'
import './styles/surfaces.css'
import { resolveEntry } from './utils/routes'
import { installTooltips } from './utils/tooltips'

// 首页按身份进入当前工作区；旧 /edit 与 /onlyread 的书签仍按原路由兼容。
const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
history.replaceState(null, '', resolveEntry(location.pathname, location.search, BASE_PATH))
window.__readerPublicView = location.pathname.slice(BASE_PATH.length).startsWith('/onlyread')
window.__readerMode = 'guest'
// 公开视角按标签页传递；不使用共享 cookie 切模式，避免影响另一页的管理操作。
const originalFetch = window.fetch.bind(window)
window.fetch = (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : input, location.href)
  if (!window.__readerPublicView || url.origin !== location.origin || !url.pathname.startsWith(BASE_PATH + '/api/')) return originalFetch(input, init)
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined))
  headers.set('x-reader-view', 'public')
  return originalFetch(input, { ...init, headers })
}
// 迁移本机曾保存的管理凭据，之后使用 HttpOnly 会话，不再发送明文密码头。
async function start() {
  const old = localStorage.getItem('reader_pass')
  if (old) {
    await fetch(BASE_PATH + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: old }) }).catch(() => {})
    localStorage.removeItem('reader_pass')
  }
  for (const key of ['reader_mode', 'reader_pass', 'reader_token']) document.cookie = key + '=; path=/; Max-Age=0'
  const me = await fetch(BASE_PATH + '/api/me').then(r => r.json()).catch(() => null)
  if (me?.ok) window.__readerMode = me.data.role
  const home = location.pathname === BASE_PATH + '/'
  if (home) {
    let next = '/onlyread/'
    let query = location.search
    if (window.__readerMode === 'owner') {
      next = '/doc/'
      let recent = ''
      try { recent = JSON.parse(localStorage.getItem('reader.library-switcher:' + BASE_PATH) || '{}').recent?.[0] || '' } catch {}
      if (!new URLSearchParams(query).get('lib')) query = recent ? '?lib=' + encodeURIComponent(recent) : '?choose=1'
    }
    location.replace(resolveEntry(BASE_PATH + next, query, BASE_PATH))
    return
  }
  const needsLogin = !window.__readerPublicView && window.__readerMode !== 'owner'
  createApp(needsLogin ? EntryPage : App, { loginRequired: needsLogin }).use(createPinia()).mount('#app')
  installTooltips()
  if (window.parent !== window) window.parent.postMessage({ type: 'dsh-reader:ready' }, '*')
}
start()
