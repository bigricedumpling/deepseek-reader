import {readerApi as api} from '../services/readerClient'
import { mergeDocument } from '../utils/merge-document.js'
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { documentDrafts } from '../utils/document-drafts.js'
import { renderMarkdown, extractToc } from '../utils/markdown'
import { API_BASE } from '../utils/api'
import { documentRoutePath, findRoutedDocument } from '../utils/routes.js'

/*
 * 成品文件的类型：pdf 与 h5。
 *
 * 这两种不读正文、不进编辑器，交给浏览器整页渲染（pdf 用自带阅读器，h5 用 iframe）。
 * 以前这些判定一处一处写的 'pdf'，加 h5 时漏一处就会出现按 pdf 处理 html
 * 或者html 当 markdown 解析这类错，所以收成一个集合。
 */
const PREVIEW_TYPES = new Set(['pdf', 'h5'])
const TOC_CACHE_FILES = 4
const TOC_CACHE_MAX_CHARS_PER_FILE = 512 * 1024


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

function lastDocKey(lib) {
  return LAST_DOC_KEY + (window.__readerMode === 'guest' ? ':guest' : '') + (lib ? ':' + lib : '')
}

function libraryOf(file) {
  return file.includes('/') ? file.split('/')[0] : ''
}

function sessionKey(name) {
  return 'typocket.' + name + ':' + API_BASE + ':' + (window.__readerMode === 'owner' ? 'owner' : 'guest')
}

function tabsKey() {
  return sessionKey('open-tabs')
}

function loadTabs() {
  try {
    const saved = localStorage.getItem(tabsKey())
    const parse = value => {
      try {
        const list = JSON.parse(value || '[]')
        return Array.isArray(list) ? list.filter(item => typeof item === 'string' && item) : []
      } catch { return [] }
    }
    if (saved !== null) return [...new Set(parse(saved))]
    const guest = window.__readerMode !== 'owner'
    const prefix = guest ? 'reader.tabs:guest' : 'reader.tabs'
    const paths = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || (!guest && (key === 'reader.tabs:guest' || key.startsWith('reader.tabs:guest:')))) continue
      if (key === prefix || key.startsWith(prefix + ':')) paths.push(...parse(localStorage.getItem(key)))
    }
    return [...new Set(paths)]
  } catch { return [] }
}

