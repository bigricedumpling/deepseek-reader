import { createApp } from 'vue'
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
import Denied from './components/Denied.vue'
import Unlock from './components/Unlock.vue'
import './style.css'

/*
 * 模式必须显式选：
 *
 *   /edit      编辑模式
 *   /onlyread  只读模式（分享链接也是这个）
 *   其它（含光秃秃的 /）  **禁止访问** —— 不挂应用、不发任何 /api 请求
 *
 * 身份怎么传给服务端：
 *   - 每个请求带 x-reader-mode 头（前端说了算）；
 *   - 同时种一个会话 cookie（iframe 拉 PDF 这种浏览器自己发的请求带不了头）；
 *   - 分享链接的 token 只存 sessionStorage，挂在 x-reader-token 头上，不写 cookie（不然会粘住）。
 */
/*
 * 路由：
 *   /edit              编辑模式
 *   /edit/<文档路径>    编辑模式并直接打开那一篇
 *   /onlyread[/<路径>] 只读模式（分享链接）
 *   其它               禁止访问
 */
/*
 * 部署可能挂在子路径下（如 /deepseek/reader/），先把 Vite 的 BASE 剥掉再判路由，
 * 否则 /deepseek/reader/onlyread 会被当成"其它"而拒绝访问。
 */
const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
const stripBase = (p) => {
  if (!BASE_PATH) return p
  return p.startsWith(BASE_PATH) ? (p.slice(BASE_PATH.length) || '/') : p
}
const ROUTE = decodeURI(stripBase(location.pathname.replace(/\/+$/, '') || '/'))
const DOC_PATH = /^\/(edit|onlyread)\//.test(ROUTE) ? ROUTE.replace(/^\/(edit|onlyread)\//, '') : ''
const WANT = ROUTE === '/edit' || ROUTE.startsWith('/edit/')
  ? 'owner'
  : ROUTE === '/onlyread' || ROUTE.startsWith('/onlyread/')
    ? 'guest'
    : 'denied'
// 让 store 知道"用户点名要看哪一篇"
window.__readerDocPath = DOC_PATH
const PASS = localStorage.getItem('reader_pass') || ''
// 要编辑、又还没输过密码：先给密码门（密码由服务端验，这里只负责收）
const MODE = WANT === 'owner' && !PASS ? 'locked' : WANT
/* 当前身份挂到 window：store 里同步地址栏时要判断写 /edit 还是 /onlyread */
window.__readerMode = MODE

const sharedToken = new URLSearchParams(location.search).get('token')
if (sharedToken) sessionStorage.setItem('reader_token', sharedToken)
const TOKEN = sessionStorage.getItem('reader_token') || ''

if (MODE === 'locked') {
  document.cookie = 'reader_mode=; path=/; Max-Age=0; SameSite=Lax'
} else if (MODE === 'denied') {
  // 明确地什么都不做，只给一张"禁止访问"的页
  document.cookie = 'reader_mode=; path=/; Max-Age=0; SameSite=Lax'
} else {
  document.cookie = 'reader_mode=' + (MODE === 'owner' ? 'owner' : 'guest') + '; path=/; SameSite=Lax'
}

if (MODE === 'owner' || MODE === 'guest') {
  const original = window.fetch.bind(window)
  window.fetch = (input, init = {}) =>
    original(input, {
      ...init,
      headers: {
        ...(init.headers || {}),
        'x-reader-mode': MODE,
        ...(MODE === 'owner' && PASS ? { 'x-reader-pass': PASS } : {}),
        ...(TOKEN ? { 'x-reader-token': TOKEN } : {})
      }
    })
}

const root = MODE === 'denied' ? Denied : MODE === 'locked' ? Unlock : App
createApp(root).use(createPinia()).mount('#app')
