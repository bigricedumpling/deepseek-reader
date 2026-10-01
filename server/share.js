/**
 * 分享状态：谁能看到什么。
 *
 * 只需要区分两种身份（我 / 别人），所以这里**没有权限矩阵** —— 只有一份「哪些节点对外」的开关，
 * 权限状态统一存入 SQLite；会话凭据保存在代码目录的私有运行目录。
 *
 * 三条原则：
 *   1. **默认不分享**：没勾过的节点一律不给外人看（最小暴露）。
 *   2. **子级继承**：任意上级隐藏时，子级不能单独公开。
 *   3. **服务端强制**：前端藏起来只是体验，真正拦人的是这里 —— 猜 URL 也拿不到。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {fileURLToPath} from 'node:url'
import { workspace, atomicWrite } from './storage/workspace.js'

const SHARE_FILE = '.分享.json'

/** 编辑模式的密码（可以用环境变量覆盖，默认就是本机用的这个） */
function readPasswordFile() {
  try { return fs.readFileSync(new URL('../.admin-password', import.meta.url), 'utf8').trim() } catch { return '' }
}
export const EDIT_PASSWORD = process.env.READER_PASSWORD || readPasswordFile()

export function createShare(root) {
  const file = path.join(root, SHARE_FILE)
  const repo=workspace(root)
  const authName=crypto.createHash('sha256').update(root).digest('hex').slice(0,16)+'.json'
  const authFile=path.join(fileURLToPath(new URL('../.runtime/',import.meta.url)),authName)
  const encodedLegacy=path.resolve(new URL('../.runtime/',import.meta.url).pathname,authName)
  if(!fs.existsSync(authFile)&&fs.existsSync(encodedLegacy))atomicWrite(authFile,fs.readFileSync(encodedLegacy))
  let credentials={}
  try { credentials=JSON.parse(fs.readFileSync(authFile,'utf8')) } catch {}

  function load() {
    try {
      const raw = repo.getJSON('access', {}, SHARE_FILE)
      if(raw.tokens && Object.keys(raw.tokens).length && !Object.keys(credentials).length) {credentials=raw.tokens;atomicWrite(authFile,JSON.stringify(credentials))}
      if(raw.tokens){delete raw.tokens;repo.setJSON('access',raw);if(fs.existsSync(file)){const legacy=JSON.parse(fs.readFileSync(file,'utf8'));delete legacy.tokens;atomicWrite(file,JSON.stringify(legacy,null,2))}}
      if (raw && typeof raw === 'object') {
        return {
          tokens: credentials,
          shared: raw.shared && typeof raw.shared === 'object' ? raw.shared : {},
          locked: raw.locked && typeof raw.locked === 'object' ? raw.locked : {},
          editable: raw.editable && typeof raw.editable === 'object' ? raw.editable : {}
        }
      }
    } catch (error) {
      throw new Error('权限数据无法读取，已停止修改以保留原数据', { cause:error })
    }
    return { tokens: {}, shared: {}, editable: {}, locked: {} }
  }

  let state = load()
  let mtime = mtimeOf()

  function mtimeOf() {
    try {
      return fs.statSync(file).mtimeMs
    } catch {
      return 0
    }
  }

  /**
   * 别人（另一个进程 / 以后的服务器）改过这个文件吗？改了就重新读。
   *
   * 这一步是必须的：分享状态不只写在自己进程的内存里 ——
   * 本地测试是"两个进程"，部署后是"我本机勾、服务器生效"，
   * 不重新读盘就会出现"我勾了，别人那头还是看不到"。
   */
  function reloadIfChanged() { state=load(); return state }
  function save() {
    const {tokens,...content}=state
    repo.setJSON('access',content)
  }

  /** 令牌：第一次用到时生成，之后一直用同一个（撤销 = 重新生成） */
  function token(kind) {
    if (!state.tokens[kind]) {
      state.tokens[kind] = crypto.randomBytes(16).toString('hex')
      credentials=state.tokens;atomicWrite(authFile,JSON.stringify(credentials))
    }
    return state.tokens[kind]
  }

  function rotate(kind) {
    state.tokens[kind] = crypto.randomBytes(16).toString('hex')
    credentials=state.tokens;atomicWrite(authFile,JSON.stringify(credentials))
    return state.tokens[kind]
  }

  /**
   * 这个路径对外可见吗？
   * 从自己逐级往上找最近的一条显式设置；一条都没有就是不分享。
   */
  function isShared(rel) {
    reloadIfChanged()
    if (!rel) return true
    const parts = String(rel).split('/').filter(Boolean)
    let visible = false
    for (let i = 1; i <= parts.length; i++) {
      const key = parts.slice(0, i).join('/')
      if (!Object.hasOwn(state.shared, key)) continue
      if (state.shared[key] === false) return false
      if (state.shared[key] === true) visible = true
    }
    return visible
  }


  function lockedAt(rel) {
    reloadIfChanged()
    const parts = String(rel).split('/').filter(Boolean)
    for (let i = 1; i <= parts.length; i++) {
      const key = parts.slice(0, i).join('/')
      if (state.locked[key] === true) return key
    }
    return ''
  }
  function isLocked(rel) { return !!lockedAt(rel) }
  function isEditable(rel) { return !!rel && isShared(rel) && !isLocked(rel) }
  function setLocked(rel, value) {
    reloadIfChanged()
    const parent = rel.split('/').slice(0, -1).join('/')
    if (!value && parent && isLocked(parent)) throw new Error('请先解锁上级：' + lockedAt(parent))
    state.locked[rel] = !!value
    save()
  }
  function status(rel) { return { shared: isShared(rel), locked: isLocked(rel), lockedAt: lockedAt(rel) } }
  function decorate(nodes) {
    return nodes.map(n => ({ ...n, ...status(n.path || n.file), ...(n.children ? { children: decorate(n.children) } : {}) }))
  }

  /** 过滤给访客看的树：不分享的整枝剪掉（不是隐藏，是根本不下发） */
  function filterTree(nodes) {
    const out = []
    for (const node of nodes || []) {
      if (node.type === 'folder') {
        if (!isShared(node.path)) continue
        const children = filterTree(node.children)
        out.push({ ...node, children })
      } else if (isShared(node.file)) {
        out.push(node)
      }
    }
    return out
  }

  /**
   * 标记某个节点对外可见 / 不可见。
   *
   * 恢复可见时：如果祖先里有人被标成不分享，就得在自己的键上写一条 true 压过去；
   * 否则把这条标记删掉（回到继承 = 可见）。
   */
  function setShared(rel, on) {
    const key = String(rel || '').replace(/^\/+|\/+$/g, '')
    if (!key) return
    reloadIfChanged()
    const parent = key.split('/').slice(0, -1).join('/')
    if (on && parent && !isShared(parent)) throw new Error('请先将上级目录设为对外展示')
    state.shared[key] = !!on
    save()
  }

  function setEditable(rel, on) {
    const key = String(rel || '').replace(/^\/+|\/+$/g, '')
    if (!key) return
    if (on) state.editable[key] = true
    else delete state.editable[key]
    save()
  }

  /**
   * 路径改名/移动之后，把分享与可编辑的设置一起搬到新路径上。
   *
   * 不搬会出事：判断可见性是「从自己逐级往上找最近的一条显式设置」，
   * 所以把 面试/x.md 挪出 面试/ 之后，它就不再受 面试=false 约束，
   * 而"没标过 = 可见" —— 一篇本来不公开的稿子，一拖就对外可见了。
   * 子路径（整棵目录被挪走）要跟着一起搬。
   *
   * from 与 to 都是相对文档根的路径；两者相同就什么都不做。
   */
  function rename(from, to) {
    const a = String(from || '').replace(/^\/+|\/+$/g, '')
    const b = String(to || '').replace(/^\/+|\/+$/g, '')
    if (!a || !b || a === b) return
    let changed = false
    reloadIfChanged()
    const inherited = status(a)
    for (const table of [state.shared, state.editable, state.locked]) {
      const moves = []
      for (const key of Object.keys(table)) {
        if (key === a || key.startsWith(a + '/')) moves.push([key, b + key.slice(a.length)])
      }
      for (const [oldKey, newKey] of moves) {
        table[newKey] = table[oldKey]
        delete table[oldKey]
        changed = true
      }
    }
    state.shared[b] = inherited.shared
    state.locked[b] = inherited.locked
    save()
  }

  function snapshot() {
    reloadIfChanged()
    return {
      locked: { ...state.locked },
      shared: { ...state.shared },
      editable: { ...state.editable }
    }
  }

  return { isLocked, lockedAt, setLocked, status, decorate, isShared, isEditable, filterTree, setShared, setEditable, rename, snapshot, token, rotate, load: () => ({ ...state }) }
}

