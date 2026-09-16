import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { renderMarkdown, extractToc, searchDocs } from '../utils/markdown'
import { API_BASE } from '../utils/api'

/**
 * 文档树与正文都由本地接口提供，接口直接读写磁盘上的 md 文件。
 * 所以这个 store 既是阅读层也是编辑层。
 *
 * ★ 名字只有一个来源：文件名。树是接口扫盘扫出来的（目录 = 分类，文件名 = 文档名），
 *   这里不存任何"标题"字段，正文里的一级标题只是正文内容 ——
 *   所以不存在"侧栏名和正文标题谁同步谁"的问题。
 *   在 app 外面改名、换目录、新增、删除，下一次 loadTree 就一致。
 */
async function api(method, endpoint, payload) {
  const opt = { method }
  if (method !== 'GET') {
    opt.headers = { 'Content-Type': 'application/json' }
    opt.body = JSON.stringify(payload || {})
  }
  const res = await fetch(API_BASE + '/api' + endpoint, opt)
  let json
  try {
    json = await res.json()
  } catch {
    throw new Error(`接口返回异常 HTTP ${res.status}`)
  }
  if (!json.ok) throw new Error(json.error || '接口出错')
  return json
}

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

/**
 * 打开的文档列表，就是工作台上摊着的那几篇。
 *
 * 只存路径（顺序就是标签顺序），正文本来就有缓存；刷新后用它恢复，
 * 但要在文档树到手之后 prune 一次：文件可能已经被改名或删掉了。
 */
const TABS_KEY = 'reader.tabs'

