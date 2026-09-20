/**
 * 分享状态：谁能看到什么。
 *
 * 只需要区分两种身份（我 / 别人），所以这里**没有权限矩阵** —— 只有一份「哪些节点对外」的开关，
 * 加两个 token。状态写在 DOCS_ROOT/.分享.json，跟 .顺序.json / .表宽.json 一个路子：
 * 一个真源、可备份、能用 git 看变化，不引入数据库、不引入用户表。
 *
 * 三条原则：
 *   1. **默认不分享**：没勾过的节点一律不给外人看（最小暴露）。
 *   2. **子级继承**：离自己最近的那条显式设置说了算（"存档/论文与文献": true 会盖住 "存档": false）。
 *   3. **服务端强制**：前端藏起来只是体验，真正拦人的是这里 —— 猜 URL 也拿不到。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const SHARE_FILE = '.分享.json'

/** 编辑模式的密码（可以用环境变量覆盖，默认就是本机用的这个） */
export const EDIT_PASSWORD = process.env.READER_PASSWORD || 'zongzi'

export function createShare(root) {
  const file = path.join(root, SHARE_FILE)

  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (raw && typeof raw === 'object') {
        return {
          tokens: raw.tokens && typeof raw.tokens === 'object' ? raw.tokens : {},
          shared: raw.shared && typeof raw.shared === 'object' ? raw.shared : {},
          editable: raw.editable && typeof raw.editable === 'object' ? raw.editable : {}
        }
      }
    } catch {
      /* 还没有这个文件，或者读坏了：当成"什么都没分享" */
    }
    return { tokens: {}, shared: {}, editable: {} }
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
  function reloadIfChanged() {
    const now = mtimeOf()
    if (now !== mtime) {
      mtime = now
      state = load()
    }
    return state
  }

  function save() {
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n', 'utf8')
    mtime = mtimeOf()
  }

  /** 令牌：第一次用到时生成，之后一直用同一个（撤销 = 重新生成） */
  function token(kind) {
    if (!state.tokens[kind]) {
      state.tokens[kind] = crypto.randomBytes(16).toString('hex')
      save()
    }
    return state.tokens[kind]
  }

  function rotate(kind) {
    state.tokens[kind] = crypto.randomBytes(16).toString('hex')
    save()
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
    for (let i = parts.length; i >= 1; i--) {
      const key = parts.slice(0, i).join('/')
      const v = state.shared[key]
      if (v === true) return true
      if (v === false) return false
    }
    // 没标过就是对外可见 —— 默认分享整个库，"个别不分享"靠往上标 false。
    // （离自己最近的那条显式设置说了算，所以"面试 不分享、但 面试/公开示例 分享"也表达得出来。）
    return true
  }

  /** 这个路径允许访客编辑吗（二期才真正开放写，这里先把开关存好） */
  function isEditable(rel) {
    reloadIfChanged()
    if (!rel) return false
    const parts = String(rel).split('/').filter(Boolean)
    for (let i = parts.length; i >= 1; i--) {
      const key = parts.slice(0, i).join('/')
      const v = state.editable[key]
      if (v === true) return isShared(key)
      if (v === false) return false
    }
    return false
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
    if (on) {
      const parts = key.split('/')
      let blocked = false
      for (let i = 1; i < parts.length; i++) {
        if (state.shared[parts.slice(0, i).join('/')] === false) blocked = true
      }
      if (blocked) state.shared[key] = true
      else delete state.shared[key]
    } else {
      state.shared[key] = false
    }
    save()
  }

  function setEditable(rel, on) {
    const key = String(rel || '').replace(/^\/+|\/+$/g, '')
    if (!key) return
    if (on) state.editable[key] = true
    else delete state.editable[key]
    save()
  }

  function snapshot() {
    reloadIfChanged()
    return {
      shared: { ...state.shared },
      editable: { ...state.editable },
      ownerToken: token('owner'),
      guestToken: token('guest')
    }
  }

  return { isShared, isEditable, filterTree, setShared, setEditable, snapshot, token, rotate, load: () => ({ ...state }) }
}

/**
 * 这次请求算谁。
 *
 * 本地测试最省事的分法：
 *   - 进程带了 FORCE_GUEST（那就是"另一个进程扮演别人"）→ 客人；
 *   - 带对 guest token → 客人；带对 owner token → 我；
 *   - 从本机来、又没带 token → 我（本地 dev 照旧，什么都不用配）；
 *   - 其余（公网、没凭证）→ 客人。
 */
export function roleOf(req, url, share, { forceGuest = false } = {}) {
  if (forceGuest) return 'guest'

  const headers = req?.headers || {}
  const ip = req?.socket?.remoteAddress || ''
  const local = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'

  const cookie = String(headers.cookie || '')
  const pick = (name) => {
    const hit = cookie
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(name + '='))
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : ''
  }

  // 路由选定的模式优先：/onlyread 一律客人；/edit 只有本机认（远端不能自称主人）
  const mode = String(headers['x-reader-mode'] || pick('reader_mode') || '')
  if (mode === 'guest') return 'guest'
  if (mode === 'owner') {
    /*
     * 两条路进编辑：
     *
     *   1. owner token —— 公网上可靠的一条。挂在查询串或 x-reader-token 头上，
     *      比密码长得多，也不会被浏览器记住之后到处粘。
     *   2. 密码 —— 本地 dev 用着方便。
     *
     * 注意：挂在 nginx 后面时 remoteAddress 恒为 127.0.0.1，local 判断失去区分度，
     * 所以这里不再拿它当安全边界，密码本身就是那道门。
     */
    /*
     * token 三个来源：查询串、自定义头、cookie。
     * cookie 那一条是给 iframe 用的 —— pdf 与 h5 的预览是浏览器自己发的请求，
     * 带不了 x-reader-token 头，没有它就只能显示一屏 403。
     */
    const tok = String(
      url?.searchParams?.get('token') || headers['x-reader-token'] || pick('reader_token') || ''
    )
    if (tok && tok === share.token('owner')) return 'owner'
    const given = String(headers['x-reader-pass'] || pick('reader_pass') || '')
    return given === EDIT_PASSWORD ? 'owner' : 'denied'
  }

  // 分享链接带的 token
  const given = String(
    url?.searchParams?.get('token') || headers['x-reader-token'] || pick('reader_token') || ''
  )
  if (given) {
    if (given === share.token('guest')) return 'guest'
    if (given === share.token('owner')) return 'owner'
    return 'guest'
  }

  // 没声明模式、也没有 token：一律拒绝（这个项目必须显式选 /edit 或 /onlyread）
  return 'denied'
}
