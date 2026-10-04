import {readerApi as api} from '../services/readerClient'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { renderMarkdown, extractToc, searchDocs } from '../utils/markdown'
import { API_BASE } from '../utils/api'
import { interviewPaths } from '../utils/interview-paths'

/*
 * 成品文件的类型：pdf 与 h5。
 *
 * 这两种不读正文、不进编辑器，交给浏览器整页渲染（pdf 用自带阅读器，h5 用 iframe）。
 * 以前这些判定一处一处写的 'pdf'，加 h5 时漏一处就会出现按 pdf 处理 html
 * 或者html 当 markdown 解析这类错，所以收成一个集合。
 */
const PREVIEW_TYPES = new Set(['pdf', 'h5'])

/**
 * 文档树与正文都由本地接口提供，接口直接读写磁盘上的 md 文件。
 * 所以这个 store 既是阅读层也是编辑层。
 *
 * ★ 名字只有一个来源：文件名。树是接口扫盘扫出来的（目录 = 分类，文件名 = 文档名），
 *   这里不存任何"标题"字段，正文里的一级标题只是正文内容 ——
 *   所以不存在"侧栏名和正文标题谁同步谁"的问题。
 *   在 app 外面改名、换目录、新增、删除，下一次 loadTree 就一致。
 */
/** 把嵌套的目录树摊平成文档列表：搜索、导出、找当前这篇都用它。 */
function flatten(nodes, dir, out) {
  for (const n of nodes || []) {
    if (n.type === 'folder') flatten(n.children, n.path, out)
    else out.push({ ...n, dir })
  }
  return out
}

/* ---------- 打开的文档（标签页）与"上次看哪篇" ---------- */

/** 上次看的是哪篇：刷新（改完代码要硬刷新）之后还能回到原来那篇 */
const LAST_DOC_KEY = 'reader.lastDoc'

function lastDocKey() {
  const key = tabsKey()
  return key === TABS_KEY ? LAST_DOC_KEY : LAST_DOC_KEY + key.slice(TABS_KEY.length)
}

/**
 * 打开的文档列表，就是工作台上摊着的那几篇。
 *
 * 只存路径（顺序就是标签顺序），正文本来就有缓存；刷新后用它恢复，
 * 但要在文档树到手之后 prune 一次：文件可能已经被改名或删掉了。
 */
const TABS_KEY = 'reader.tabs'

function tabsKey() {
  try {
    const requestedLib = new URLSearchParams(location.search).get('lib') || ''
    const lib = requestedLib === '业务面' ? '面试准备' : requestedLib
    const guest = window.__readerMode === 'guest' ? ':guest' : ''
    return TABS_KEY + guest + (lib ? ':' + lib : '')
  } catch {
    return TABS_KEY
  }
}

function loadTabs() {
  try {
    const raw = JSON.parse(localStorage.getItem(tabsKey()) || '[]')
    return Array.isArray(raw) ? [...new Set(raw.filter((x) => typeof x === 'string' && x))] : []
  } catch {
    return []
  }
}

function lastDoc() {
  try {
    return localStorage.getItem(lastDocKey()) || ''
  } catch {
    return ''
  }
}

function rememberDoc(file) {
  try {
    if (file) localStorage.setItem(lastDocKey(), file)
  } catch {
    /* 隐私模式下写不了就算了 */
  }
}