function lastDoc(lib) {
  try {
    return localStorage.getItem(lastDocKey(lib)) || ''
  } catch {
    return ''
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
  const saveTimes = ref(new Map())
  const error = ref('')
  /**
   * 错误来自哪一步：save / load / action。
   * 界面上不能把所有错误都当成"保存失败"，更不能用"重新读取"
   * 去处理保存失败 —— 那会直接丢掉用户刚改的内容。
   */
  const errorKind = ref('')
  function setError(message, kind = 'action') {
    error.value = String(message || '')
    errorKind.value = error.value ? kind : ''
  }
  function clearError() {
    setError('')
  }
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
  const savedAt = computed(() => saveTimes.value.get(currentNode.value?.id) || 0)
  const currentDoc = computed(
    () => allDocs.value.find((d) => d.file === currentPath.value) || null
  )
  // Another local client can recreate a file before the sidebar tree refreshes.
  const readIdentities = ref({})
  const currentSourceId = computed(() => readIdentities.value[currentPath.value]?.id ?? currentNode.value?.id)
  const currentMeta = computed(() => currentNode.value ? {...currentNode.value, meta:pageMeta.value} : {name:'未选择',file:''})
  const currentRaw = computed(() => rawMap.value[currentPath.value] ?? '')
  const currentHtml = computed(() => renderMarkdown(currentRaw.value))
  // Keep a single outline per recently read path, only while its full source matches.
  const tocByPath = new Map()
  const currentToc = computed(() => {
    const file = currentPath.value
    const source = currentRaw.value
    const previous = tocByPath.get(file)
    tocByPath.delete(file)
    if (!source || currentNode.value?.type !== 'doc') return []
    if (previous?.source === source) {
      tocByPath.set(file, previous)
      return previous.toc
    }
    const toc = extractToc(source)
    if (source.length <= TOC_CACHE_MAX_CHARS_PER_FILE) {
      tocByPath.set(file, { source, toc })
      if (tocByPath.size > TOC_CACHE_FILES) tocByPath.delete(tocByPath.keys().next().value)
    }
    return toc
  })
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

  const drafts = documentDrafts()
  const readWorkspace = computed(() => readIdentities.value[currentPath.value]?.workspaceId)
  const draftScope = computed(() => currentLoaded.value && !currentReadonly.value && currentNode.value?.type === 'doc' && readWorkspace.value && currentSourceId.value
    ? 'typocket.draft:v1:' + JSON.stringify([API_BASE, readWorkspace.value, role.value, currentSourceId.value]) : '')
  const recovery = ref(null)
  function findDraft() {
    recovery.value = drafts.latest(draftScope.value, savedMap.value[currentPath.value])
  }
  function refreshDraftNotice(event) {
    if (recovery.value && (event.key === null || event.key === recovery.value.key)) findDraft()
  }
  function checkpointDraft() {
    const path = currentPath.value
    return drafts.checkpoint(draftScope.value, savedMap.value[path], revisionMap.value[path], rawMap.value[path])
  }
  function prepareToLeave() {
    const flushed = flushActiveEditor(currentPath.value)
    const protectedDraft = !isDirty.value || checkpointDraft()
    return flushed && protectedDraft
  }
  function discardRecoveredDraft(draft) {
    if (!draft || draft !== recovery.value || draft.scope !== draftScope.value) return
    drafts.remove(draft)
    findDraft()
  }
  function checkReadIdentity(disk) {
    if ((currentSourceId.value && disk.id !== currentSourceId.value) ||
        (readWorkspace.value && disk.workspaceId !== readWorkspace.value)) {
      throw Error('工作区或文档已经更换，请重新打开原文档')
    }
  }
  async function recoverDraft() {
    const draft = recovery.value, path = currentPath.value
    if (!draft || draft.scope !== draftScope.value || !flushActiveEditor(path) || isDirty.value || saving.value) return
    try {
      const { data: disk } = await api('GET', '/doc?path=' + encodeURIComponent(path))
      if (draft !== recovery.value || path !== currentPath.value || draft.scope !== draftScope.value ||
          !flushActiveEditor(path) || isDirty.value || saving.value) return
      checkReadIdentity(disk)
      if (!drafts.stillCurrent(draft)) { findDraft(); return }
      const text = disk.revision === draft.revision ? draft.text : mergeDocument(draft.base, draft.text, disk.content)
      drafts.accept(draft)
      recovery.value = null
      if (text === null) {
        // Keep the original common ancestor if this conflict is interrupted again.
        adoptRevision(path, { content: draft.base, revision: draft.revision }, draft.text)
        conflict.value = { path, local: draft.text, remote: disk.content, revision: disk.revision }
      } else {
        adoptRevision(path, disk, text)
        if (text === disk.content) { drafts.finish(draftScope.value); findDraft() }
      }
    } catch (e) { setError(e.message || e, 'load') }
  }

  /* ---------- 缓存自愈 ---------- */

  /**
   * 把树里已经不存在的文档从缓存里清掉。
   * 删目录、在 app 外面删文件、改名之后都要跑一次，否则 loadDoc 会命中残留直接返回旧内容。
   */
  function pruneCache() {
    const alive = new Set(allDocs.value.map((d) => d.file))
    for (const file of documentReads.keys()) if (!alive.has(file)) documentReads.delete(file)
    for (const file of tocByPath.keys()) {
      if ((!activeLibrary.value || libraryOf(file) === activeLibrary.value) && !alive.has(file)) tocByPath.delete(file)
    }
    for (const k of Object.keys(rawMap.value)) {
      if (!alive.has(k)) {
        delete rawMap.value[k]
        delete savedMap.value[k]
        delete revisionMap.value[k]
        delete readIdentities.value[k]
      }
    }
  }

  /* ---------- 打开的文档（标签页） ---------- */

  const tabs = ref(loadTabs())
  // Only display entries confirmed by this instance and the current access mode.
  const tabIcons = ref(new Map())
  const restoring = new Set(tabs.value)
  const activeLibrary = ref(routedLib())
  const switchingLibrary = ref(false)
  let navigationRequest = 0
  let metadataRequest = 0
  const pendingDestination = ref(null)
  let retryDestination = null

  const recentKey = sessionKey('recent-docs')
  let recentHistory = []
  recentHistory = readRecentDocs(true)
  function readRecentDocs(migrate = false) {
    try {
      const saved = localStorage.getItem(recentKey)
      if (saved === null && !migrate) return recentHistory
      const raw = JSON.parse(saved ?? localStorage.getItem('reader.recent-docs') ?? '[]')
      if (!Array.isArray(raw)) return []
      const records = raw.filter(item => item && typeof item.file === 'string' && Number.isFinite(item.at)).slice(0, 40)
      if (saved !== null) return records
      // A local owner's original installation kept even closed documents here.
      // resolveRecentDocs verifies every path before presenting it in the menu.
      const localOwner = !API_BASE && window.__readerMode === 'owner'
        && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname)
      if (localOwner) return records
      // Other deployments and public views can only attribute previously scoped opens.
      const scopedPaths = JSON.parse(localStorage.getItem(tabsKey()) || '[]')
      if (Array.isArray(scopedPaths)) return records.filter(item => scopedPaths.includes(item.file))
    } catch { /* Keep this window's latest history when storage is unavailable. */ }
    return recentHistory
  }

  function writeRecentDocs(records) {
    const seen = new Set()
    recentHistory = records.filter(item => {
      if (seen.has(item.file)) return false
      seen.add(item.file)
      return true
    }).slice(0, 40)
    try { localStorage.setItem(recentKey, JSON.stringify(recentHistory)) } catch {}
  }

  function rememberDoc(file) {
    if (!file) return
    try { localStorage.setItem(lastDocKey(libraryOf(file)), file) } catch {}
    const id = currentNode.value?.file === file ? currentNode.value.id : undefined
    const records = readRecentDocs().filter(item => item.file !== file && (!id || item.id !== id))
    writeRecentDocs([{ file, id, at: Date.now() }, ...records])
  }

  async function resolveRecentDocs() {
    const records = readRecentDocs()
    const items = []
    const repaired = new Map()
    const seen = new Set()
    let unavailable = false
    for (let i = 0; i < records.length && items.length < 6;) {
      const batch = records.slice(i, i + 6 - items.length)
      i += batch.length
      const resolved = await Promise.all(batch.map(async item => {
        try {
          const query = item.id ? 'id=' + encodeURIComponent(item.id) : 'path=' + encodeURIComponent(item.file)
          const { data } = await api('GET', '/resolve?' + query)
          return data
        } catch (error) {
          if (error.status === 403 || error.status === 404) return null
          unavailable = true
          return undefined
        }
      }))
      for (const [index, data] of resolved.entries()) {
        const item = batch[index]
        if (data === undefined) continue
        if (!data || data.path !== item.file || data.id !== item.id) repaired.set(item.file, { at: item.at, data })
        if (!data || seen.has(data.path)) continue
        seen.add(data.path)
        items.push({ file: data.path, icon: data.meta?.icon || '', at: item.at })
      }
    }
    if (repaired.size) {
      // A second window may open another document while the requests are in flight.
      writeRecentDocs(readRecentDocs().flatMap(item => {
        const change = repaired.get(item.file)
        if (!change || change.at !== item.at) return [item]
        return change.data ? [{ ...item, file: change.data.path, id: change.data.id }] : []
      }))
    }
    return { items, unavailable }
  }


  /* ---------- 身份 ---------- */

  /** owner 可管理全部内容；guest 只见公开内容，且只能编辑未锁定项。 */
  /** 每换一次知识库 +1；侧边栏据此知道"折叠状态该重置了" */
  const libEpoch = ref(0)
  const role = ref(window.__readerMode === 'owner' ? 'owner' : 'guest')
  const restoredCopy = ref(false), pdfTranslationAvailable=ref(false)
  const isGuest = computed(() => role.value !== 'owner')
  const currentReadonly = computed(() => !canEdit(currentNode.value))
  function canEdit(node) { return !!node && (!isGuest.value || (node.locked === false && node.shared === true)) }

  async function loadMe() {
    try {
      const res = await fetch(API_BASE + '/api/me')
      const json = await res.json()
      if (json.ok) { role.value = json.data.role; restoredCopy.value = json.data.restoredCopy === true; pdfTranslationAvailable.value=json.data.pdfTranslationAvailable===true }
    } catch {
      /* 问不到就按"我"处理（本机 dev 一直是这个分支） */
    }
  }

  watch([draftScope, currentPath], findDraft)

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
    const node = allFiles.value.find(item => item.file === file)
    if (node) tabIcons.value.set(file, node.meta?.icon || '')
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
    if (pendingDestination.value?.file === file) {
      navigationRequest++
      pendingDestination.value = null
      switchingLibrary.value = false
    }
    tabs.value.splice(i, 1)
    tocByPath.delete(file)
    tabIcons.value.delete(file)
    saveTabs()
    if (currentPath.value !== file) return currentPath.value
    return tabs.value[Math.min(i, tabs.value.length - 1)] || ''
  }

  /** 拖拽排序后按新顺序保存；只接受同一批标签，避免外部误传。 */
  function reorderTabs(files) {
    if (!Array.isArray(files)) return
    const visible = tabs.value.filter(file => tabIcons.value.has(file))
    if (files.length !== visible.length || new Set(files).size !== files.length || files.some(file => !visible.includes(file))) return
    if (files.every((file, index) => file === visible[index])) return
    let index = 0
    tabs.value = tabs.value.map(file => tabIcons.value.has(file) ? files[index++] : file)
    saveTabs()
  }

  function refreshTabDetails(nodes, library) {
    const files = new Map(nodes.map(node => [node.file, node]))
    const next = tabs.value.filter(file => {
      if (library && libraryOf(file) !== library) return true
      const node = files.get(file)
      if (!node) tabIcons.value.delete(file)
      else if (!restoring.has(file) || tabIcons.value.has(file)) tabIcons.value.set(file, node.meta?.icon || '')
      return !!node || restoring.has(file)
    })
    if (next.length !== tabs.value.length) { tabs.value = next; saveTabs() }
  }

  function forgetLibrary(name) {
    tabs.value = tabs.value.filter(file => {
      if (libraryOf(file) !== name) return true
      tocByPath.delete(file)
      tabIcons.value.delete(file)
      return false
    })
    saveTabs()
  }

  function remapTabs(from, to) {
    const convert = file => file === from || file.startsWith(from + '/') ? to + file.slice(from.length) : file
    const mapped = tabs.value.map(file => {
      const next = convert(file)
      if (next !== file && tabIcons.value.has(file)) {
        tabIcons.value.set(next, tabIcons.value.get(file))
        tabIcons.value.delete(file)
      }
      return next
    })
    tabs.value = [...new Set(mapped)]
    saveTabs()
  }

  // Reopen saved tabs by their server-resolved paths, including aliases after a rename.
  // A former owner session or a revoked guest document must never supply a visible label.
  async function restoreTabs() {
    const saved = [...tabs.value]
    const results = new Map()
    for (let i = 0; i < saved.length; i += 8) {
      await Promise.all(saved.slice(i, i + 8).map(async file => {
        try {
          const { data } = await api('GET', '/resolve?path=' + encodeURIComponent(file))
          results.set(file, data)
        } catch (e) {
          if (e.status === 403 || e.status === 404) results.set(file, null)
        }
      }))
    }
    // Commit the strip together. The requested document can open, move or close while we wait.
    const icons = new Map(tabIcons.value)
    const currentFiles = new Map(allFiles.value.map(node => [node.file, node]))
    const paths = []
    for (const file of tabs.value) {
      const result = results.get(file)
      if (result === null) { icons.delete(file); continue }
      if (result && result.path !== file) icons.delete(file)
      const path = result?.path || file
      paths.push(path)
      const node = currentFiles.get(path) || result
      if (node) icons.set(path, node.meta?.icon || '')
    }
    restoring.clear()
    tabs.value = [...new Set(paths)]
    tabIcons.value = icons
    saveTabs()
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
       * 表现是第二条只读链接打开的是第一篇。/edit 走的是去前缀后的路径，所以一直没暴露。
       */
      const m = location.pathname.match(/\/(?:doc|edit|onlyread)\/(.+)$/)
      if (!m) return ''
      /*
       * 这里必须用 decodeURIComponent，不能用 decodeURI。
       *
       * 路径里的斜杠会被编码成 %2F（例如 Projects%2FOverview），
       * 而 decodeURI 有意不还原 %2F —— 斜杠在路径里有特殊含义。
       * 结果是查表时拿着 %2F 去比，永远匹配不上，页面静默回落到目录里第一篇：
       * 表现就是第二条只读链接打开的是第一篇。这个错误很隐蔽，因为页面不报错。
       *
       * 只解这一段，不能解整条 pathname：那样站点前缀里的编码也会被一起还原。
       */
      const raw = decodeURIComponent(m[1]).replace(/\/+$/, '')
      return legacyPath(raw)
    } catch {
      return ''
    }
  }

  /** An old directory bookmark can refer to a document under a nested folder. */
  function legacyPath(raw) {
    if (!raw) return ''
    const files = allFiles.value
    if (!files.length) return raw

    const seg = (name) => files.find((f) => f.file.indexOf(name + '/') >= 0)
    const kids = (p) => files.filter((f) => f.file.indexOf(p + '/') === 0)
    const isDoc = (p) =>
      files.some((f) => f.file === p || f.file.replace(/\.(md|pdf|html?)$/i, '') === p)

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
    const mappedPath = hit.file.slice(0, idx) + rest
    /* 指向目录时落到里面第一篇 */
    const inner = kids(mappedPath)
    return inner.length ? inner[0].file : mappedPath
  }

  /**
   * 旧书签有时没有 ?lib=，需要从其路径恢复所属知识库。
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
    /* hit.file 里 head 之前的部分可能不止一层；知识库只认最顶层的名字 */
    const idx = inside.file.indexOf(head)
    return idx > 0 ? inside.file.slice(0, idx).split('/')[0] : ''
  }

  async function ensureCurrent() {
    refreshTabDetails(allFiles.value, activeLibrary.value)
    if (allFiles.value.some((d) => d.file === currentPath.value)) {
      openTab(currentPath.value)
      syncUrl()
      return
    }
    const routed = findRoutedDocument(allFiles.value, routedDocPath())
    const last = lastDoc(activeLibrary.value)
    const node = routed || allFiles.value.find(item => item.file === last) || allFiles.value[0]
    const file = node?.file || ''
    currentPath.value = file
    pageMeta.value = node?.meta || {}
    pageMetaRevision.value = ''
    openTab(file)
    rememberDoc(file)
    syncUrl()
    if (!file) return
    try {
      await Promise.all([loadPageMeta(), PREVIEW_TYPES.has(node.type) ? null : loadDoc(file)])
    } catch (e) {
      if (currentPath.value === file) setError(e.message || e, 'load')
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
      return lib
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
    activeLibrary.value = data.lib || lib
    treeNodes.value = Array.isArray(data.nodes) ? data.nodes : []
    pruneCache()
    await ensureCurrent()
    return true
  }

  const documentReads = new Map()
  async function loadDoc(file, { force = false, preserveLocal = true } = {}) {
    if (!file) return ''
    if (!force && rawMap.value[file] !== undefined) return rawMap.value[file]
    const before = rawMap.value[file]
    const savedBefore = savedMap.value[file]
    const request = Symbol()
    documentReads.set(file, request)
    let json
    try {
      const res = await fetch(API_BASE + '/api/doc?path=' + encodeURIComponent(file))
      json = await res.json()
    } catch (error) {
      if (documentReads.get(file) !== request) return rawMap.value[file]
      documentReads.delete(file)
      throw error
    }
    if (documentReads.get(file) !== request) return rawMap.value[file]
    documentReads.delete(file)
    if (!json.ok) throw new Error(json.error || '读取失败')
    /*
     * 请求发出后用户可能已经开始编辑，甚至已经自动保存过。
     * 这时磁盘响应可能比内存里的版本旧，直接覆盖会把刚打的字吞掉。
     * 发现本地内容变过就放弃这次响应；revision 也保持旧值，下次保存会走冲突提示。
     * 只有显式「重新读取」才允许用磁盘版本覆盖本地。
     */
    if (preserveLocal && before !== undefined && (rawMap.value[file] !== before || savedMap.value[file] !== savedBefore)) {
      return rawMap.value[file]
    }
    const changed = before !== undefined && before !== json.data.content
    rawMap.value[file] = json.data.content
    savedMap.value[file] = json.data.content
    revisionMap.value[file] = json.data.revision
    if (json.data.id) readIdentities.value[file] = { id: json.data.id, workspaceId: json.data.workspaceId }
    if (changed && currentPath.value === file) contentEpoch.value++
    return json.data.content
  }

  async function saveBeforeNavigation(stillWanted = () => true) {
    // Milkdown can receive another edit while the previous PUT is in flight.
    // Flush again after every write, while the old editor still owns this path.
    if (!currentPath.value) return true
    while (stillWanted()) {
      if (conflict.value?.path === currentPath.value) return false
      if (!flushActiveEditor(currentPath.value)) {
        setError('当前编辑尚未完成，请再试一次', 'save')
        return false
      }
      if (!isDirty.value && !saving.value) return true
      if (!(await save())) return false
    }
    return false
  }

  function navigationFailed(library, file, error) {
    retryDestination = { library, file }
    const title = file ? file.split('/').at(-1) : library
    setError('无法打开《' + title + '》：' + String(error.message || error), 'navigation')
    return false
  }

  function retryNavigation() {
    const target = retryDestination
    return target?.file ? select(target.file) : target ? switchLib(target.library) : false
  }

  // Fetch into local variables. Only a successful, still-current request may
  // replace the editor, its metadata, the library tree and the URL.
  async function openDestination(node, request, commitTree) {
    const file = node?.file || ''
    const preview = PREVIEW_TYPES.has(node?.type)
    const query = '?path=' + encodeURIComponent(file)
    const keepCurrent = !!file && file === currentPath.value && currentLoaded.value
    const cachedDirty = rawMap.value[file] !== undefined && rawMap.value[file] !== savedMap.value[file]
    const preserveMetadata = keepCurrent && activeLibrary.value === libraryOf(file) && !!pageMetaRevision.value
    const [metadata, document] = await Promise.all([
      file && !preserveMetadata ? api('GET', '/metadata' + query) : null,
      file && !preview && !keepCurrent && !cachedDirty ? api('GET', '/doc' + query) : null
    ])
    const stillWanted = () => request === navigationRequest
    if (!stillWanted() || !(await saveBeforeNavigation(stillWanted)) || !stillWanted()) return false
    if (commitTree) commitTree()
    if (document) {
      documentReads.delete(file)
      readIdentities.value[file] = { id: document.data.id ?? node.id, workspaceId: document.data.workspaceId }
      rawMap.value[file] = document.data.content
      savedMap.value[file] = document.data.content
      revisionMap.value[file] = document.data.revision
    }
    metadataRequest++
    currentPath.value = file
    if (!preserveMetadata) {
      pageMeta.value = metadata?.data.meta || {}
      pageMetaRevision.value = metadata?.data.revision || ''
    }
    syncUrl()
    openTab(file)
    rememberDoc(file)
    clearError()
    if (preview) {
      pdfTranslate.value = { status: 'idle', progress: 0, output: '', error: '' }
      pdfView.value = 'source'
      loadPdfToc()
      checkTranslate(file)
    } else {
      pdfToc.value = []
    }
    return true
  }

  async function switchLib(name, preferred = '') {
    const request = ++navigationRequest
    pendingDestination.value = { library: name, file: preferred }
    switchingLibrary.value = true
    let treeLoaded = false
    try {
      const { data } = await api('GET', name ? '/tree?lib=' + encodeURIComponent(name) : '/tree')
      if (request !== navigationRequest) return false
      treeLoaded = true
      const library = data.lib || name
      const nodes = data.nodes || []
      const files = flatten(nodes, '', [])
      const wanted = preferred || lastDoc(library)
      const match = files.find(node => node.file === wanted)
      if (preferred && !match) {
        let resolved
        try {
          const response = await api('GET', '/resolve?path=' + encodeURIComponent(preferred))
          resolved = response.data.path
        } catch (e) {
          if (e.status !== 403 && e.status !== 404) throw e
        }
        if (request !== navigationRequest) return false
        if (resolved && resolved !== preferred) {
          remapTabs(preferred, resolved)
          return await select(resolved)
        }
        refreshTabDetails(files, library)
        return navigationFailed(name, preferred, '文档已移动或无法访问')
      }
      const destination = match || files[0]
      if (!preferred && destination) pendingDestination.value = { library, file: destination.file }
      return await openDestination(destination, request, () => {
        treeRequest++
        libEpoch.value++
        activeLibrary.value = library
        treeNodes.value = nodes
        refreshTabDetails(files, library)
        pruneCache()
      })
    } catch (e) {
      if (request !== navigationRequest) return false
      if (!treeLoaded && (e.status === 403 || e.status === 404)) forgetLibrary(name)
      return navigationFailed(name, preferred, e)
    } finally {
      if (request === navigationRequest) {
        switchingLibrary.value = false
        pendingDestination.value = null
      }
    }
  }

  let allRequest = 0
  let restoredTabs
  async function loadAll() {
    const request = ++allRequest
    // 先问清自己是谁：guest 拿到的树是服务端剪过的，前端只管别露出编辑入口
    await loadMe()
    restoredTabs ||= restoreTabs()
    loading.value = true
    clearError()
    try {
      const previous = currentPath.value
      if (!(await loadTree())) return
      if (previous && previous === currentPath.value) await loadPageMeta()
      if (request !== allRequest) return
      // 路由点名的那一篇最优先（/edit/调研/数据调研、旧只读链接 /onlyread/…）
      const routed = routedDocPath()
      const routedHit = findRoutedDocument(allFiles.value, routed)
      if (routedHit) {
        if (currentPath.value !== routedHit.file) await select(routedHit.file)
      } else if (!currentPath.value && allFiles.value.length) {
        currentPath.value = allFiles.value[0].file
      }
    } catch (e) {
      if (request === allRequest) setError(e.message || e, 'load')
    } finally {
      if (request === allRequest) loading.value = false
    }
  }

  /** 把当前这一篇写进地址栏：/edit/<路径> 或 /onlyread/<路径>（别人复制地址就能直达） */
  function syncUrl() {
    const mode = window.__readerPublicView ? 'onlyread' : 'doc'
    // PDF and HTML keep their suffix to distinguish a Markdown sibling with the same stem.
    const clean = documentRoutePath(currentPath.value)
    const path = clean ? '/' + clean.split('/').map(encodeURIComponent).join('/') : ''
    /* 部署在子路径时，写回地址栏也要带前缀，否则一跳就跑到站点根上 */
    const search = new URLSearchParams(location.search)
    if (activeLibrary.value) search.set('lib', activeLibrary.value)
    else search.delete('lib')
    const query = search.size ? '?' + search.toString() : ''
    const next = API_BASE + '/' + mode + path + query
    if (location.pathname + location.search !== next) {
      const trail = history.state?.typocketReference
      const state = trail ? { typocketReference: { index: trail.index, file: currentPath.value, id: currentSourceId.value } } : null
      history.replaceState(state, '', next + (location.pathname === API_BASE + '/' + mode + path ? location.hash : ''))
    }
  }

  async function refreshActivityDocument(file) {
    if (file !== currentPath.value || !currentLoaded.value) return true
    const request = ++navigationRequest
    switchingLibrary.value = false
    pendingDestination.value = null
    const stillWanted = () => navigationRequest === request && currentPath.value === file
    try {
      if (!(await saveBeforeNavigation(stillWanted)) || !stillWanted()) return false
      if (PREVIEW_TYPES.has(currentNode.value?.type)) { await loadPageMeta(); return stillWanted() }
      const revision = revisionMap.value[file]
      const [document] = await Promise.all([api('GET', '/doc?path=' + encodeURIComponent(file)), loadPageMeta()])
      if (!stillWanted() || !flushActiveEditor(file)) return false
      // Input or a completed save during the read takes precedence over this response.
      if (isDirty.value || saving.value || revisionMap.value[file] !== revision) {
        return await saveBeforeNavigation(stillWanted) && stillWanted()
      }
      readIdentities.value[file] = { id: document.data.id, workspaceId: document.data.workspaceId }
      adoptRevision(file, document.data, document.data.content, true)
      return true
    } catch (error) {
      if (stillWanted()) setError('无法读取最新文档：' + String(error.message || error), 'load')
      return false
    }
  }

  async function select(file) {
    if (!file) return false
    const library = libraryOf(file)
    const node = allFiles.value.find(item => item.file === file)
    if (library !== activeLibrary.value || !node) return switchLib(library, file)
    const request = ++navigationRequest
    switchingLibrary.value = false
    if (file === currentPath.value && currentLoaded.value) {
      pendingDestination.value = null
      return true
    }
    pendingDestination.value = { library, file }
    try {
      return await openDestination(node, request)
    } catch (error) {
      return request === navigationRequest && navigationFailed(library, file, error)
    } finally {
      if (request === navigationRequest) pendingDestination.value = null
    }
  }

  /** 起一个翻译任务（后台跑，回来轮询进度） */
  async function startTranslate() {
    const file = currentPath.value
    if (!file) return
    const previous = pdfTranslate.value
    pdfTranslate.value = { status: 'running', progress: 0, output: previous?.output || '', error: '' }
    try {
      const res = await fetch(API_BASE + '/api/pdf-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file })
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || '起不了翻译任务')
      if (currentPath.value !== file) return
      pdfTranslate.value = json.data
      if (json.data.error) setError(json.data.error)
      if (json.data.status === 'running') pollTranslate()
      else if (json.data.status === 'done') pdfView.value = 'translated'
    } catch (e) {
      if (currentPath.value !== file) return
      pdfTranslate.value = { status: 'failed', progress: 0, output: '', error: String(e.message || e) }
      setError('翻译失败：' + String(e.message || e))
    }
  }

  let translateTimer = null

  /** 每 1.5 秒问一次进度，翻完自动切到译文 */
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
        else if (json.data.status === 'failed') setError(json.data.error || '翻译失败')
      } catch {
        pollTranslate()
      }
    }, 1500)
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
    const file = currentPath.value
    if (!file) return
    clearError()
    const epoch = contentEpoch.value
    try {
      await Promise.all([
        loadPageMeta(),
        PREVIEW_TYPES.has(currentNode.value?.type) ? null : loadDoc(file, { force: true, preserveLocal: false })
      ])
      if (currentPath.value === file && contentEpoch.value === epoch) contentEpoch.value++
    } catch (e) {
      if (currentPath.value === file) setError(e.message || e, 'load')
    }
  }

  /* ---------- 编辑 ---------- */

  function updateContent(text) {
    if (!currentPath.value) return
    const path = currentPath.value
    rawMap.value[path] = text
    if (conflict.value?.path === path) conflict.value.local = text
    if (drafts.isTracked(draftScope.value)) checkpointDraft()
  }

  /** 丢掉当前这篇没保存的改动，退回上次保存的内容 */
  function discard() {
    if (!currentPath.value) return
    rawMap.value[currentPath.value] = savedMap.value[currentPath.value] ?? ''
    drafts.finish(draftScope.value)
  }

  /**
   * 保存。返回是否成功——调用方必须看返回值，
   * 之前这里把异常吞成 error 后正常 resolve，导致保存失败也照样切走文档。
   *
   * 只写正文。文件名叫什么、在哪个目录，全由磁盘决定，保存不碰它们。
   */
  // Fold delayed editor input into the client snapshot before replacing it.
  function flushActiveEditor(path) {
    return path !== currentPath.value || !window.dispatchEvent ||
      window.dispatchEvent(new CustomEvent('reader-flush-editor', { detail: path, cancelable: true }))
  }

  function adoptRevision(path, disk, text, automatic = false) {
    const replaceEditor = rawMap.value[path] !== text && currentPath.value === path
    savedMap.value[path] = disk.content
    revisionMap.value[path] = disk.revision
    rawMap.value[path] = text
    if (replaceEditor) {
      if (automatic) autoMergeEpoch.value = contentEpoch.value + 1
      contentEpoch.value++
    }
  }

  async function writeRevision(path, content, revision) {
    const id = path === currentPath.value ? currentSourceId.value : undefined
    const workspaceId = path === currentPath.value ? readWorkspace.value : undefined
    const result = await api('PUT', '/doc', { path, id, workspaceId, content, revision })
    saveTimes.value.set(result.data.id, result.savedAt || Date.now())
    return { content, revision: result.data.revision }
  }

  // Bound the work of one save gesture if another writer is constantly active.
  const maxRebases = 3
  let saveTask = null
  async function savePath(path) {
    if (!path) return true
    // 同一时间只允许一个写请求。等待前一次结束后重新取最新正文，
    // 避免慢请求把后发的修改覆盖回旧版本。
    while (saveTask) await saveTask
    if (conflict.value?.path === path) return false
    // 从没读到过内容就保存，等于把空内容写回磁盘，必须拦住
    if (rawMap.value[path] === undefined) {
      setError('这篇没有成功读取，拒绝保存，免得把空内容覆盖上去', 'save')
      return false
    }
    if (rawMap.value[path] === savedMap.value[path]) return true
    const task = (async () => {
      saving.value = true
      clearError()
      try {
        for (let attempt = 0; ; attempt++) {
          const content = rawMap.value[path]
          const base = savedMap.value[path]
          try {
            const disk = await writeRevision(path, content, revisionMap.value[path])
            savedMap.value[path] = disk.content
            revisionMap.value[path] = disk.revision
            return true
          } catch (error) {
            if (error.code !== 'CONFLICT') throw error
            const disk = error.details
            if (!flushActiveEditor(path)) return false
            const local = rawMap.value[path]
            const merged = mergeDocument(base, local, disk.content)
            if (merged === null) {
              if (path === currentPath.value) checkpointDraft()
              conflict.value = { path, local, remote: disk.content, revision: disk.revision }
              return false
            }
            adoptRevision(path, disk, merged, true)
            if (merged === disk.content) return true
            if (attempt >= maxRebases) throw Error('磁盘内容仍在更新，稍后可重试保存')
          }
        }
      } catch (error) {
        if (path === currentPath.value) flushActiveEditor(path)
        const protectedDraft = path === currentPath.value && checkpointDraft()
        const recoveryNote = protectedDraft ? '。未保存的修改已保留在此浏览器。' : '。请保留窗口或复制正文。'
        setError('保存失败：' + String(error.message || error) + recoveryNote, 'save')
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
    if (rawMap.value[path] !== savedMap.value[path]) return savePath(path)
    if (path === currentPath.value && drafts.finish(draftScope.value)) findDraft()
    return true
  }

  async function save() {
    if (!flushActiveEditor(currentPath.value)) return false
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
      readIdentities.value[to] = readIdentities.value[from]
      delete readIdentities.value[from]
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
    if (file === currentPath.value) drafts.finish(draftScope.value)
    delete rawMap.value[file]
    delete savedMap.value[file]
    delete revisionMap.value[file]
    delete readIdentities.value[file]
    tabIcons.value.delete(file)
    // 标签里也别留着一篇已经不存在的文档
    tabs.value = tabs.value.filter((f) => f !== file)
    saveTabs()
    await loadTree()
  }

  // A move may rebase a note's relative URLs on disk. An already open editor
  // must adopt those bytes and the new revision before the next edit.
  async function refreshMovedDocument(updated = []) {
    const file = currentPath.value
    if (updated.includes(file) && flushActiveEditor(file) && !isDirty.value) {
      await loadDoc(file, { force: true })
    }
  }

  /** 改名并保留文档标识 */
  async function renameDoc(file, name) {
    if (currentPath.value === file && rawMap.value[file] !== undefined && !(await saveBeforeNavigation())) {
      throw new Error(error.value || '保存失败，未改名')
    }
    const { data } = await api('PATCH', '/doc', { path: file, name })
    moveCache(file, data.file)
    remapTabs(file, data.file)
    if (currentPath.value === file) currentPath.value = data.file
    await loadTree()
    await refreshMovedDocument(data.updatedReferences)
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
  async function moveDoc(file, dir, undo) {
    if (currentPath.value === file && !(await saveBeforeNavigation())) {
      throw new Error(error.value || '保存失败，未移动')
    }
    const { data } = await api('PUT', '/move/doc', { file, dir, undo })
    moveCache(file, data.file)
    remapTabs(file, data.file)
    if (currentPath.value === file) currentPath.value = data.file
    if (currentPath.value === data.file && libraryOf(data.file) !== activeLibrary.value) await switchLib(libraryOf(data.file), data.file)
    else await loadTree()
    await refreshMovedDocument(data.updatedReferences)
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
  async function moveCategory(path, toParent, undo) {
    if (currentPath.value.startsWith(path + '/') && !(await saveBeforeNavigation())) {
      throw new Error(error.value || '保存失败，文件夹尚未移动')
    }
    const { data } = await api('PUT', '/move/category', { path, toParent, undo })
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
    remap(readIdentities)
    remapTabs(path, data.path)
    const movingCurrent = currentPath.value.startsWith(path + '/')
    const movedFile = movingCurrent ? data.path + currentPath.value.slice(path.length) : ''
    if (movingCurrent) currentPath.value = movedFile
    if (movingCurrent && libraryOf(currentPath.value) !== activeLibrary.value) await switchLib(libraryOf(currentPath.value), currentPath.value)
    else await loadTree()
    await refreshMovedDocument(data.updatedReferences)
    return data
  }

  async function createCategory(parent, name) {
    await api('POST', '/category', { parent, name })
    await loadTree()
  }

  async function renameCategory(path, name) {
    if (currentPath.value.startsWith(path + '/') && rawMap.value[currentPath.value] !== undefined && !(await saveBeforeNavigation())) {
      throw new Error(error.value || '保存失败，文件夹尚未重命名')
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
    remap(readIdentities)
    remapTabs(path, data.path)
    if (currentPath.value === path || currentPath.value.startsWith(path + '/')) {
      currentPath.value = data.path + currentPath.value.slice(path.length)
    }
    await loadTree()
    await refreshMovedDocument(data.updatedReferences)
  }

  async function deleteCategory(path) {
    if (saveTask) await saveTask
    await api('DELETE', '/category', { path })
    // 先让 loadTree 依据新树清理缓存，顺序反了会把还活着的也清掉
    await loadTree()
  }


  const contentEpoch=ref(0)
  const autoMergeEpoch = ref(-1)
  async function loadPageMeta() {
    const path = currentPath.value
    const request = ++metadataRequest
    if (!path) { pageMeta.value = {}; pageMetaRevision.value = ''; return }
    try {
      const { data } = await api('GET', '/metadata?path=' + encodeURIComponent(path))
      if (currentPath.value === path && request === metadataRequest) {
        pageMeta.value = data.meta
        pageMetaRevision.value = data.revision
      }
    } catch (e) {
      if (currentPath.value === path && request === metadataRequest) setError(e.message, 'load')
    }
  }
  async function savePageMeta(patch) {
    const path=currentPath.value
    let result;try{result=await api('PUT','/metadata',{path,revision:pageMetaRevision.value,meta:patch})}catch(e){if(e.code==='CONFLICT')await loadPageMeta();throw e}
    const {data}=result
    if(currentPath.value===path){metadataRequest++;pageMeta.value=data.meta;pageMetaRevision.value=data.revision}
    if (tabs.value.includes(path)) tabIcons.value.set(path, data.meta?.icon || '')
    const update=list=>{for(const node of list){if(node.file===path)node.meta=data.meta;if(node.children)update(node.children)}};update(treeNodes.value)
    return data
  }
  async function saveConflictMerge(c, merged, mergeBase) {
    const path = c.path
    let local = rawMap.value[path]
    if (typeof merged !== 'string') throw Error('缺少合并结果')
    const draft = mergeDocument(mergeBase ?? local, merged, local)
    c.draftBase = local
    if (draft === null) throw Error('你的修改有更新，请对照左侧内容再保存合并结果')
    c.draft = draft
    for (let attempt = 0; ; attempt++) {
      let disk
      try {
        disk = await writeRevision(path, c.draft, c.revision)
      } catch (error) {
        if (error.code !== 'CONFLICT') throw error
        const latest = error.details
        const rebased = mergeDocument(c.remote, c.draft, latest.content)
        c.remote = latest.content
        c.revision = latest.revision
        if (rebased === null) throw Error('磁盘上的同一处又有修改，请对照后保存')
        c.draft = rebased
        if (rebased !== latest.content) {
          if (attempt >= maxRebases) throw Error('磁盘内容仍在更新，稍后可重试保存')
          continue
        }
        disk = latest
      }
      c.remote = savedMap.value[path] = disk.content
      c.revision = revisionMap.value[path] = disk.revision
      if (!flushActiveEditor(path)) throw Error('请先完成当前输入')
      const latestLocal = rawMap.value[path]
      const combined = mergeDocument(local, latestLocal, disk.content)
      c.draftBase = latestLocal
      if (combined === null) throw Error('你的修改有更新，请对照左侧内容再保存合并结果')
      if (combined !== disk.content) {
        c.draft = combined
        local = latestLocal
        if (attempt >= maxRebases) throw Error('你的修改仍在更新，稍后可重试保存')
        continue
      }
      adoptRevision(path, disk, disk.content)
      drafts.finish(draftScope.value)
      findDraft()
      conflict.value = null
      clearError()
      return
    }
  }

  async function resolveConflict(mode, merged, mergeBase) {
    if (!['copy', 'merge', 'remote'].includes(mode)) throw Error('未知冲突处理方式')
    const c = conflict.value
    if (!c || c.resolving) return
    c.resolving = true
    try {
      const path = c.path
      if (!flushActiveEditor(path)) throw Error('请先完成当前输入')
      if (mode === 'merge') {
        await saveConflictMerge(c, merged, mergeBase)
        return
      }
      const local = rawMap.value[path]
      if (mode === 'copy') {
        // Reuse the same request id when retrying an acknowledged or lost copy.
        if (!c.copy || c.copy.content !== local) c.copy = { content: local, requestId: crypto.randomUUID() }
        const parts = path.split('/')
        const name = parts.pop().replace(/\.md$/i, '') + '（冲突副本）'
        await api('POST', '/doc', { dir: parts.join('/'), name, workspaceId: readWorkspace.value, ...c.copy })
      }
      const { data } = await api('GET', '/doc?path=' + encodeURIComponent(path))
      if (conflict.value !== c) return
      checkReadIdentity(data)
      if (!flushActiveEditor(path) || rawMap.value[path] !== local) throw Error('你的修改有更新，请确认最新内容')
      adoptRevision(path, data, data.content)
      drafts.finish(draftScope.value)
      findDraft()
      conflict.value = null
      clearError()
      if (mode === 'copy') await loadTree()
    } finally {
      c.resolving = false
    }
  }
  async function renameLibrary(from,to) {
    if (!(await saveBeforeNavigation())) throw new Error(error.value || '请先完成当前输入')
    const result=await api('PUT','/lib/name',{from,to,requestId:crypto.randomUUID()})
    const previous=currentPath.value
    const wasActive = activeLibrary.value === from
    const convert=v=>v===from||v.startsWith(from+'/')?to+v.slice(from.length):v
    for(const map of [rawMap,savedMap,revisionMap,readIdentities])map.value=Object.fromEntries(Object.entries(map.value).map(([k,v])=>[convert(k),v]))
    remapTabs(from, to);currentPath.value=convert(previous)
    if (wasActive) activeLibrary.value = to
    saveTabs();rememberDoc(currentPath.value);syncUrl();libEpoch.value++
    await loadTree();await loadPageMeta()
    await refreshMovedDocument(result.data.updatedReferences)
    return result.data
  }

  return {
    contentEpoch,autoMergeEpoch,pageMeta,pageMetaRevision,loadPageMeta,savePageMeta,conflict,resolveConflict,renameLibrary,
    legacyLib,
    libEpoch,
    activeLibrary, switchingLibrary, pendingDestination, retryNavigation, tabIcons, forgetLibrary,
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
    errorKind,
    setError,
    clearError,
    tabs,
    openTab,
    closeTab,
    reorderTabs,
    allFiles,
    allDocs,
    currentNode,
    currentDoc,
    currentMeta,
    currentSourceId,
    currentRaw,
    currentHtml,
    currentToc,
    isDirty,
    currentLoaded,
    loadTree,
    loadDoc,
    loadAll,
    select,
    reload,
    updateContent,
    discard,
    save,
    saveBeforeNavigation, prepareToLeave, recovery, recoverDraft, discardRecoveredDraft, refreshDraftNotice,
    refreshActivityDocument,
    createDoc,
    deleteDoc,
    renameDoc,
    createCategory,
    renameCategory,
    deleteCategory,
    role, restoredCopy, pdfTranslationAvailable, resolveRecentDocs,
    isGuest, currentReadonly, canEdit,
    syncUrl
  }
})