/** 公开视角始终按访客处理；管理请求必须携带有效会话。 */
export function roleOf(req, url, share, { forceGuest = false } = {}) {
  if (forceGuest) return 'guest'
  // 公开视角优先于管理会话，避免同一浏览器登录后旧公开链接暴露私有资料。
  let publicReferer = false
  try {
    const ref = new URL(req?.headers?.referer || '')
    publicReferer = /\/onlyread(?:\/|$)/.test(ref.pathname) || ref.searchParams.get('view') === 'public'
  } catch {}
  if (req?.headers?.['x-reader-view'] === 'public' || url?.searchParams?.get('view') === 'public' || publicReferer) return 'guest'

  const headers = req?.headers || {}
  const localAddress = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req?.socket?.remoteAddress)
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(headers.host || '')
  let sameOrigin = true
  try { if (headers.origin) sameOrigin = new URL(headers.origin).host === headers.host } catch { sameOrigin = false }
  if (process.env.READER_REQUIRE_LOGIN !== '1' && process.env.READER_PUBLIC_SNAPSHOT !== '1' && localAddress && localHost && sameOrigin && headers['sec-fetch-site'] !== 'cross-site' && !Object.keys(headers).some(key => key === 'forwarded' || key.startsWith('x-forwarded-'))) return 'owner'

  const cookie = String(headers.cookie || '')
  const pick = (name) => {
    const hit = cookie
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(name + '='))
    try { return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '' }
    catch { return '' }
  }

  const tok = String(headers['x-reader-token'] || pick('reader_session') || '')
  if (tok && tok === share.token('owner')) return 'owner'
  // 旧入口仅作地址兼容，不再决定编辑权限。无凭据只获得公开内容。
  return 'guest'
}