export const useDocsStore = defineStore('docs', () => {
  const treeNodes = ref([])   // [{ type: 'folder'|'doc', name, path|file, mtime }]，目录可嵌套
  const currentPath = ref('') // 当前文档的文件路径，同时作为身份
  const rawMap = ref({})      // path -> 原文
  const revisionMap = ref({})
  const conflict = ref(null)
  const pageMeta = ref({})
  const pageMetaRevision = ref('')
  const savedMap = ref({})    // path -> 上次保存的原文，用来判断有没有改动
  const loading = ref(false)
  const saving = ref(false)
  const savedAt = ref(0)      // 上次保存成功的时间，底栏显示用
  const error = ref('')
  const searchKeyword = ref('')
  const pdfToc = ref([])   // 当前 pdf 的书签目录（右侧栏用）
  const pdfPage = ref(1)   // 右侧目录点了第几页，DocView 负责跳
  const pdfTocSource = ref('')   // outline = pdf 自带书签，text = 从正文认出来的
  const pdfPages = ref(0)        // 这篇 pdf 共几页（底栏显示用）
  const pdfTocError = ref('')    // 目录读不出来时的原因（文件坏了、没下完…）
  /** 翻译任务状态：{ status: idle | running | done | failed, progress, output, error } */
  const pdfTranslate = ref({ status: 'idle', progress: 0, output: '', error: '' })
  /** 看原文还是看译文（译文是双语对照 PDF，页号跟原文一一对应） */
  const pdfView = ref('source')

  /** 树里所有文件（含 pdf）；allDocs 只留 markdown —— 正文、搜索、导出都只认 md */
  const allFiles = computed(() => flatten(treeNodes.value, '', []))
  const allDocs = computed(() => allFiles.value.filter((d) => d.type === 'doc'))
  const currentNode = computed(() => allFiles.value.find((d) => d.file === currentPath.value) || null)
  const currentDoc = computed(
    () => allDocs.value.find((d) => d.file === currentPath.value) || null
  )
  const currentMeta = computed(() => currentNode.value ? {...currentNode.value, meta:pageMeta.value} : {name:'未选择',file:''})
  const currentRaw = computed(() => rawMap.value[currentPath.value] ?? '')
  const currentHtml = computed(() => renderMarkdown(currentRaw.value))
  const currentToc = computed(() => extractToc(currentRaw.value))
  /** 当前这篇的正文有没有读到内存。编辑器必须等内容到位再挂载，否则会拿空内容创建。 */
  const currentLoaded = computed(() => {
    if (!currentPath.value) return false
    // pdf 与 h5 都不用读正文，直接交给浏览器预览
    if (PREVIEW_TYPES.has(currentNode.value?.type)) return true
    return rawMap.value[currentPath.value] !== undefined
  })
  const isDirty = computed(() => {
    const path = currentPath.value
    if (!path) return false
    if (rawMap.value[path] === undefined) return false
    return rawMap.value[path] !== (savedMap.value[path] ?? '')
  })

  const searchResults = computed(() => {
    if (!searchKeyword.value.trim()) return []
    const docs = allDocs.value.filter(d => d.file === currentPath.value)
      .map((d) => ({ id: d.file, title: d.name, raw: rawMap.value[d.file] || '' }))
      .filter((d) => d.raw)
    return searchDocs(docs, searchKeyword.value)
  })

  /* ---------- 缓存自愈 ---------- */

  /**
   * 把树里已经不存在的文档从缓存里清掉。
   * 删目录、在 app 外面删文件、改名之后都要跑一次，否则 loadDoc 会命中残留直接返回旧内容。
   */
  function pruneCache() {
    const alive = new Set(allDocs.value.map((d) => d.file))
    for (const k of Object.keys(rawMap.value)) {
      if (!alive.has(k)) {
        delete rawMap.value[k]
        delete savedMap.value[k]
      }
    }
  }

  /**
   * 当前这篇没了（被删、被挪走）就指回第一篇，并把正文读进来
   */
    /* ---------- 打开的文档（标签页） ---------- */

  const tabs = ref(loadTabs())

  /* ---------- 身份与分享 ---------- */

  /** owner 可管理全部内容；guest 只见公开内容，且只能编辑未锁定项。 */
  /** 每换一次知识库 +1；侧边栏据此知道"折叠状态该重置了" */
  const libEpoch = ref(0)

  const role = ref(window.__readerMode === 'owner' ? 'owner' : 'guest')
  const restoredCopy = ref(false), pdfTranslationAvailable=ref(false)
  const isGuest = computed(() => role.value !== 'owner')
  const accessRequest = ref(null)
  const currentReadonly = computed(() => !canEdit(currentNode.value))
  async function requestAccess(path, change) {
    if (isGuest.value || !path) return
    try {
      if (isDirty.value && !(await save())) throw Error('请先保存当前改动')
      await api('PUT', '/access', { path, ...change })
      await loadAll()
      window.dispatchEvent(new Event('reader-access-updated'))
    } catch (reason) { error.value = String(reason.message || reason) }
  }
  function canEdit(node) { return !!node && (!isGuest.value || (node.locked === false && node.shared === true)) }

  /** 分享设置：{ shared: { 路径: true }, editable: {...}, guestToken } */
  const shareInfo = ref({ shared: {}, editable: {}, guestToken: '' })

  async function loadMe() {
    try {
      const res = await fetch(API_BASE + '/api/me')
      const json = await res.json()
      if (json.ok) { role.value = json.data.role; restoredCopy.value = json.data.restoredCopy === true; pdfTranslationAvailable.value=json.data.pdfTranslationAvailable===true }
    } catch {
      /* 问不到就按"我"处理（本机 dev 一直是这个分支） */
    }
  }

  async function loadShare() {
    if (isGuest.value) return
    try {
      const res = await fetch(API_BASE + '/api/share')
      const json = await res.json()
      if (json.ok) shareInfo.value = json.data
    } catch {
      /* 读不到就先按空的来 */
    }
  }

  function saveTabs() {
    try {
      localStorage.setItem(tabsKey(), JSON.stringify(tabs.value))
    } catch {
      /* 写不了就算了，只是刷新后恢复不了标签 */
    }
  }

  /** 打开一篇：已经在标签里就只是切过去 */
  function openTab(file) {
    if (!file) return
    if (!tabs.value.includes(file)) {
      tabs.value.push(file)
      saveTabs()
    }
  }

  /**
   * 关掉一个标签，返回关完之后该看哪篇（不变就返回当前这篇）。
   * 只剩一个标签时不动：不然会出现"一篇都没打开"的空状态，主区没东西可看。
   */
  function closeTab(file) {
    const i = tabs.value.indexOf(file)
    if (i < 0 || tabs.value.length <= 1) return currentPath.value
    tabs.value.splice(i, 1)
    saveTabs()
    if (currentPath.value !== file) return currentPath.value
    return tabs.value[Math.min(i, tabs.value.length - 1)] || ''
  }

  /** 树刷新后把已经不存在的标签清掉 */
  function pruneTabs() {
    const alive = new Set(allFiles.value.map((f) => f.file))
    const next = tabs.value.filter((f) => alive.has(f))
    if (next.length !== tabs.value.length) {
      tabs.value = next
      saveTabs()
    }
  }

  /** 改名 / 移动：标签跟着改，不然点开就找不到了 */
  function remapTabs(from, to) {
    let hit = false
    tabs.value = tabs.value.map((f) => {
      if (f === from) {
        hit = true
        return to
      }
      if (f.startsWith(from + '/')) {
        hit = true
        return to + f.slice(from.length)
      }
      return f
    })
    if (hit) saveTabs()
  }

  /**
   * 地址栏里点名的那一篇（/edit/调研/数据调研 或 /onlyread/…）。
   *
   * 直接从 location 读，不依赖 main.js 先塞的全局变量 ——
   * 那样子依赖初始化顺序，前面试了两处都没生效（踩过）。
   */
  function routedDocPath() {
    try {
      /*
       * 不要用 ^ 锚定开头。
       *
       * 站点可能挂在子路径下（/deepseek/reader/onlyread/…），前缀会让以 /onlyread/ 开头
       * 落空，地址栏点名的那一篇就认不出来，页面回落到目录里第一篇 ——
       * 表现是第二条分享链接打开的是第一篇。/edit 走的是去前缀后的路径，所以一直没暴露。
       */
      const m = location.pathname.match(/\/(?:doc|edit|onlyread)\/(.+)$/)
      if (!m) return ''
      /*
       * 这里必须用 decodeURIComponent，不能用 decodeURI。
       *
       * 路径里的斜杠会被编码成 %2F（例如 笔试题%2F笔试题交付：题目二），
       * 而 decodeURI 有意不还原 %2F —— 斜杠在路径里有特殊含义。
       * 结果是查表时拿着 %2F 去比，永远匹配不上，页面静默回落到目录里第一篇：
       * 表现就是第二条分享链接打开的是第一篇。这个错误很隐蔽，因为页面不报错。
       *
       * 只解这一段，不能解整条 pathname：那样站点前缀里的编码也会被一起还原。
       */
      const raw = decodeURIComponent(m[1]).replace(/\/+$/, '')
      return legacyPath(raw)
    } catch {
      return ''
    }
  }

  /**
   * 旧链接的路径映射。
   *
   * 对外发出去的链接长这样：/onlyread/笔试题/笔试题交付：题目一
   * 那时 笔试题 与 调研报告 是文档根下的两个顶层目录。
   * 后来资料按知识库归拢：笔试题 成了Agent（设计方向）库，调研报告 挪进了它里面。
   *
   * 规则：老路径的第一段（笔试题）在当前库里已经不存在，把它换成现在所属的库根，
   * /笔试题/调研报告/评测调研 → /Agent（设计方向）/调研报告/评测调研
   *
   * 两个容易写错的地方：
   *   1. allFiles 只含文件（flatten 不产出目录），所以判断目录要看有没有文件的
   *      file 里含这一段，不能用 f.path —— 那个字段在文件条目上根本不存在。
   *   2. 段是出现在路径中间的（Agent（设计方向）/调研报告/…），
   *      所以用 indexOf 找，不能用 startsWith。
   */
  function legacyPath(raw) {
    if (!raw) return ''
    if (raw.startsWith('笔试题/')) return 'Agent（设计方向）/' + raw.slice('笔试题/'.length)
    const extension = /\.md$/i.test(raw) ? raw.slice(-3) : ''
    const relocated = interviewPaths[raw.replace(/\.md$/i, '')]
    if (relocated) return relocated + extension
    /* 2026-09：散在面试准备根部的资料已归类，业务面也并回这个知识库。 */
    if (raw.startsWith('业务面/')) return '面试准备/' + raw
    if (raw.startsWith('面试准备/')) {
      const leaf = raw.slice('面试准备/'.length)
      const stem = leaf.replace(/\.md$/i, '')
      const section = {
        README: '总览', 面试准备: '总览', 笔试面试总复习速览: '总览', 下一步计划: '总览',
        岗位JD与目标: '岗位与策略', 能力线与笔试题型预测: '岗位与策略', 访问画像线索: '岗位与策略',
        模拟题库: '问答演练', 全量问答手册: '问答演练', 术语急救卡: '问答演练', 反问清单与叙事结构: '问答演练',
        wegen项目事实卡: '项目素材'
      }[stem]
      if (section) return legacyPath('面试准备/' + section + '/' + leaf)
    }
    const files = allFiles.value
    if (!files.length) return raw

    const seg = (name) => files.find((f) => f.file.indexOf(name + '/') >= 0)
    const kids = (p) => files.filter((f) => f.file.indexOf(p + '/') === 0)
    const isDoc = (p) =>
      files.some((f) => f.file === p || f.file.replace(/\.(md|pdf)$/i, '') === p)

    const first = raw.split('/')[0]
    const rest = raw.slice(first.length + 1)
    /* 路径没变过：第一段本身就是现在库里的东西 */
    if (!first || seg(first) || isDoc(first)) return raw
    if (!rest) return raw
    /* 去掉孤儿第一段之后，剩下的正好是库根 */
    if (kids(rest).length) return rest

    const head = rest.split('/')[0]
    const hit = seg(head)
    if (!hit) return raw
    /* hit.file 里 head 之前的部分就是所属库根 */
    const idx = hit.file.indexOf(head)
    if (idx <= 0) return raw
    const mapped = hit.file.slice(0, idx) + rest
    /* 指向目录时落到里面第一篇 */
    const inner = kids(mapped)
    return inner.length ? inner[0].file : mapped
  }

  /**
   * 旧链接没有 ?lib=，但它的第一段（笔试题）其实指的就是某个库。
   * 侧边栏定默认库时用它 —— 不然会落到"第一个库"上，
   * 而路径又按老前缀解析，两边对不上。
   */
  function legacyLib() {
    const raw = (() => {
      try {
        const m = location.pathname.match(/\/(?:doc|edit|onlyread)\/(.+)$/)
        return m ? decodeURIComponent(m[1]).replace(/\/+$/, '') : ''
      } catch {
        return ''
      }
    })()
    if (!raw) return ''
    const first = raw.split('/')[0]
    const rest = raw.slice(first.length + 1)
    if (!rest) return ''
    const files = allFiles.value
    if (!files.length) return ''
    if (files.some((f) => f.file.startsWith(first + '/'))) return ''
    const head = rest.split('/')[0]
    const inside = files.find((f) => f.file.startsWith(head + '/'))
    if (!inside) return ''
    const idx = inside.file.indexOf(head)
    return idx > 0 ? inside.file.slice(0, idx).replace(/\/$/, '') : ''
  }

  async function ensureCurrent() {
    pruneTabs()
    if (allFiles.value.some((d) => d.file === currentPath.value)) {
      openTab(currentPath.value)
      syncUrl()
      return
    }
    // 路由点名的那一篇优先（别人分享过来的链接、或你提交作业时要别人直接看到的）
    const routed = routedDocPath()
    // 路由里写的是"不带扩展名的路径"（/edit/调研/数据调研），这里两种写法都认
    const routedHit = routed
      ? allFiles.value.find((f) => f.file === routed) ||
        allFiles.value.find((f) => f.file.replace(/\.(md|pdf)$/i, '') === routed)
      : null
    if (routedHit) {
      currentPath.value = routedHit.file
      openTab(routedHit.file)
      syncUrl()
      if (!PREVIEW_TYPES.has(currentNode.value?.type)) {
        try {
          await loadDoc(routedHit.file)
        } catch {
          /* 读不到就按下面的常规逻辑来 */
        }
      }
      return
    }
    const want = lastDoc()
    // 上次那篇还在（没被改名/删掉）就接着看，否则回第一篇
    const hit = want && allFiles.value.some((f) => f.file === want)
    currentPath.value = hit ? want : allFiles.value[0]?.file || ''
    openTab(currentPath.value)
    // 空知识库也要清掉地址里上一库的文档路径。
    syncUrl()
    if (currentPath.value && !PREVIEW_TYPES.has(currentNode.value?.type)) {
      try {
        await loadDoc(currentPath.value)
      } catch (e) {
        error.value = String(e.message || e)
      }
    }
  }

  /* ---------- 读取 ---------- */

  /*
   * 当前知识库：地址栏里的 ?lib=<库名>。
   *
   * 一个知识库就是文档根下的一个文件夹。不选时看整棵树（工作区总览），
   * 选了就只看那一个 —— 切换知识库不换实例，只换这一个参数。
   */
  function routedLib() {
    try {
      const lib = String(new URLSearchParams(location.search).get('lib') || '').trim()
      return lib === '业务面' ? '面试准备' : lib
    } catch {
      return ''
    }
  }

  let treeRequest = 0
  async function loadTree() {
    const request = ++treeRequest
    const lib = routedLib()
    const { data } = await api('GET', lib ? '/tree?lib=' + encodeURIComponent(lib) : '/tree')
    if (request !== treeRequest || lib !== routedLib()) return false
    if(data.lib&&data.lib!==lib){const u=new URL(location.href);u.searchParams.set('lib',data.lib);history.replaceState(null,'',u)}
    treeNodes.value = Array.isArray(data.nodes) ? data.nodes : []
    pruneCache()
    await ensureCurrent()
    return true
  }

  async function loadDoc(file, { force = false } = {}) {
    if (!file) return ''
    if (!force && rawMap.value[file] !== undefined) return rawMap.value[file]
    const res = await fetch(API_BASE + '/api/doc?path=' + encodeURIComponent(file))
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || '读取失败')
    rawMap.value[file] = json.data.content
    savedMap.value[file] = json.data.content
    revisionMap.value[file] = json.data.revision
    return json.data.content
  }

  /**
   * 切换知识库之后重新加载。
   *
   * 关键一步：先把"当前这篇"清掉再拉树。
   *
   * 不清的话会得到一个自相矛盾的地址：syncUrl 写地址时用的是 location.search，
   * 里面已经带了新的 ?lib=，而 currentPath 还是上一个库的那篇 ——
   * 于是出现 /edit/过程稿/…/xxx?lib=面试准备 这种"路径属于 A 库、lib 指向 B 库"的地址。
   * 清掉之后由 ensureCurrent 从新库的树里重新挑一篇，两边就一致了。
   */
  async function switchLib() {
    /*
     * 发一个"换库了"的信号。
     *
     * 目录的展开/收起状态是按路径存的，而路径是带库名的 ——
     * 换库之后旧路径在新库里一个都不存在，于是所有目录都成了"没标过 = 展开"，
     * 看着就是"一更新/一切库，文件夹全被展开"。
     * 侧边栏拿到这个信号后清一次折叠状态，让新库按自己的第一层重新收起。
     */
    libEpoch.value++
    tabs.value = loadTabs()
    currentPath.value = ''
    rawMap.value = {}
    error.value = ''
    await loadAll()
  }

  let allRequest = 0
  async function loadAll() {
    const request = ++allRequest
    // 先问清自己是谁：guest 拿到的树是服务端剪过的，前端只管别露出编辑入口
    await loadMe()
    if (!isGuest.value) loadShare()
    loading.value = true
    error.value = ''
    try {
      if (!(await loadTree())) return
      if(currentPath.value)await loadPageMeta()
      if (request !== allRequest) return
      // 路由点名的那一篇最优先（/edit/调研/数据调研、分享过来的 /onlyread/…）
      const routed = routedDocPath()
      const routedHit = routed
        ? allDocs.value.find((d) => d.file === routed || d.file.replace(/\.(md|pdf)$/i, '') === routed)
        : null
      if (routedHit) {
        if (currentPath.value !== routedHit.file) await select(routedHit.file)
      } else if (!currentPath.value && allDocs.value.length) {
        currentPath.value = allDocs.value[0].file
      }
    } catch (e) {
      if (request === allRequest) error.value = String(e.message || e)
    } finally {
      if (request === allRequest) loading.value = false
    }
  }

  /** 把当前这一篇写进地址栏：/edit/<路径> 或 /onlyread/<路径>（别人复制地址就能直达） */
  function syncUrl() {
    const mode = window.__readerPublicView ? 'onlyread' : 'doc'
    // 地址里不带 .md/.pdf：短一点、也跟用户手写的一致
    const clean = String(currentPath.value || '').replace(/\.(md|pdf)$/i, '')
    const path = clean ? '/' + clean.split('/').map(encodeURIComponent).join('/') : ''
    /* 部署在子路径时，写回地址栏也要带前缀，否则一跳就跑到站点根上 */
    const search = new URLSearchParams(location.search)
    if (search.get('lib') === '业务面') search.set('lib', '面试准备')
    const query = search.size ? '?' + search.toString() : ''
    const next = API_BASE + '/' + mode + path + query
    if (location.pathname + location.search !== next) history.replaceState(null, '', next)
  }

  async function select(file) {
    currentPath.value = file
    await loadPageMeta()
    syncUrl()
    openTab(file)
    rememberDoc(file)
    error.value = ''
    // pdf 没有正文可读，交给 DocView 里的预览；目录（书签）单独问接口
    if (PREVIEW_TYPES.has(currentNode.value?.type)) {
      pdfTranslate.value = { status: 'idle', progress: 0, output: '', error: '' }
      pdfView.value = 'source'
      await loadPdfToc(file)
      checkTranslate(file)
      return
    }
    pdfToc.value = []
    try {
      await loadDoc(file,{force:rawMap.value[file]===savedMap.value[file]})
    } catch (e) {
      error.value = '打开《' + (allDocs.value.find((d) => d.file === file)?.name || file) + '》失败：' + String(e.message || e)
    }
  }

  /** 起一个翻译任务（后台跑，回来轮询进度） */
  async function startTranslate() {
    const file = currentPath.value
    if (!file) return
    try {
      const res = await fetch(API_BASE + '/api/pdf-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file })
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || '起不了翻译任务')
      pdfTranslate.value = json.data
      if (json.data.error) error.value = json.data.error
      if (json.data.status === 'running') pollTranslate()
      else if (json.data.status === 'done') pdfView.value = 'translated'
    } catch (e) {
      error.value = '翻译失败：' + String(e.message || e)
    }
  }

  let translateTimer = null

  /** 每 3 秒问一次进度，翻完自动切到译文 */
  function pollTranslate() {
    clearTimeout(translateTimer)
    const file = currentPath.value
    if (!file) return
    translateTimer = setTimeout(async () => {
      if (currentPath.value !== file) return
      try {
        const res = await fetch(API_BASE + '/api/pdf-translate?path=' + encodeURIComponent(file))
        const json = await res.json()
        if (!json.ok) return pollTranslate()
        pdfTranslate.value = json.data
        if (json.data.status === 'running') pollTranslate()
        else if (json.data.status === 'done') pdfView.value = 'translated'
        else if (json.data.status === 'failed') error.value = json.data.error || '翻译失败'
      } catch {
        pollTranslate()
      }
    }, 3000)
  }

  /** 切到 pdf 时问一下有没有现成译文（有就显示看译文） */
  async function checkTranslate(file) {
    try {
      const res = await fetch(API_BASE + '/api/pdf-translate?path=' + encodeURIComponent(file))
      const json = await res.json()
      if (json.ok && currentPath.value === file) pdfTranslate.value = json.data
    } catch {
      /* 查不到就当没翻过 */
    }
  }

  /** 问接口要这篇 pdf 的书签目录 */
  function loadPdfToc() {
    pdfToc.value=[]; pdfPage.value=1; pdfTocSource.value=''; pdfPages.value=0; pdfTocError.value=''
    // PdfPreview extracts bookmarks after drawing the first page, without blocking navigation.
  }

  /** 重新从磁盘读当前这篇，放弃内存里的改动 */
  async function reload() {
    if (!currentPath.value) return
    error.value = ''
    try {
      await loadDoc(currentPath.value, { force: true })
    } catch (e) {
      error.value = String(e.message || e)
    }
  }

  /* ---------- 编辑 ---------- */

  function updateContent(text) {
    if (!currentPath.value) return
    rawMap.value[currentPath.value] = text
  }

  /** 丢掉当前这篇没保存的改动，退回上次保存的内容 */
  function discard() {
    if (!currentPath.value) return
    rawMap.value[currentPath.value] = savedMap.value[currentPath.value] ?? ''
  }

  /**
   * 保存。返回是否成功——调用方必须看返回值，
   * 之前这里把异常吞成 error 后正常 resolve，导致保存失败也照样切走文档。
   *
   * 只写正文。文件名叫什么、在哪个目录，全由磁盘决定，保存不碰它们。
   */
  let saveTask = null
  async function savePath(path) {
    if (!path) return true
    // 同一时间只允许一个写请求。等待前一次结束后重新取最新正文，
    // 避免慢请求把后发的修改覆盖回旧版本。
    while (saveTask) await saveTask
    // 从没读到过内容就保存，等于把空内容写回磁盘，必须拦住
    if (rawMap.value[path] === undefined) {
      error.value = '这篇没有成功读取，拒绝保存，免得把空内容覆盖上去'
      return false
    }
    if (rawMap.value[path] === savedMap.value[path]) return true
    const task = (async () => {
      saving.value = true
      error.value = ''
      const content = rawMap.value[path]
      try {
        const result=await api('PUT', '/doc', {path,content,revision:revisionMap.value[path]})
        revisionMap.value[path]=result.data.revision
        conflict.value=null
        savedMap.value[path] = content
        savedAt.value = Date.now()
        return true
      } catch (e) {
        if(e.code==='CONFLICT')conflict.value={path,local:content,base:savedMap.value[path],remote:e.details.content,revision:e.details.revision}
        error.value = '保存失败：' + String(e.message || e)
        return false
      } finally {
        saving.value = false
      }
    })()
    saveTask = task
    const ok = await task
    if (saveTask === task) saveTask = null
    if (!ok) return false
    // 写入期间如果又输入了内容，继续存到最新版本再报告成功。
    return rawMap.value[path] === savedMap.value[path] ? true : savePath(path)
  }

  async function save() {
    return savePath(currentPath.value)
  }

  /* ---------- 树结构增删改 ---------- */

  /** 缓存键跟着文件路径搬，路径没变就什么都不动（删了就等于把正文从缓存里抹掉） */
  function moveCache(from, to) {
    if (!to || to === from) return
    if (rawMap.value[from] !== undefined) {
      rawMap.value[to] = rawMap.value[from]
      savedMap.value[to] = savedMap.value[from]
      revisionMap.value[to] = revisionMap.value[from]
      delete revisionMap.value[from]
      delete rawMap.value[from]
      delete savedMap.value[from]
    }
  }

  async function createDoc(dir, name) {
    const { data } = await api('POST', '/doc', { dir, name })
    await loadTree()
    await select(data.file)
    return data
  }

  async function deleteDoc(file) {
    if (saveTask) await saveTask
    await api('DELETE', '/doc', { path: file })
    delete rawMap.value[file]
    delete savedMap.value[file]
    // 标签里也别留着一篇已经不存在的文档
    tabs.value = tabs.value.filter((f) => f !== file)
    saveTabs()
    await loadTree()
  }

  /** 改名 = 改文件名，正文一个字都不动 */
  async function renameDoc(file, name) {
    if (currentPath.value === file && rawMap.value[file] !== undefined && !(await savePath(file))) {
      throw new Error(error.value || '保存失败，未改名')
    }
    const { data } = await api('PATCH', '/doc', { path: file, name })
    moveCache(file, data.file)
    remapTabs(file, data.file)
    if (currentPath.value === file) currentPath.value = data.file
    await loadTree()
  }

  /**
   * 拖拽调整某一层里条目的顺序：names 是这一层的完整名字列表（目录名 / 带扩展名的文件名）。
   * 只记显示顺序，磁盘上的东西一个都不动。
   */
  async function reorderEntries(parent, names) {
    await api('PUT', '/order', { parent, names })
    await loadTree()
  }

  /** 换目录（拖拽） */
  async function moveDoc(file, dir) {
    if (currentPath.value === file && rawMap.value[file] !== undefined && !(await savePath(file))) {
      throw new Error(error.value || '保存失败，未移动')
    }
    const { data } = await api('PUT', '/move/doc', { file, dir })
    moveCache(file, data.file)
    remapTabs(file, data.file)
    if (currentPath.value === file) currentPath.value = data.file
    await loadTree()
    return data
  }

  async function copyDoc(file, dir) {
    const { data } = await api('POST', '/copy/doc', { file, dir })
    await loadTree()
    return data
  }

  async function copyCategory(path, toParent) {
    const { data } = await api('POST', '/copy/category', { path, toParent })
    await loadTree()
    return data
  }

  /** 把目录挪到另一个目录下（拖拽）。目录连同里面的东西一起走。 */
  async function moveCategory(path, toParent) {
    if (currentPath.value.startsWith(path + '/') && rawMap.value[currentPath.value] !== undefined && !(await savePath(currentPath.value))) {
      throw new Error(error.value || '保存失败，未移动目录')
    }
    const { data } = await api('PUT', '/move/category', { path, toParent })
    // 目录下所有文档的路径都变了，缓存键跟着搬
    const remap = (map) => {
      const next = {}
      for (const [k, v] of Object.entries(map.value)) {
        next[k === path || k.startsWith(path + '/') ? data.path + k.slice(path.length) : k] = v
      }
      map.value = next
    }
    remap(rawMap)
    remap(savedMap)
    remap(revisionMap)
    remapTabs(path, data.path)
    if (currentPath.value === path || currentPath.value.startsWith(path + '/')) {
      currentPath.value = data.path + currentPath.value.slice(path.length)
    }
    await loadTree()
    return data
  }

  async function createCategory(parent, name) {
    await api('POST', '/category', { parent, name })
    await loadTree()
  }

  async function renameCategory(path, name) {
    if (currentPath.value.startsWith(path + '/') && rawMap.value[currentPath.value] !== undefined && !(await savePath(currentPath.value))) {
      throw new Error(error.value || '保存失败，未改名目录')
    }
    const { data } = await api('PATCH', '/category', { path, name })
    // 目录改名会连带改掉里面所有文档的路径，缓存键跟着搬
    const remap = (map) => {
      const next = {}
      for (const [k, v] of Object.entries(map.value)) {
        next[k === path || k.startsWith(path + '/') ? data.path + k.slice(path.length) : k] = v
      }
      map.value = next
    }
    remap(rawMap)
    remap(savedMap)
    remap(revisionMap)
    remapTabs(path, data.path)
    if (currentPath.value === path || currentPath.value.startsWith(path + '/')) {
      currentPath.value = data.path + currentPath.value.slice(path.length)
    }
    await loadTree()
  }

  async function deleteCategory(path) {
    if (saveTask) await saveTask
    await api('DELETE', '/category', { path })
    // 先让 loadTree 依据新树清理缓存，顺序反了会把还活着的也清掉
    await loadTree()
  }


  const contentEpoch=ref(0)
  async function loadPageMeta() {
    const path=currentPath.value
    pageMeta.value={};pageMetaRevision.value=''
    if(!path)return
    try {const {data}=await api('GET','/metadata?path='+encodeURIComponent(path));if(currentPath.value===path){pageMeta.value=data.meta;pageMetaRevision.value=data.revision}}
    catch(e){error.value=e.message}
  }
  async function savePageMeta(patch) {
    const path=currentPath.value
    let result;try{result=await api('PUT','/metadata',{path,revision:pageMetaRevision.value,meta:patch})}catch(e){if(e.code==='CONFLICT')await loadPageMeta();throw e}
    const {data}=result
    if(currentPath.value===path){pageMeta.value=data.meta;pageMetaRevision.value=data.revision}
    const update=list=>{for(const node of list){if(node.file===path)node.meta=data.meta;if(node.children)update(node.children)}};update(treeNodes.value)
    return data
  }
  async function resolveConflict(mode,merged) {
    if (!['copy','merge','remote'].includes(mode)) throw Error('未知冲突处理方式')
    const c=conflict.value;if(!c)return
    if(mode==='copy') {
      const dir=c.path.split('/').slice(0,-1).join('/')
      await api('POST','/doc',{dir,name:c.path.split('/').pop().replace(/\.md$/i,'')+'（冲突副本）',content:c.local,requestId:crypto.randomUUID()})
    }
    revisionMap.value[c.path]=c.revision;savedMap.value[c.path]=c.remote
    rawMap.value[c.path]=mode==='merge'?merged:c.remote
    conflict.value=null;error.value=''
    contentEpoch.value++
    if(mode==='merge'){if(!(await savePath(c.path)))throw Error(error.value)}
    else await loadTree()
  }
  async function renameLibrary(from,to) {
    if(isDirty.value && !(await save()))throw new Error(error.value)
    const result=await api('PUT','/lib/name',{from,to,requestId:crypto.randomUUID()})
    const previous=currentPath.value
    const activeLibrary = new URL(location.href).searchParams.get('lib') === from
    const convert=v=>v===from||v.startsWith(from+'/')?to+v.slice(from.length):v
    for(const map of [rawMap,savedMap,revisionMap])map.value=Object.fromEntries(Object.entries(map.value).map(([k,v])=>[convert(k),v]))
    tabs.value=tabs.value.map(convert);currentPath.value=convert(previous)
    const url=new URL(location.href);if(activeLibrary)url.searchParams.set('lib',to);history.replaceState(null,'',url)
    saveTabs();rememberDoc(currentPath.value);syncUrl();libEpoch.value++
    await loadTree();await loadPageMeta();return result.data
  }

  return {
    contentEpoch,pageMeta,pageMetaRevision,loadPageMeta,savePageMeta,conflict,resolveConflict,renameLibrary,
    legacyLib,
    libEpoch,
    switchLib,
    moveDoc,
    moveCategory,
    copyDoc,
    copyCategory,
    reorderEntries,
    pdfToc,
    pdfTocSource,
    pdfPages,
    pdfTocError,
    pdfTranslate,
    pdfView,
    startTranslate,
    pdfPage,
    loadPdfToc,
    treeNodes,
    currentPath,
    rawMap,
    savedMap,
    loading,
    saving,
    savedAt,
    error,
    searchKeyword,
    tabs,
    openTab,
    closeTab,
    allFiles,
    allDocs,
    currentNode,
    currentDoc,
    currentMeta,
    currentRaw,
    currentHtml,
    currentToc,
    isDirty,
    currentLoaded,
    searchResults,
    loadTree,
    loadDoc,
    loadAll,
    select,
    reload,
    updateContent,
    discard,
    save,
    createDoc,
    deleteDoc,
    renameDoc,
    createCategory,
    renameCategory,
    deleteCategory,
    role, restoredCopy, pdfTranslationAvailable,
    isGuest, currentReadonly, canEdit, accessRequest, requestAccess,
    shareInfo,
    loadShare,
    syncUrl
  }
})