function loadTabs() {
  try {
    const raw = JSON.parse(localStorage.getItem(TABS_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string' && x) : []
  } catch {
    return []
  }
}

function lastDoc() {
  try {
    return localStorage.getItem(LAST_DOC_KEY) || ''
  } catch {
    return ''
  }
}

function rememberDoc(file) {
  try {
    if (file) localStorage.setItem(LAST_DOC_KEY, file)
  } catch {
    /* 隐私模式下写不了就算了 */
  }
}

export const useDocsStore = defineStore('docs', () => {
  const treeNodes = ref([])   // [{ type: 'folder'|'doc', name, path|file, mtime }]，目录可嵌套
  const currentPath = ref('') // 当前文档的文件路径，同时作为身份
  const rawMap = ref({})      // path -> 原文
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
  const currentMeta = computed(() => currentNode.value || { name: '未选择', file: '' })
  const currentRaw = computed(() => rawMap.value[currentPath.value] ?? '')
  const currentHtml = computed(() => renderMarkdown(currentRaw.value))
  const currentToc = computed(() => extractToc(currentRaw.value))
  /** 当前这篇的正文有没有读到内存。编辑器必须等内容到位再挂载，否则会拿空内容创建。 */
  const currentLoaded = computed(() => {
    if (!currentPath.value) return false
    // pdf 不用读正文，直接交给浏览器预览
    if (currentNode.value?.type === 'pdf') return true
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
    const docs = allDocs.value
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

  /** 'owner' = 我（能编辑）；'guest' = 别人（只读，只能看勾选分享的部分） */
  const role = ref('owner')
  const isGuest = computed(() => role.value === 'guest')
  /** 分享设置：{ shared: { 路径: true }, editable: {...}, guestToken } */
  const shareInfo = ref({ shared: {}, editable: {}, guestToken: '' })

  async function loadMe() {
    try {
      const res = await fetch(API_BASE + '/api/me')
      const json = await res.json()
      if (json.ok) role.value = json.data.role
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

  /** 勾选 / 取消某个节点对外可见 */
  async function setShared(path, shared, editable) {
    const res = await fetch(API_BASE + '/api/share', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, shared, editable })
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || '改分享设置失败')
    shareInfo.value = json.data
  }

  /** 别人那条链接（把 token 带上，服务器靠它认身份） */
  function guestLink() {
    // 直接给只读模式的地址，并且带上当前这一篇：对方打开就落在这一篇上
    const token = shareInfo.value.guestToken
    const path = currentPath.value ? '/' + currentPath.value.split('/').map(encodeURIComponent).join('/') : ''
    return location.origin + '/onlyread' + path + (token ? '?token=' + token : '')
  }

  function saveTabs() {
    try {
      localStorage.setItem(TABS_KEY, JSON.stringify(tabs.value))
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
   * 直接从 location 读，不依赖 main.js 先塞一个全局变量 ——
   * 那样子依赖初始化顺序，刚才就因此一直没生效（踩过）。
   */
  function routedDocPath() {
    try {
      const m = decodeURI(location.pathname).match(/^\/(?:edit|onlyread)\/(.+)$/)
      return m ? m[1].replace(/\/+$/, '') : ''
    } catch {
      return ''
    }
  }

  /**
   * 地址栏里点名的那一篇（/edit/调研/数据调研 或 /onlyread/…）。
   *
   * 直接从 location 读，不依赖 main.js 先塞的全局变量 ——
   * 那样子依赖初始化顺序，前面试了两处都没生效（踩过）。
   */
  function routedDocPath() {
    try {
      const m = decodeURI(location.pathname).match(/^\/(?:edit|onlyread)\/(.+)$/)
      return m ? m[1].replace(/\/+$/, '') : ''
    } catch {
      return ''
    }
  }

  async function ensureCurrent() {
    pruneTabs()
    if (allDocs.value.some((d) => d.file === currentPath.value)) {
      openTab(currentPath.value)
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
      if (currentNode.value?.type !== 'pdf') {
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
    if (currentPath.value && currentNode.value?.type !== 'pdf') {
      try {
        await loadDoc(currentPath.value)
      } catch (e) {
        error.value = String(e.message || e)
      }
    }
  }

  /* ---------- 读取 ---------- */

  async function loadTree() {
    const { data } = await api('GET', '/tree')
    treeNodes.value = Array.isArray(data.nodes) ? data.nodes : []
    pruneCache()
    await ensureCurrent()
  }

  async function loadDoc(file, { force = false } = {}) {
    if (!file) return ''
    if (!force && rawMap.value[file] !== undefined) return rawMap.value[file]
    const res = await fetch(API_BASE + '/api/doc?path=' + encodeURIComponent(file))
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || '读取失败')
    rawMap.value[file] = json.data.content
    savedMap.value[file] = json.data.content
    return json.data.content
  }

  async function loadAll() {
    // 先问清自己是谁：guest 拿到的树是服务端剪过的，前端只管别露出编辑入口
    await loadMe()
    if (!isGuest.value) loadShare()
    loading.value = true
    error.value = ''
    try {
      await loadTree()
      await Promise.all(allDocs.value.map((d) => loadDoc(d.file)))
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
      error.value = String(e.message || e)
    } finally {
      loading.value = false
    }
  }

  /** 把当前这一篇写进地址栏：/edit/<路径> 或 /onlyread/<路径>（别人复制地址就能直达） */
  function syncUrl() {
    const mode = window.__readerMode === 'guest' ? 'onlyread' : 'edit'
    // 地址里不带 .md/.pdf：短一点、也跟用户手写的一致
    const clean = String(currentPath.value || '').replace(/\.(md|pdf)$/i, '')
    const path = clean ? '/' + clean.split('/').map(encodeURIComponent).join('/') : ''
    /* 部署在子路径时，写回地址栏也要带前缀，否则一跳就跑到站点根上 */
    const next = API_BASE + '/' + mode + path + location.search
    if (location.pathname + location.search !== next) history.replaceState(null, '', next)
  }

  async function select(file) {
    currentPath.value = file
    syncUrl()
    openTab(file)
    rememberDoc(file)
    error.value = ''
    // pdf 没有正文可读，交给 DocView 里的预览；目录（书签）单独问接口
    if (currentNode.value?.type === 'pdf') {
      pdfTranslate.value = { status: 'idle', progress: 0, output: '', error: '' }
      pdfView.value = 'source'
      await loadPdfToc(file)
      checkTranslate(file)
      return
    }
    pdfToc.value = []
    try {
      await loadDoc(file)
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

  /** 切到 pdf 时问一下有没有现成译文（有就显示「看译文」） */
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
  async function loadPdfToc(file) {
    pdfToc.value = []
    pdfPage.value = 1
    pdfTocSource.value = ''
    pdfPages.value = 0
    pdfTocError.value = ''
    try {
      const res = await fetch(API_BASE + '/api/pdf-toc?path=' + encodeURIComponent(file))
      const json = await res.json()
      // 等接口回来的路上可能已经切走了
      if (json.ok && currentPath.value === file) {
        pdfToc.value = json.data.toc || []
        pdfTocSource.value = json.data.source || ''
        pdfPages.value = json.data.pages || 0
        pdfTocError.value = json.data.error || ''
      }
    } catch {
      /* 抽不出目录不影响看 pdf */
    }
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
  async function save() {
    if (!currentPath.value) return true
    const path = currentPath.value
    // 从没读到过内容就保存，等于把空内容写回磁盘，必须拦住
    if (rawMap.value[path] === undefined) {
      error.value = '这篇没有成功读取，拒绝保存，免得把空内容覆盖上去'
      return false
    }
    if (!isDirty.value) return true
    saving.value = true
    error.value = ''
    try {
      const content = rawMap.value[path]
      await api('PUT', '/doc', { path, content })
      savedMap.value[path] = content
      savedAt.value = Date.now()
      return true
    } catch (e) {
      error.value = '保存失败：' + String(e.message || e)
      return false
    } finally {
      saving.value = false
    }
  }

  /* ---------- 树结构增删改 ---------- */

  /** 缓存键跟着文件路径搬，路径没变就什么都不动（删了就等于把正文从缓存里抹掉） */
  function moveCache(from, to) {
    if (!to || to === from) return
    if (rawMap.value[from] !== undefined) {
      rawMap.value[to] = rawMap.value[from]
      savedMap.value[to] = savedMap.value[from]
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
    const { data } = await api('PUT', '/move/doc', { file, dir })
    moveCache(file, data.file)
    remapTabs(file, data.file)
    if (currentPath.value === file) currentPath.value = data.file
    await loadTree()
    return data
  }

  /** 把目录挪到另一个目录下（拖拽）。目录连同里面的东西一起走。 */
  async function moveCategory(path, toParent) {
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
    const { data } = await api('PATCH', '/category', { path, name })
    await loadTree()
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
    remapTabs(path, data.path)
    if (currentPath.value === path || currentPath.value.startsWith(path + '/')) {
      currentPath.value = data.path + currentPath.value.slice(path.length)
    }
  }

  async function deleteCategory(path) {
    await api('DELETE', '/category', { path })
    // 先让 loadTree 依据新树清理缓存，顺序反了会把还活着的也清掉
    await loadTree()
  }

  return {
    moveDoc,
    moveCategory,
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
    role,
    isGuest,
    shareInfo,
    loadShare,
    setShared,
    syncUrl,
    guestLink
  }
})
