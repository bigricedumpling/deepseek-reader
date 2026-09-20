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
/*
 * token 优先取地址栏里的，其次才是 sessionStorage。
 *
 * 顺序反过来的话，在微信内置浏览器里会直接给一张「禁止访问」——
 * 那边对 sessionStorage 的处理和常规浏览器不一样（读写可能抛异常或拿不到值），
 * 于是 token 判成空，明明链接里带着也进不去。地址栏参数没有这些不确定性。
 */
function readToken() {
  const fromUrl = new URLSearchParams(location.search).get('token')
  if (fromUrl) return fromUrl
  try {
    return sessionStorage.getItem('reader_token') || ''
  } catch {
    return ''
  }
}
const TOKEN = readToken()
if (TOKEN) {
  try {
    sessionStorage.setItem('reader_token', TOKEN)
  } catch {
    /* 存不下也无所谓，地址栏那份还在 */
  }
}
/*
 * 进编辑模式的两条路，缺一不可：
 *   - owner token（链接里带 ?token=…）：服务端认它，不需要密码。
 *     示例知识库就是靠这条 —— 审阅人点链接直接能编辑，不用发口令给他。
 *   - 密码：自己用的时候方便。
 * 以前这里只判了密码，带 token 的链接照样先弹密码门，
 * 于是「分享一个可直接编辑的库」这件事根本走不通。
 */
const MODE = WANT === 'owner' && !PASS && !TOKEN ? 'locked' : WANT
/* 当前身份挂到 window：store 里同步地址栏时要判断写 /edit 还是 /onlyread */
window.__readerMode = MODE

if (MODE === 'locked') {
  document.cookie = 'reader_mode=; path=/; Max-Age=0; SameSite=Lax'
} else if (MODE === 'denied') {
  // 明确地什么都不做，只给一张"禁止访问"的页
  document.cookie = 'reader_mode=; path=/; Max-Age=0; SameSite=Lax'
} else {
  document.cookie = 'reader_mode=' + (MODE === 'owner' ? 'owner' : 'guest') + '; path=/; SameSite=Lax'
  /*
   * 编辑模式下把密码也种进 cookie。
   *
   * <img> 这类由浏览器自己发的请求带不了自定义头，只能靠 cookie 认身份。
   * 之前只种了 reader_mode=owner，服务端要验密码却拿不到，于是图片全被 403 挡掉——
   * 只读模式反而正常，因为它是 guest，不需要密码。
   */
  if (MODE === 'owner' && PASS) {
    document.cookie = 'reader_pass=' + encodeURIComponent(PASS) + '; path=/; SameSite=Lax'
  }
  /*
   * 用 token 进来的（示例知识库那条链接）也要种一份 cookie。
   *
   * 上面那段注释里说的「浏览器自己发的请求带不了头」对 pdf / h5 预览同样成立 ——
   * iframe 去取文件时带不了 x-reader-token，服务端认不出身份，预览区就是一屏 403。
   */
  if (MODE === 'owner' && TOKEN) {
    try {
      document.cookie = 'reader_token=' + encodeURIComponent(TOKEN) + '; path=/; SameSite=Lax'
    } catch {
      /* cookie 写不进去时，头里那份 token 仍然有效 */
    }
  }
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
