import {readPdfOutline} from './services/pdf-outline.js'
import { backupService } from './services/backups.js'
import { trashService } from './services/trash.js'
/**
 * 本地内容读写接口。
 *
 * ★ 磁盘是文档树的唯一真源：目录 = 分类，.md 文件 = 文档，文件名 = 文档名。
 *   SQLite 保存稳定标识、权限、页面元数据及恢复记录。外部改名必须确认迁移，避免权限丢失。
 *
 * 正文里的一级标题只是正文内容，不参与命名。历史上一版把它当成了名字的真源：
 * 保存时"正文一级标题 → 侧栏名"单向同步，而改名接口又不动正文，
 * 于是改完名一保存就被弹回去。现在名字只有一个来源（文件名），这类问题不会再出现。
 *
 * 文件操作必须限制在 DOCS_ROOT 内，且不能穿过目录中的符号链接。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID as cryptoId } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createShare, roleOf, EDIT_PASSWORD } from './share.js'
import { workspace, digest, fault } from './storage/workspace.js'
import { resources } from './services/resources.js'
import { publicSession } from './services/public-session.js'
import { documentRoutes } from './services/documents.js'
import { recordSource } from './services/sources.js'

// 用文件自身位置推导，不依赖启动时的工作目录
const READER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/*
 * 内容根。默认是 reader 的上一级（本地开发与主站都是这样）。
 *
 * DOCS_ROOT 环境变量可以指到别处 —— 用于跑第二个实例：一个独立的示例知识库，
 * 内容只有演示文档，与真实资料在文件系统上就隔开（不是靠分享开关过滤，
 * 而是那些文件根本不在它的根目录里）。
 */
const DOCS_ROOT = process.env.DOCS_ROOT
  ? path.resolve(process.env.DOCS_ROOT)
  : path.resolve(READER_ROOT, '../知识库')
/** 分享状态（谁能看到什么）：只有两种身份，见 server/share.js */
const repo = workspace(DOCS_ROOT)
const assets = resources(repo)
const share = createShare(DOCS_ROOT)
const publicSharing = publicSession(repo, share)
function previewSourceState(reference, updated) {
  if (!path.isAbsolute(reference)) return 'unknown'
  try { const stat = fs.statSync(reference); return !stat.isFile() ? 'missing' : stat.mtimeMs > updated + 1000 ? 'changed' : 'present' }
  catch { return 'missing' }
}

const TRASH = '.回收站'
/** 译文放这里（点号开头，不进文档树）；只有读文件时放行，写/删一律不放 */
const TRANSLATE_DIR = '.翻译'
/** 这些目录永远不进文档树 */
const SKIP_DIRS = new Set(['node_modules'])
/** 扫描护栏：目录太深或文件太多就截断，免得误指到巨型目录把页面拖死 */
const MAX_DEPTH = 8
const MAX_NODES = 5000

/* ---------- 路径安全 ---------- */

/** 把相对路径解析成绝对路径，并确保没跑出文档根目录。 */
function safeResolve(rel) {
  if (typeof rel !== 'string') throw new Error('路径为空')
  const abs = path.resolve(DOCS_ROOT, rel)
  const rootWithSep = DOCS_ROOT.endsWith(path.sep) ? DOCS_ROOT : DOCS_ROOT + path.sep
  if (abs !== DOCS_ROOT && !abs.startsWith(rootWithSep)) {
    throw new Error('路径越界: ' + rel)
  }
  // 扫描树会跳过符号链接；接口也必须拒绝。只做字符串前缀检查时，
  // 知识库里的 link/secret.md 仍可经由磁盘链接读写到根目录之外。
  let cursor = DOCS_ROOT
  for (const part of path.relative(DOCS_ROOT, abs).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part)
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('符号链接不归阅读器管: ' + rel)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return abs
}

/** 打开本机文件管理器：即使持有管理会话，也不能从公网触发。 */
function localFileManagerRequest(req) {
  const address = req.socket?.remoteAddress
  const headers = req.headers || {}
  return ['darwin', 'win32', 'linux'].includes(process.platform)
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
    && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(headers.host || '')
    && headers['sec-fetch-site'] !== 'cross-site'
    && !Object.keys(headers).some(key => key === 'forwarded' || key.startsWith('x-forwarded-'))
}

function revealInFileManager(abs, directory) {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'darwin' ? '/usr/bin/open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open'
    const args = process.platform === 'darwin' ? directory ? [abs] : ['-R', abs]
      : process.platform === 'win32' ? directory ? [abs] : ['/select,', abs]
        : [directory ? abs : path.dirname(abs)]
    const child = spawn(command, args, { stdio: 'ignore' })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('文件管理器无法打开此位置')))
  })
}

// Persist portable knowledge-base keys, never native Windows separators.
function relativeKey(abs) { return path.relative(DOCS_ROOT, abs).split(path.sep).join('/') }

function relJoin(dir, name) {
  return dir ? dir + '/' + name : name
}

/** 文件名里不能出现的字符，直接剔掉。 */
function safeName(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|#%]/g, '')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 隐藏目录（.回收站、.git）和 node_modules 不归阅读器管。 */
function assertVisible(rel, { allowTranslate = false, allowAsset = false, allowStorage = false } = {}) {
  const segs = String(rel || '').split('/').filter(Boolean)
  const bad = segs.some((x) => x.startsWith('.') && !(allowTranslate && x === TRANSLATE_DIR) && !(allowAsset && x === '.配图') && !(allowStorage && x === '.reader'))
  if (bad) throw new Error('隐藏目录不归阅读器管: ' + rel)
  if (segs.includes('node_modules')) throw new Error('node_modules 不归阅读器管: ' + rel)
}

function inReader(abs) {
  return abs === READER_ROOT || abs.startsWith(READER_ROOT + path.sep)
}

/** 只允许操作 DOCS_ROOT 里的 md / pdf，且不能是阅读器自己那套文件。 */
function assertFile(rel, opts) {
  assertVisible(rel, opts)
  const abs = safeResolve(rel)
  /* 图片也放行：文档里插图要用 /api/file 取，否则 <img> 打不开 */
  if (!/\.(md|pdf|html?|png|jpe?g|webp|gif|svg|avif)$/i.test(abs)) throw new Error('只能操作 md、pdf、h5 或图片: ' + rel)
  if (inReader(abs)) throw new Error('这是阅读器自己的文件，不在文档树里: ' + rel)
  return abs
}

/** 只认 markdown：正文读写、列宽这些只对 md 有意义 */
function assertMd(rel) {
  const abs = assertFile(rel)
  if (!/\.md$/i.test(abs)) throw new Error('这不是 markdown 文件，不能当正文处理: ' + rel)
  return abs
}

/** 目录参数：空串表示根目录。 */
function assertDir(rel) {
  const dir = String(rel == null ? '' : rel).replace(/^\/+|\/+$/g, '')
  if (!dir) return ''
  assertVisible(dir)
  if (inReader(safeResolve(dir))) throw new Error('这是阅读器自己的目录: ' + dir)
  return dir
}

/* ---------- 扫盘 ---------- */

let scanned = 0

/**
 * 扫一个目录，返回子节点数组：文档在前、目录在后，各自按名字排。
 * 跳过隐藏项、软链、node_modules 和阅读器自己那套：树是给人看的，不是磁盘镜像。
 */
function scanDir(abs, rel, depth, order) {
  let entries = []
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true })
  } catch {
    return []
  }
  const docs = []
  const folders = []
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    if (e.isSymbolicLink()) continue
    if (scanned >= MAX_NODES || depth >= MAX_DEPTH) break
    const childAbs = path.join(abs, e.name)
    const childRel = relJoin(rel, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || childAbs === READER_ROOT) continue
      scanned++
      folders.push({ ...repo.node(childRel, 'folder'), type: 'folder', name: e.name, path: childRel, children: scanDir(childAbs, childRel, depth + 1, order) })
      /*
       * 树里认三种文件：markdown、pdf、h5（html/htm）。
       * h5 与 pdf 一样是「成品文件」——阅读器不解析它，交给浏览器整页渲染。
       */
    } else if (e.isFile() && /\.(md|pdf|html?)$/i.test(e.name)) {
      let mtime = 0
      let size = 0
      try {
        const st = fs.statSync(childAbs)
        mtime = st.mtimeMs
        size = st.size
      } catch {
        /* 读不到 stat 就当时长为 0，不影响列表 */
      }
      scanned++
      const isPdf = /\.pdf$/i.test(e.name)
      docs.push({
        ...repo.node(childRel, isPdf ? 'pdf' : /\.html?$/i.test(e.name) ? 'h5' : 'doc'),
        type: isPdf ? 'pdf' : (/\.html?$/i.test(e.name) ? 'h5' : 'doc'),
        name: e.name.replace(/\.(md|pdf|html?)$/i, ''),
        file: childRel,
        mtime,
        size
      })
    }
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
  /*
   * 整层一起排：拖过的按拖的顺序（文档和目录都能拖），没登记过的按老规矩 ——
   * 文档在前、目录在后，各自按名字。用 indexOf 找位置，顺序文件里多出来的名字不会把别的顶掉。
   */
  const wanted = (order && order[rel]) || []
  const rank = (n) => {
    const i = wanted.indexOf(entryKey(n))
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const fallback = (a, b) => (a.type === b.type ? byName(a, b) : a.type === 'folder' ? 1 : -1)
  return [...docs, ...folders].sort((a, b) => rank(a) - rank(b) || fallback(a, b))
}

/* ---------- 目录顺序 ---------- */

/**
 * 目录顺序的旁路文件。
 *
 * 磁盘上目录没有"顺序"这个概念，扫出来只能按名字排。用户拖过之后把顺序记在这里：
 * `{ "": ["调研", "面试"], "存档": ["04-调研原始报告", "05-论文与文献"] }`
 * 键是父目录（空串是根），值是这个层级里目录名的顺序。
 *
 * 它**只影响显示顺序**：不存在的条目直接忽略，没登记的目录按名字排在后面。
 * 所以这个文件丢了、坏了、跟磁盘对不上，最多是顺序回到按名字 —— 不会丢东西。
 * 用点号开头，扫盘时本来就会跳过。
 */
const ORDER_FILE = path.join(DOCS_ROOT, '.顺序.json')

function readOrder() { return repo.getJSON('order', { order: {} }, '.顺序.json').order || {} }
function writeOrder(order) {
  repo.setJSON('order', { order })
}

/**
 * 目录被挪走之后，顺序文件里的键（父目录路径）还指着老路径，一起改到新路径上，
 * 用户拖好的顺序才不会白丢。
 */
function remapOrderUnder(fromRel, toRel) {
  const order = readOrder()
  const next = {}
  let changed = false
  for (const [parent, names] of Object.entries(order)) {
    const key = parent === fromRel || parent.startsWith(fromRel + '/') ? toRel + parent.slice(fromRel.length) : parent
    if (key !== parent) changed = true
    next[key] = names
  }
  if (changed) writeOrder(next)
}

/**
 * 目录改名或删除之后，把顺序文件里跟它对不上的记录清掉。
 *
 * 顺序文件里的名字对不上磁盘时本来就会被忽略（退回按名字排），所以清不清都不会出错；
 * 清掉只是免得攒一堆没用的条目。代价是那一层要重新拖一次 —— 改名本来就少见。
 */
function dropOrderFor(rel) {
  const order = readOrder()
  const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
  const name = path.posix.basename(rel)
  let changed = false
  // 它自己那一层的顺序（改名后路径变了，键留不住）
  if (order[rel] !== undefined) {
    delete order[rel]
    changed = true
  }
  // 父层里把它这个名字摘掉，但**别把父层整条记录删了** —— 那一层别的条目拖过的顺序还要留着
  const list = order[parent]
  if (list) {
    const next = list.filter((n) => n !== name)
    if (next.length) order[parent] = next
    else delete order[parent]
    changed = true
  }
  if (changed) writeOrder(order)
}

/** 只把某个名字从某一层的顺序记录里摘掉（挪走、改名之后用） */
function removeFromOrder(parent, name) {
  const order = readOrder()
  const list = order[parent]
  if (!list || !list.includes(name)) return
  const next = list.filter((n) => n !== name)
  if (next.length) order[parent] = next
  else delete order[parent]
  writeOrder(order)
}

/* ---------- 表格列宽 ---------- */

/**
 * 列宽的旁路文件，跟文档同级。
 *
 * 用点号开头，跟 .回收站 一样不会出现在文档树里（扫盘时隐藏项直接跳过）。
 * 一个文件装全部文档的列宽，键是文档相对路径，省得为「附录/术语表.md」这种路径造目录。
 */
const COLW_FILE = path.join(DOCS_ROOT, '.表宽.json')
const FOLDABLE_FILE = path.join(DOCS_ROOT, '.折叠标题.json')

function readFoldables() { return repo.getJSON('foldables', {}, '.折叠标题.json') }
function writeFoldables(data) {
  repo.setJSON('foldables', data)
}

function remapFoldables(from, to, descendants = false) {
  const data = readFoldables()
  let changed = false
  for (const key of Object.keys(data)) {
    if (key !== from && !(descendants && key.startsWith(from + '/'))) continue
    data[to + key.slice(from.length)] = data[key]
    delete data[key]
    changed = true
  }
  if (changed) writeFoldables(data)
}

function dropFoldables(path, descendants = false) {
  const data = readFoldables()
  let changed = false
  for (const key of Object.keys(data)) {
    if (key !== path && !(descendants && key.startsWith(path + '/'))) continue
    delete data[key]
    changed = true
  }
  if (changed) writeFoldables(data)
}

function readColWidths() { return repo.getJSON('columns', {}, '.表宽.json') }
function writeColWidths(data) {
  repo.setJSON('columns', data)
}

/** 改名或换目录之后，把列宽记录搬到新键上，不然用户拖好的列宽会白丢。 */
function moveColWidths(from, to) {
  if (from === to) return
  const all = readColWidths()
  if (!(from in all)) return
  all[to] = all[from]
  delete all[from]
  writeColWidths(all)
}

function dropColWidthsUnder(prefix) {
  const all = readColWidths()
  const keep = {}
  let dropped = false
  for (const [k, v] of Object.entries(all)) {
    if (k === prefix || k.startsWith(prefix)) dropped = true
    else keep[k] = v
  }
  if (dropped) writeColWidths(keep)
}

function remapColWidthsUnder(fromPrefix, toPrefix) {
  const all = readColWidths()
  const next = {}
  let changed = false
  for (const [k, v] of Object.entries(all)) {
    if (k === fromPrefix || k.startsWith(fromPrefix)) {
      next[toPrefix + k.slice(fromPrefix.length)] = v
      changed = true
    } else {
      next[k] = v
    }
  }
  if (changed) writeColWidths(next)
}

/* ---------- pdf 目录 ---------- */

/** pdf 自带的书签目录。pdfjs 第一次用到才加载，结果按（路径 + 修改时间）缓存。 */
const pdfTocCache = new Map()
let pdfjsReady = null

/** 章节标题的常见写法：带编号的，或者这些固定词 */

/**
 * 顺序文件里用的名字：目录就是目录名，文档用带扩展名的文件名。
 * （节点上的 name 是去掉扩展名的，不能拿来当键 —— 「术语表.md」和叫「术语表」的目录会撞。）
 */
function entryKey(node) {
  return node.type === 'folder' ? node.name : path.posix.basename(node.file)
}

/** 把一页的文字按 y 归成行 */

async function readPdfToc(rel) {
  const abs = assertFile(rel)
  if (!/\.pdf$/i.test(abs)) throw new Error('不是 pdf 文件: ' + rel)
  const st = fs.statSync(abs)
  const hit = pdfTocCache.get(rel)
  if (hit && hit.mtime === st.mtimeMs) return { toc: hit.toc, source: hit.source, pages: hit.pages, error: hit.error }

  if (!pdfjsReady) pdfjsReady = import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdfjs = await pdfjsReady
  // destroy 挂在 loadingTask 上，不在 document 上
  const task = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(abs)),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true
  })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    // pdf 本身有问题（最常见的是没下完，文件缺 %%EOF）：给一句人话，别把英文栈丢到界面上
    const raw = String((e && e.message) || e)
    const msg = /Invalid PDF structure|Missing PDF|Unexpected end|corrupt/i.test(raw)
      ? '这个 pdf 打不开：文件不完整（多半是没下完），重新下载一次再试'
      : '这个 pdf 的目录读不出来：' + raw
    await task.destroy().catch(() => {})
    pdfTocCache.set(rel, { mtime: st.mtimeMs, toc: [], source: '', pages: 0, error: msg })
    return { toc: [], source: '', pages: 0, error: msg }
  }

  const {toc:finalToc, source} = await readPdfOutline(doc)
  await task.destroy()
  pdfTocCache.set(rel, { mtime: st.mtimeMs, toc: finalToc, source, pages: doc.numPages })
  return { toc: finalToc, source, pages: doc.numPages }
}

/* ---------- 删除保护 ---------- */

/**
 * 删除一律走这里：不真删，挪进 .回收站 并加时间戳。
 * 文件和目录都能丢进来，误删了还能自己捞回来，不至于把面试资料搞丢。
 */
const backups = backupService(repo)
const trash = trashService(repo, { safeResolve, assets, share, registry: readRegistry, saveRegistry: writeRegistry })
function moveToTrash(rel) { return trash.move(rel) }

/** 同一目录下不覆盖已有文件，重名就加序号。ext 默认 .md，pdf 要原样带上自己的扩展名。 */
function uniqueFile(dir, name, ext = '.md') {
  let rel = relJoin(dir, name + ext)
  let i = 2
  while (fs.existsSync(safeResolve(rel))) {
    rel = relJoin(dir, name + ' ' + i + ext)
    i++
  }
  return rel
}

/** 复制文档时给新文档重新登记图片，避免副本继续依赖原文档的资源归属。 */
function copyDocument(from, to) {
  const ext = path.extname(from).toLowerCase()
  if (!['.md', '.pdf', '.html', '.htm'].includes(ext)) throw fault('UNSUPPORTED_FILE', '只支持复制文档、PDF 或 HTML')
  const bytes = fs.readFileSync(assertFile(from))
  if (bytes.length > 40 * 1024 * 1024) throw fault('FILE_TOO_LARGE', '单个文件超过 40 MB，暂不能复制')
  repo.write(safeResolve(to), bytes)
  const source = repo.node(from)
  const target = repo.node(to, ext === '.md' ? 'doc' : ext === '.pdf' ? 'pdf' : 'h5')
  const cloneImage = asset => {
    const mime = asset.mime || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[path.extname(asset.path).slice(1).toLowerCase()])
    if (!mime) throw fault('INVALID_IMAGE', '图片格式无法识别，复制已取消')
    return assets.upload(to, mime, fs.readFileSync(safeResolve(asset.path)).toString('base64'))
  }
  if (ext === '.md') {
    assets.legacy(from)
    let content = bytes.toString('utf8')
    for (const id of new Set([...content.matchAll(/\/api\/file\?asset=([a-f0-9]{64})/g)].map(match => match[1]))) {
      const asset = assets.find('', id)
      if (!asset || asset.owner !== source.id) continue
      content = content.replaceAll('/api/file?asset=' + id, cloneImage(asset).url)
    }
    for (const reference of new Set([...content.matchAll(/\/api\/file\?[^\s)"'<>]+/g)].map(match => match[0]))) {
      let asset
      try { asset = assets.find(new URL(reference, 'http://reader.local').searchParams.get('path') || '') } catch {}
      if (asset?.owner === source.id) content = content.replaceAll(reference, cloneImage(asset).url)
    }
    if (content !== bytes.toString('utf8')) repo.write(safeResolve(to), content)
  }
  const meta = structuredClone(source.meta || {})
  if (meta.cover?.type === 'image') {
    const cover = assets.find('', meta.cover.asset)
    if (!cover || cover.owner !== source.id) throw fault('INVALID_IMAGE', '封面资源缺失，复制已取消')
    meta.cover.asset = cloneImage(cover).id
  }
  repo.db.prepare('UPDATE nodes SET meta=? WHERE id=?').run(JSON.stringify(meta), target.id)
  const foldables = readFoldables()
  if (foldables[from]) { foldables[to] = structuredClone(foldables[from]); writeFoldables(foldables) }
  const columns = readColWidths()
  if (columns[from]) { columns[to] = structuredClone(columns[from]); writeColWidths(columns) }
  recordSource(repo, target.id, { kind: 'import', workspace: '', reference: from, note: '阅读器内复制' })
  share.setShared(to, false)
  return target
}

function copyFolder(from, to) {
  let count = 0, total = 0
  const entries = []
  const inspect = (source, target, depth) => {
    if (depth > MAX_DEPTH) throw fault('TOO_DEEP', '目录层级过深，复制已取消')
    for (const entry of fs.readdirSync(safeResolve(source), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw fault('SYMLINK', '目录包含符号链接，复制已取消')
      if (entry.name.startsWith('.') && entry.name !== '.配图') continue
      const a = relJoin(source, entry.name), b = relJoin(target, entry.name)
      if (entry.isDirectory()) { entries.push({ from: a, to: b, folder: true }); inspect(a, b, depth + 1) }
      else if (entry.isFile()) {
        const size = fs.statSync(safeResolve(a)).size
        total += size
        if (++count > 300 || total > 100 * 1024 * 1024) throw fault('COPY_TOO_LARGE', '目录超过 300 个文件或 100 MB，复制已取消')
        entries.push({ from: a, to: b, folder: false })
      }
    }
  }
  inspect(from, to, 0)
  repo.mkdir(safeResolve(to)); repo.node(to, 'folder'); share.setShared(to, false)
  const folderMeta = repo.node(from, 'folder')?.meta || {}
  repo.db.prepare('UPDATE nodes SET meta=? WHERE path=?').run(JSON.stringify(folderMeta), to)
  for (const item of entries) {
    if (item.folder) {
      repo.mkdir(safeResolve(item.to)); repo.node(item.to, 'folder')
      repo.db.prepare('UPDATE nodes SET meta=? WHERE path=?').run(JSON.stringify(repo.node(item.from, 'folder')?.meta || {}), item.to)
    }
    else if (/\.(md|pdf|html?)$/i.test(item.from)) copyDocument(item.from, item.to)
    else repo.write(safeResolve(item.to), fs.readFileSync(safeResolve(item.from)))
  }
  const order = readOrder()
  for (const [key, value] of Object.entries(order)) if (key === from || key.startsWith(from + '/')) order[to + key.slice(from.length)] = [...value]
  writeOrder(order)
  return { files: count }
}

/* ---------- 请求体 ---------- */

function readBody(req, maxSize = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > maxSize) { reject(new Error('请求内容过大')); return }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {})
      } catch (e) {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function send(res, code, data) {
  const body = JSON.stringify(data)
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

const MIME = {
  '.pdf': 'application/pdf',
  /* h5 要按网页发出去，否则浏览器拿到 application/octet-stream 只会下载，不渲染 */
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

/** 原样把库里的文件发给浏览器。支持 Range，pdf 才能翻页、跳页。 */
function sendFile(req, res, rel, opts) {
  const abs = assertFile(rel, opts)
  if (!fs.existsSync(abs)) return send(res, 404, { ok: false, error: '文件不存在: ' + rel })
  const st = fs.statSync(abs)
  const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream'
  const range = req.headers.range
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    if (m) {
      const start = m[1] ? Number(m[1]) : 0
      const end = m[2] ? Number(m[2]) : st.size - 1
      if (start > end || start >= st.size) {
        res.statusCode = 416
        res.setHeader('Content-Range', 'bytes */' + st.size)
        return res.end()
      }
      res.statusCode = 206
      res.setHeader('Content-Range', 'bytes ' + start + '-' + Math.min(end, st.size - 1) + '/' + st.size)
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Content-Length', Math.min(end, st.size - 1) - start + 1)
      res.setHeader('Content-Type', type)
      res.setHeader('Cache-Control', 'no-store')
      return fs.createReadStream(abs, { start, end: Math.min(end, st.size - 1) }).pipe(res)
    }
  }
  res.statusCode = 200
  res.setHeader('Content-Type', type)
  res.setHeader('Content-Length', st.size)
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Disposition', 'inline; filename=' + encodeURIComponent(path.basename(abs)))
  fs.createReadStream(abs).pipe(res)
}

/* ---------- pdf 翻译 ---------- */

/** 任务表：源文件相对路径 -> 任务状态。翻译要几分钟，所以是后台任务 + 前端轮询。 */
const translateJobs = new Map()

/** GET /build 的缓存：3 秒内不重复扫盘 */
const buildStamp = { at: 0, mtime: 0 }

/** pdf2zh 装在用户目录（uv tool install 的默认位置） */
function pdf2zhBin() {
  const p = path.join(os.homedir(), '.local/bin/pdf2zh')
  return fs.existsSync(p) ? p : null
}

/** 译文放「源文件同级的 .翻译/」里：跟着原文档走，删文档时一起删，点号开头也不进文档树 */
function translatedRel(rel) {
  const dir = path.dirname(rel)
  const name = path.basename(rel, '.pdf') + '-dual.pdf'
  return dir === '.' ? TRANSLATE_DIR + '/' + name : dir + '/' + TRANSLATE_DIR + '/' + name
}

/** 磁盘上已经有一份比原文新的译文吗？有就返回它的相对路径 */
function existingTranslation(rel) {
  try {
    const src = fs.statSync(assertFile(rel))
    const outRel = translatedRel(rel)
    const outAbs = path.resolve(DOCS_ROOT, outRel)
    if (!fs.existsSync(outAbs)) return null
    const out = fs.statSync(outAbs)
    // 译文比原文旧，说明原文改过了，得重翻
    if (out.mtimeMs <= src.mtimeMs) return null
    return { output: outRel, at: out.mtimeMs }
  } catch {
    return null
  }
}

/**
 * 给前端的快照：不带子进程、不带整段日志。
 *
 * **状态以磁盘为准**：内存表只是"当前正在跑的任务"，服务一重启就没了。
 * 所以内存里查不到时，回过头看磁盘上有没有现成译文 —— 否则重启之后界面会退回"没翻过"，
 * 用户看到的就是「等了很久也转不出来」（其实早就翻好了）。
 */
function jobStatus(rel) {
  const rec = translateJobs.get(rel)
  if (rec && rec.status === 'running') return jobInfo(rec)
  const done = existingTranslation(rel)
  if (done) {
    clearLock(rel)
    return { status: 'done', progress: 100, startedAt: done.at, output: done.output, error: '' }
  }
  // 内存里没有：看锁 —— 服务重启过但子进程还活着的情况
  const lock = readLock(rel)
  if (lock && pidAlive(lock.pid)) {
    return { status: 'running', progress: lock.progress || 0, startedAt: lock.startedAt || Date.now(), output: '', error: '' }
  }
  if (lock) {
    clearLock(rel)
    return {
      status: 'failed', progress: 0, startedAt: lock.startedAt || Date.now(), output: '',
      error: '上次翻译中断了（进程已经不在）。再点一次就会重来；日志在 .翻译/ 里同名的 .log'
    }
  }
  if (rec) return jobInfo(rec)
  return { status: 'idle', progress: 0, output: '', error: '' }
}

/**
 * 任务锁。翻译是**独立子进程**，服务重启不会把它带走 —— 所以进度和"在不在跑"不能只记在内存里：
 * 内存丢了（重启）、子进程还活着的情况下，界面得知道它还在跑、跑到哪了，也不能再起一个重复的。
 */
function lockPath(rel) {
  return path.resolve(DOCS_ROOT, translatedRel(rel).replace(/-dual\.pdf$/i, '.running.json'))
}
function logPath(rel) {
  return path.resolve(DOCS_ROOT, translatedRel(rel).replace(/-dual\.pdf$/i, '.log'))
}
function readLock(rel) {
  try {
    return JSON.parse(fs.readFileSync(lockPath(rel), 'utf8'))
  } catch {
    return null
  }
}
function writeLock(rel, data) {
  try {
    fs.writeFileSync(lockPath(rel), JSON.stringify(data), 'utf8')
  } catch {
    /* 写不进去也不影响翻译本身 */
  }
}
function clearLock(rel) {
  try {
    fs.unlinkSync(lockPath(rel))
  } catch {
    /* 已经不在了就算了 */
  }
}
function pidAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e && e.code === 'EPERM'
  }
}

/** 给前端的快照：不带子进程、不带整段日志 */
function jobInfo(rec) {
  if (!rec) return { status: 'idle', progress: 0, output: '', error: '' }
  return { status: rec.status, progress: rec.progress, startedAt: rec.startedAt, output: rec.output, error: rec.error }
}

/**
 * 起一个翻译任务。
 *
 * PDFMathTranslate（pdf2zh）+ Bing 免费引擎：产出「双语对照 PDF」，每页原文下面接译文，
 * 公式、图表、版式都保留。一篇 20 页论文约 5 分钟，所以不能同步做。
 *
 * 已经翻过、而且译文比原文新，就直接算完成 —— 没改过的原文没必要重翻。
 */
function startTranslate(rel) {
  const abs = assertFile(rel)
  if (!/\.pdf$/i.test(abs)) throw new Error('只有 pdf 能翻译')
  const outRel = translatedRel(rel)
  const outAbs = path.resolve(DOCS_ROOT, outRel)

  const running = translateJobs.get(rel)
  if (running && running.status === 'running') return running
  // 服务重启过、内存没记录，但子进程还在跑：不能再来一个
  const lock = readLock(rel)
  if (lock && pidAlive(lock.pid)) {
    return { status: 'running', progress: lock.progress || 0, startedAt: lock.startedAt || Date.now(), output: '', error: '' }
  }
  const already = existingTranslation(rel)
  if (already) {
    const done = { status: 'done', progress: 100, startedAt: already.at, output: already.output, error: '' }
    translateJobs.set(rel, done)
    return done
  }

  const bin = pdf2zhBin()
  if (!bin) {
    const rec = {
      status: 'failed', progress: 0, startedAt: Date.now(), output: '', error:
        '没装 pdf2zh。一条命令装好：uv tool install pdf2zh --python 3.12 --with "tencentcloud-sdk-python-tmt<3.1.0"'
    }
    translateJobs.set(rel, rec)
    return rec
  }

  fs.mkdirSync(path.dirname(outAbs), { recursive: true })
  const rec = { status: 'running', progress: 0, startedAt: Date.now(), output: '', error: '', log: '' }
  translateJobs.set(rel, rec)
  const child = spawn(bin, [abs, '-s', 'bing', '-li', 'en', '-lo', 'zh', '-o', path.dirname(outAbs)], {
    env: { ...process.env, HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com' }
  })
  // 锁：进程号 + 进度 + 整个日志。服务重启后靠它认"还在跑"，也靠它认"上次断了"
  writeLock(rel, { pid: child.pid, startedAt: rec.startedAt, progress: 0 })
  let logStream = null
  try {
    logStream = fs.createWriteStream(logPath(rel), { flags: 'w' })
  } catch {
    logStream = null
  }
  // pdf2zh 的进度条是 tqdm 往 stderr 刷的，从里面抠出 n/m 当进度
  const eat = (buf) => {
    const text = String(buf)
    rec.log = (rec.log + text).slice(-4000)
    try {
      logStream && logStream.write(text)
    } catch {
      /* 日志写不进去不影响翻译 */
    }
    const hits = [...text.matchAll(/(\d+)\s*\/\s*(\d+)/g)]
    const last = hits[hits.length - 1]
    if (last && Number(last[2]) > 0) {
      rec.progress = Math.min(99, Math.round((Number(last[1]) / Number(last[2])) * 100))
      writeLock(rel, { pid: child.pid, startedAt: rec.startedAt, progress: rec.progress })
    }
  }
  child.stdout.on('data', eat)
  child.stderr.on('data', eat)
  child.on('error', (e) => {
    rec.status = 'failed'
    rec.error = '起不了翻译进程：' + String(e.message || e)
    clearLock(rel)
  })
  child.on('close', (code) => {
    try {
      logStream && logStream.end()
    } catch {
      /* 忽略 */
    }
    if (rec.status === 'failed') return
    if (code === 0 && fs.existsSync(outAbs)) {
      rec.status = 'done'
      rec.progress = 100
      rec.output = outRel
      clearLock(rel)
      return
    }
    // 失败时把这次跑出来的半成品删掉：留着它会被当成"翻好了"，
    // 而且下一次 PDFMathTranslate 看到同名文件也会自己跳过
    for (const suffix of ['-dual.pdf', '-mono.pdf']) {
      const p = outAbs.replace(/-dual\.pdf$/i, suffix)
      try {
        if (fs.existsSync(p) && fs.statSync(p).mtimeMs >= rec.startedAt) fs.unlinkSync(p)
      } catch {
        /* 删不掉就算了 */
      }
    }
    rec.status = 'failed'
    rec.error = code === null
      ? '翻译中断了（进程被杀或者服务重启）。再点一次就会重来，日志在 .翻译/ 里同名的 .log'
      : '翻译失败（退出码 ' + code + '）。日志在 .翻译/ 里同名的 .log'
    clearLock(rel)
  })
  return rec
}

/* ---------- 知识库（文档根下的第一层目录）---------- */

/** 图标与说明的旁路表，放在文档根下，缺省也不影响使用 */
/*
 * ---------- 知识库注册表（唯一真源）----------
 *
 * .知识库.json 是知识库身份的唯一存放处。以前这份信息散在五处：
 * 磁盘目录名、这个文件、public/kb.json、localStorage 的标题与图标、组件内部状态 ——
 * 于是"改一个地方另一处不知道"，每两处之间都要单独接一根线，接不全就漏。
 *
 * 现在只留这一份，其余一律由它派生：
 *  ，目录名      = lib.name（改名就是改目录名，两边永远一致）
 *  ，侧边栏标题   = 当前库的 name（标题第一行就是库名，不再各存一份）
 *  ，侧边栏图标   = 当前库的 icon
 *  ，面板宽度     = config.panelWidth
 * 磁盘上多出来的目录（在 Finder 里新建的）按名字补进注册表，不丢东西。
 */
const LIB_META_FILE = '.知识库.json'

const DEFAULT_REGISTRY = { version: 1, config: { panelWidth: 236, panelOpen: true }, libs: [] }

function readRegistry() { return repo.getJSON('libraries', DEFAULT_REGISTRY, '.知识库.json') }
function writeRegistry(reg) { repo.setJSON('libraries', reg) }

/** 磁盘上真实存在的知识库目录（第一层，非隐藏） */
function diskLibs() {
  try {
    return fs
      .readdirSync(DOCS_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .map((e) => e.name)
  } catch {
    return []
  }
}

/** 读注册表，并把磁盘上多出来 / 已经消失的目录对齐过去 */
function syncRegistry() {
  const reg = readRegistry()
  const disk = diskLibs()
  // 旧版创建流程可能把同一目录登记两次；以最早的记录为准保留图标等设置。
  const seen = new Set()
  const count = reg.libs.length
  reg.libs = reg.libs.filter((lib) => {
    if (seen.has(lib.name)) return false
    seen.add(lib.name)
    return true
  })
  const known = new Set(reg.libs.map((l) => l.name))
  let changed = reg.libs.length !== count
  /* 磁盘上多出来的：按名字补一条 */
  for (const name of disk) {
    if (!known.has(name)) {
      let n = reg.libs.length + 1
      while (reg.libs.some((l) => l.id === 'L' + n)) n++
      reg.libs.push({ id: 'L' + n, name, icon: '', desc: '', meta: '' })
      changed = true
    }
  }
  /* 注册表里已经没有对应目录的：留着（可能只是被临时移走），但标记一下 */
  for (const l of reg.libs) l.missing = !disk.includes(l.name)
  if (changed) writeRegistry(reg)
  return reg
}

function ensureDraftLibrary() {
  const name = '草稿'
  const abs = safeResolve(name)
  if (!fs.existsSync(abs)) repo.mkdir(abs)
  if (share.isShared(name)) share.setShared(name, false)
  const reg = syncRegistry()
  const lib = reg.libs.find(item => item.name === name)
  if (lib && !lib.icon) { lib.icon = 'icon:draft'; writeRegistry(reg) }
}

function listLibs() {
  const reg = syncRegistry()
  return reg.libs
    .filter((l) => !l.missing)
    .map((l) => ({
      id: l.id,
      name: l.name,
      path: l.name,
      icon: l.icon || '',
      desc: l.desc || '',
      meta: l.meta || '',
      /* 副标题：跟随知识库走，不再是全站写死的一句 */
      sub: l.sub || '',
      ...share.status(l.name),
      ...libSummary(path.join(DOCS_ROOT, l.name))
    }))
  /*
   * 顺序 = 注册表里的顺序，不重新排序。
   *
   * 以前按名字排，而 'zh-Hans-CN' 的规则把中文排在拉丁字母前面，
   * 「Agent（设计方向）」被挤到最后、默认就落到别的库上了。
   * 顺序是使用者的意图，不该由排序规则决定。
   */
}

/** 同一次有界遍历取得篇数与最近正文修改时间，供知识库管理排序。 */
function libSummary(abs) {
  let n = 0, mtime = 0
  const walk = (dir, depth) => {
    if (depth > MAX_DEPTH || n > MAX_NODES) return
    let list = []
    try {
      list = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of list) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue
      if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1)
      else if (/\.(md|pdf|html?)$/i.test(e.name)) {
        n++
        try { mtime = Math.max(mtime, fs.statSync(path.join(dir, e.name)).mtimeMs) } catch { /* 文件可能刚被移走 */ }
      }
    }
  }
  walk(abs, 0)
  return { docs: n, mtime }
}

const routes = {
  'GET /trash': async () => ({ ok: true, data: trash.list() }),
  'POST /trash/restore': async body => ({ ok: true, data: body.legacyId ? trash.restoreLegacy(String(body.legacyId),String(body.destination||'')) : trash.restore(String(body.trashId || '')) }),
  'GET /instance': async (_body, _url, ctx) => {
    if (ctx.role !== 'owner') throw fault('FORBIDDEN', '仅本机或管理者可查看实例', 403)
    return { ok: true, data: { product: 'reader', protocol: 1, identity: digest(DOCS_ROOT).slice(0, 24), platform: process.platform, dataDirectory: DOCS_ROOT } }
  },
  ...documentRoutes(repo,{share,assertFile,assertMd,assertVisible}),
  /** 这次请求算谁：我 还是 别人。前端靠它决定要不要露出编辑相关的东西 */
  'GET /me': async (_body, _url, ctx) => ({ ok: true, data: { role: ctx.role, pdfTranslationAvailable: ctx.role === 'owner' && !!pdf2zhBin(), restoredCopy: ctx.role === 'owner' && process.env.READER_RESTORED_COPY === '1' } }),
  'GET /agent-libs': async (_body, _url, ctx) => {
    if (ctx.role !== 'owner') throw fault('FORBIDDEN', '需要授权', 403)
    const scopes = ctx.agentScopes
    const libs = listLibs().filter(l => !scopes || scopes.includes(l.name))
      .map(({ id, name, path, icon, desc, docs, locked }) => ({ id, name, path, icon, desc, docs, locked }))
    return { ok: true, data: { libs } }
  },

  /** 分享设置（只有我能读写） */
  'GET /share': async (_body, _url, ctx) => {
    if (ctx.role !== 'owner') throw new Error('只有你能看分享设置')
    return { ok: true, data: share.snapshot() }
  },

  /** 勾选 / 取消某个节点对外可见（子级继承，见 share.js） */

  /*
   * ---------- 知识库（文档根下的第一层目录）----------
   *
   * 一个知识库 = 根目录下的一个文件夹。名字直接取文件夹名，不另存清单 ——
   * 「磁盘是唯一真源」这条原则在这里也照用：
   *  ，在 Finder 里改名，下一次 GET /libs 就跟着变
   *  ，在界面上改名，走 PUT /lib/name，服务端重命名文件夹后把 .分享.json 的键一起搬
   * 图标与说明是给人看的附加信息，存在根目录的 .知识库.json 里（可缺省）。
   */
  'GET /libs': async (_body, _url, ctx) => {
    if (ctx.role === 'owner') ensureDraftLibrary()
    const cfg = syncRegistry().config
    /*
     * 访客只看得到对外可见的库 —— 连"存在一个不公开的库"这件事都不该知道。
     * 主人看全部，并带上可见性开关的状态。
     */
    const all = listLibs()
    const libs = ctx.role === 'owner' ? all : all.filter((l) => l.shared)
    return { ok: true, data: { libs, config: cfg } }
  },

  /** 改一个知识库的显示名（= 重命名它的文件夹） */
  'GET /reconcile': async()=>({ok:true,data:repo.pendingMoves()}),
  'POST /reconcile': async body=>{
    const move=repo.pendingMoves().find(x=>x.from===body.from&&x.to===body.to)
    if(!move)throw fault('CONFLICT','文件位置已变化，请重新扫描',409)
    for(const a of repo.db.prepare('SELECT * FROM assets').all())if(a.path.startsWith(move.from+'/'))repo.db.prepare('INSERT OR REPLACE INTO asset_aliases VALUES (?,?)').run(a.path,a.id)
    repo.remap(move.from,move.to);share.rename(move.from,move.to)
    remapOrderUnder(move.from,move.to);remapColWidthsUnder(move.from+'/',move.to+'/');moveColWidths(move.from,move.to);remapFoldables(move.from,move.to,true)
    if(!move.from.includes('/')){const reg=readRegistry();const hit=reg.libs?.find(x=>x.name===move.from);if(hit){hit.name=move.to;writeRegistry(reg)}}
    return {ok:true,data:move}
  },
  'PUT /lib/name': async (body, _url, ctx) => {
    if (ctx.role !== 'owner') throw new Error('只有你能改知识库名')
    const from = String(body.from || '').replace(/^\/+|\/+$/g, '')
    const to = String(body.to || '').replace(/^\/+|\/+$/g, '')
    if (!from || !to) throw new Error('缺 from / to')
    if (from === '草稿' || to === '草稿') throw fault('RESERVED_LIBRARY', '草稿知识库保留给临时收录', 400)
    if (from.includes('/') || to.includes('/')) throw new Error('知识库名不能带斜杠')
    const absOld = safeResolve(from)
    const absNew = safeResolve(to)
    if (!fs.existsSync(absOld)) throw new Error('知识库不存在: ' + from)
    if (fs.existsSync(absNew)) throw new Error('已有同名知识库: ' + to)
    const reg = syncRegistry()
    assets.beforeMove(relativeKey(absOld)); repo.move(absOld, absNew); repo.remap(relativeKey(absOld), relativeKey(absNew))
    /* 分享与可编辑的键跟着搬，否则改名就等于把不公开的东西放出去了 */
    share.rename(from, to)
    remapOrderUnder(from, to)
    remapColWidthsUnder(from + '/', to + '/')
    remapFoldables(from, to, true)
    /* 图标/说明表里的键也要跟着改 */
    /* 注册表是唯一真源：改名就是改它，目录名与标题都从它派生 */
    const hit = reg.libs.find((l) => l.name === from)
    if (hit) { hit.name = to; writeRegistry(reg) }
    return { ok: true, data: { libs: listLibs() } }
  },

  /** 改一个知识库的图标与说明 */
  'PUT /lib/meta': async (body, _url, ctx) => {
    if (ctx.role !== 'owner') throw new Error('只有你能改')
    const name = String(body.name || '').replace(/^\/+|\/+$/g, '')
    if (!name || name.includes('/')) throw new Error('缺 name')
    const reg = syncRegistry()
    const hit = reg.libs.find((l) => l.name === name)
    if (!hit) throw new Error('知识库不存在: ' + name)
    if (body.icon !== undefined) {if(String(body.icon).length>200000)throw fault('INVALID_ICON','图标过大');hit.icon = String(body.icon)}
    if (body.desc !== undefined) hit.desc = String(body.desc)
    if (body.meta !== undefined) hit.meta = String(body.meta)
    if (body.sub !== undefined) hit.sub = String(body.sub)
    writeRegistry(reg)
    return { ok: true, data: { libs: listLibs() } }
  },

  /** 新建知识库：建目录 + 写进注册表，一步到位，不留"目录有了但没登记"的中间态 */
  'POST /lib': async (body, _url, ctx) => {
    if (ctx.role !== 'owner') throw new Error('只有你能新建知识库')
    const name = String(body.name || '').trim()
    if (!name) throw new Error('知识库名不能为空')
    if (name.includes('/') || name.startsWith('.')) throw new Error('名字里不能有斜杠，也不能以点开头')
    const abs = safeResolve(name)
    if (fs.existsSync(abs)) throw new Error('已有同名知识库: ' + name)
    // 先取注册表再建目录；建完才同步会先自动补一条，随后又追加一条。
    const reg = syncRegistry()
    repo.mkdir(abs)
    share.setShared(name, false)
    share.setLocked(name, true)
    let n = reg.libs.length + 1
    while (reg.libs.some((l) => l.id === 'L' + n)) n++
    reg.libs.push({ id: 'L' + n, name, icon: String(body.icon || ''), desc: String(body.desc || ''), meta: '' })
    writeRegistry(reg)
    return { ok: true, data: { libs: listLibs() } }
  },

  /** 调整知识库顺序：整份顺序数组覆盖过去（顺序是使用者的意图，存在注册表里） */
  'PUT /lib/order': async (body, _url, ctx) => {
    if (ctx.role !== 'owner') throw new Error('只有你能调整顺序')
    const order = Array.isArray(body.order) ? body.order.map((x) => String(x)) : []
    if (!order.length) throw new Error('缺 order')
    const reg = syncRegistry()
    const byName = new Map(reg.libs.map((l) => [l.name, l]))
    const next = []
    for (const name of order) {
      const hit = byName.get(name)
      if (hit) { next.push(hit); byName.delete(name) }
    }
    /* 没在 order 里提到的（比如刚在 Finder 里建的）跟在后面，不丢 */
    for (const rest of byName.values()) next.push(rest)
    reg.libs = next
    writeRegistry(reg)
    return { ok: true, data: { libs: listLibs() } }
  },

  /*
   * 面板宽度这类界面偏好也放注册表 —— 和知识库同源，
   * 免得再开一个 localStorage 副本出来（那正是之前串味的根源）。
   */
  'PUT /lib/config': async (body, _url, ctx) => {
    if (ctx.role !== 'owner') throw new Error('只有你能改')
    const reg = syncRegistry()
    if (body.panelWidth !== undefined) {
      reg.config.panelWidth = Math.max(180, Math.min(420, Number(body.panelWidth) || 236))
    }
    if (body.panelOpen !== undefined) reg.config.panelOpen = !!body.panelOpen
    writeRegistry(reg)
    return { ok: true, data: { config: reg.config } }
  },

  /*
   * 删除一个知识库：整个文件夹挪进回收站（不真删）。
   * 一次动几百个文件，误删代价大，所以只做移动 —— 回收站里还能捞回来。
   */
  'DELETE /lib': async (body, _url, ctx) => {
    if (ctx.role !== 'owner') throw new Error('只有你能删知识库')
    const name = String(body.name || '').replace(/^\/+|\/+$/g, '')
    if (name === '草稿') throw fault('RESERVED_LIBRARY', '草稿知识库不能删除', 400)
    if (!name || name.includes('/')) throw new Error('缺 name')
    const abs = safeResolve(name)
    if (!fs.existsSync(abs)) throw new Error('知识库不存在: ' + name)
    if (!fs.statSync(abs).isDirectory()) throw new Error('不是目录: ' + name)
    moveToTrash(name)
    const reg = syncRegistry()
    reg.libs = reg.libs.filter((l) => l.name !== name)
    writeRegistry(reg)
    return { ok: true, data: { libs: listLibs() } }
  },

  /**
   * 整棵树：直接扫盘，附每个文件的修改时间与大小。
   *
   * ?lib=<库名> 时只返回那一个知识库（根目录下的一个文件夹）的内容，
   * 并且把每个节点的路径补上库名前缀 —— 这样前端拿到的 file 仍是相对文档根的全路径，
   * 读文档、存文档那一整套都不用改。
   */
  'GET /tree': async (_body, url) => {
    scanned = 0
    const lib = String(url.searchParams.get('lib') || '')
    if (lib) {
      if (lib === '.' || lib === '..' || lib.startsWith('.') || /[/\\]/.test(lib)) {
        throw new Error('知识库名无效')
      }
      const abs = safeResolve(lib)
      if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error('知识库不存在: ' + lib)
      const nodes = scanDir(abs, lib, 0, readOrder())
      return { ok: true, data: { nodes, lib } }
    }
    return { ok: true, data: { nodes: scanDir(DOCS_ROOT, '', 0, readOrder()) } }
  },

  /** 读一篇文档 */
  'GET /doc': async (_body, url) => {
    const rel = url.searchParams.get('path') || ''
    const abs = assertMd(rel)
    if (!fs.existsSync(abs)) throw new Error('文档不存在: ' + rel)
    const content = fs.readFileSync(abs, 'utf-8'); const n = repo.node(rel); assets.legacy(rel)
    return { ok: true, data: { path: rel, id: n.id, meta:n.meta, content, revision: digest(content) } }
  },

  /** 哪些标题明确设成折叠标题；正文仍保持标准 Markdown。 */
  'GET /foldable': async (_body, url) => {
    const rel = url.searchParams.get('path') || ''
    const abs = assertMd(rel)
    if (!fs.existsSync(abs)) throw new Error('文档不存在: ' + rel)
    return { ok: true, data: { path: rel, keys: readFoldables()[rel] || {} } }
  },
  'PUT /foldable': async (body) => {
    const rel = String(body.path || '')
    const abs = assertMd(rel)
    if (!fs.existsSync(abs)) throw new Error('文档不存在: ' + rel)
    const key = String(body.key || '')
    if (!key || key.length > 500 || !/^\d\|/.test(key)) throw new Error('标题标识无效')
    const all = readFoldables()
    const keys = { ...(all[rel] || {}) }
    if (body.on) keys[key] = true
    else delete keys[key]
    if (Object.keys(keys).length) all[rel] = keys
    else delete all[rel]
    writeFoldables(all)
    return { ok: true, data: { path: rel, keys } }
  },

  /** 保存一篇文档 */
  'PUT /doc': async (body) => {
    const abs = assertMd(body.path)
    if (!fs.existsSync(abs)) throw fault('NOT_FOUND', '文档不存在', 404)
    const old = fs.readFileSync(abs, 'utf8'), next = String(body.content ?? '')
    const currentRevision = digest(old)
    if (!body.revision) throw fault('REVISION_REQUIRED', '请重新读取文档后再保存', 428)
    if (body.revision !== currentRevision) throw fault('CONFLICT', '文档已被其他编辑者修改，已保留你的内容，请比较后合并', 409, { content: old, revision: currentRevision })
    const n=repo.node(body.path)
    if (old !== next) {
      const id=cryptoId(), versionPath='.reader/versions/'+id+'.md'
      repo.write(path.join(DOCS_ROOT,versionPath),old)
      repo.db.prepare('INSERT INTO versions VALUES (?,?,?,?,?)').run(id,n.id,currentRevision,versionPath,Date.now())
      repo.write(abs,next);repo.node(body.path)
      const expired=repo.db.prepare('SELECT id,path FROM versions WHERE node=? ORDER BY at DESC,rowid DESC LIMIT -1 OFFSET 100').all(n.id)
      for(const v of expired){repo.remove(path.join(DOCS_ROOT,v.path));repo.db.prepare('DELETE FROM versions WHERE id=?').run(v.id)}
    }
    return { ok:true, savedAt:Date.now(), data:{id:n.id,revision:digest(next)} }
  },
  'POST /asset': async body => {
    const doc=String(body.path||'');assertMd(doc)
    return {ok:true,data:assets.upload(doc,String(body.mime||''),String(body.data||body.base64||''))}
  },

  /** 新建文档：dir 为空串表示根目录 */
  'POST /doc': async (body) => {
    const dir = assertDir(body.dir)
    const name = safeName(body.name)
    if (!name) throw new Error('文档名不能为空')
    repo.mkdir(safeResolve(dir))
    const file = uniqueFile(dir, name)
    const content = String(body.content ?? '# ' + name + '\n')
    repo.write(safeResolve(file), content)
    const node = repo.node(file)
    if (body.source !== undefined) recordSource(repo, node.id, body.source)
    return { ok: true, data: { name: path.basename(file, '.md'), file, id: node.id, revision: digest(content) } }
  },

  /** DSH 工作区文件被明确收录时，文档与图片在同一次修改中落盘。 */
  'POST /import-workspace-doc': async (body) => {
    const dir = assertDir(body.dir)
    const name = safeName(body.name)
    if (!name) throw fault('INVALID_NAME', '文档名不能为空')
    const imported = Array.isArray(body.assets) ? body.assets : []
    if (imported.length > 24) throw fault('TOO_MANY_IMAGES', '一篇文档最多收录 24 张图片')
    const references = new Set()
    for (const item of imported) {
      if (typeof item?.reference !== 'string' || !item.reference || item.reference.length > 600 || references.has(item.reference)) throw fault('INVALID_IMAGE', '图片路径无效或重复')
      references.add(item.reference)
    }
    repo.mkdir(safeResolve(dir))
    const file = uniqueFile(dir, name)
    let content = String(body.content ?? '')
    repo.write(safeResolve(file), content)
    const node = repo.node(file)
    for (const item of imported) {
      const saved = assets.upload(file, String(item.mime || ''), String(item.base64 || ''))
      content = content.split(item.reference).join(saved.url)
    }
    if (content !== String(body.content ?? '')) repo.write(safeResolve(file), content)
    recordSource(repo, node.id, { kind: 'workspace-file', workspace: String(body.workspace || ''), reference: String(body.reference || '') })
    return { ok: true, data: { file, id: node.id, revision: digest(content), images: imported.length } }
  },

  'GET /workspace-previews': async (_body, url) => ({ ok: true, data: repo.db.prepare('SELECT id,reference,source_path AS sourcePath,title,updated,incomplete,archived FROM workspace_previews WHERE archived=? ORDER BY updated DESC LIMIT 100').all(url.searchParams.get('archived') === '1' ? 1 : 0).map(row => ({ ...row, sourceState: previewSourceState(row.sourcePath || row.reference, row.updated) })) }),
  'GET /icon-history': async () => {
    const saved = repo.getJSON('customIconHistory', [])
    const inUse = [
      ...readRegistry().libs.map(lib => lib.icon),
      ...repo.db.prepare("SELECT meta FROM nodes WHERE meta LIKE '%\"icon\"%'").all().map(row => {
        try { return JSON.parse(row.meta).icon } catch { return '' }
      })
    ]
    const icons = [...new Set([...saved, ...inUse].filter(value => typeof value === 'string' && (/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(value) || /^\/(?!\/)/.test(value))))]
    return { ok: true, data: icons.slice(0, 60) }
  },
  'POST /icon-history': async body => {
    const value = String(body.value || '')
    const encoded = value.startsWith('data:image/png;base64,') ? value.slice('data:image/png;base64,'.length) : ''
    if (!encoded || encoded.length > 200000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw fault('INVALID_ICON', '图标图片无效')
    const image = Buffer.from(encoded, 'base64')
    if (image.length < 24 || !image.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || image.readUInt32BE(16) !== 128 || image.readUInt32BE(20) !== 128) throw fault('INVALID_ICON', '请选择 128 像素的 PNG 图标')
    const old = repo.getJSON('customIconHistory', [])
    const next = [value, ...old.filter(icon => icon !== value)].slice(0, 20)
    repo.setJSON('customIconHistory', next)
    return { ok: true, data: next }
  },
  'GET /workspace-preview': async (_body, url) => {
    const row = repo.db.prepare('SELECT id,reference,source_path AS sourcePath,title,content,updated,incomplete,archived FROM workspace_previews WHERE id=?').get(String(url.searchParams.get('id') || ''))
    if (!row) throw fault('NOT_FOUND', '浏览记录不存在', 404)
    return { ok: true, data: { ...row, sourceState: previewSourceState(row.sourcePath || row.reference, row.updated) } }
  },
  'POST /workspace-preview': async body => {
    const reference = String(body.reference || '')
    const title = String(body.title || '').slice(0, 200)
    const content = String(body.content || '')
    const sourcePath = String(body.sourcePath || '').slice(0, 2000)
    if (sourcePath && (!path.isAbsolute(sourcePath) || !/\.(md|markdown)$/i.test(sourcePath))) throw fault('INVALID_PREVIEW', '原文件路径无效')
    if (!reference || reference.length > 2000 || !title || content.length > 5 * 1024 * 1024) throw fault('INVALID_PREVIEW', '预览来源或内容无效')
    const id = digest(reference).slice(0, 32)
    if (!repo.db.prepare('SELECT id FROM workspace_previews WHERE reference=?').get(reference) && repo.db.prepare('SELECT count(*) AS n FROM workspace_previews WHERE archived=0').get().n >= 500) throw fault('PREVIEW_LIMIT', '工作区浏览记录已达 500 篇，请归档旧记录')
    const images = Array.isArray(body.assets) ? body.assets : []
    if (images.length > 24) throw fault('TOO_MANY_IMAGES', '预览图片超过 24 张')
    let snapshot = content
    for (const image of images) {
      const ref = String(image.reference || '')
      const mime = String(image.mime || '')
      const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }[mime]
      if (!ref || ref.length > 600 || !content.includes(ref) || !ext) throw fault('INVALID_IMAGE', '预览图片无效')
      const encoded = String(image.base64 || '')
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 14 * 1024 * 1024) throw fault('INVALID_IMAGE', '图片内容无效')
      const bytes = Buffer.from(encoded, 'base64')
      if (bytes.length > 10 * 1024 * 1024 || !bytes.length) throw fault('INVALID_IMAGE', '图片超过 10 MB')
      const valid = mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : mime === 'image/gif' ? ['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6))
        : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP'
      if (!valid) throw fault('INVALID_IMAGE', '图片格式与内容不符')
      const imageId = digest(bytes).slice(0, 32)
      repo.write(path.join(DOCS_ROOT, '.reader/previews', id, imageId + ext), bytes)
      repo.db.prepare('INSERT OR REPLACE INTO workspace_preview_assets VALUES (?,?,?)').run(id, imageId, mime)
      snapshot = snapshot.split(ref).join('/api/workspace-preview-asset?id=' + id + '&asset=' + imageId)
    }
    const currentImages = new Set([...snapshot.matchAll(/\/api\/workspace-preview-asset\?id=[a-f0-9]{32}&asset=([a-f0-9]{32})/g)].map(match => match[1]))
    for (const old of repo.db.prepare('SELECT id,mime FROM workspace_preview_assets WHERE preview=?').all(id)) {
      if (currentImages.has(old.id)) continue
      const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }[old.mime]
      if (ext) repo.remove(path.join(DOCS_ROOT, '.reader/previews', id, old.id + ext))
      repo.db.prepare('DELETE FROM workspace_preview_assets WHERE preview=? AND id=?').run(id, old.id)
    }
    repo.db.prepare('INSERT INTO workspace_previews (id,reference,source_path,title,content,updated,incomplete,archived) VALUES (?,?,?,?,?,?,?,0) ON CONFLICT(reference) DO UPDATE SET source_path=CASE WHEN excluded.source_path<>\'\' THEN excluded.source_path ELSE workspace_previews.source_path END,title=excluded.title,content=excluded.content,updated=excluded.updated,incomplete=excluded.incomplete,archived=0').run(id, reference, sourcePath, title, snapshot, Date.now(), Number(Boolean(body.incomplete)))
    return { ok: true, data: { id } }
  },
  'DELETE /workspace-preview': async body => {
    const id = String(body.id || '')
    const row = repo.db.prepare('SELECT id FROM workspace_previews WHERE id=?').get(id)
    if (!row) throw fault('NOT_FOUND', '浏览记录不存在', 404)
    repo.db.prepare('UPDATE workspace_previews SET archived=1 WHERE id=?').run(id)
    return { ok: true, data: { archived: true } }
  },
  'PUT /workspace-preview/archive': async body => {
    const id = String(body.id || '')
    if (!repo.db.prepare('SELECT id FROM workspace_previews WHERE id=?').get(id)) throw fault('NOT_FOUND', '浏览记录不存在', 404)
    repo.db.prepare('UPDATE workspace_previews SET archived=? WHERE id=?').run(body.archived ? 1 : 0, id)
    return { ok: true, data: { archived: Boolean(body.archived) } }
  },
  'POST /collect-workspace-preview': async body => {
    const id = String(body.id || '')
    const row = repo.db.prepare('SELECT * FROM workspace_previews WHERE id=?').get(id)
    if (!row) throw fault('NOT_FOUND', '浏览记录不存在', 404)
    if (row.incomplete) throw fault('INCOMPLETE_PREVIEW', '部分图片未能读取，请回到 DSH 重新打开源文件后收录')
    const dir = assertDir(body.dir)
    if (!dir || !fs.existsSync(safeResolve(dir))) throw fault('NOT_FOUND', '目标知识库或目录不存在', 404)
    const name = safeName(body.name || row.title.replace(/\.(md|markdown)$/i, ''))
    if (!name) throw fault('INVALID_NAME', '文档名不能为空')
    const file = uniqueFile(dir, name)
    let content = row.content
    repo.write(safeResolve(file), content)
    const node = repo.node(file)
    for (const match of [...content.matchAll(/\/api\/workspace-preview-asset\?id=([a-f0-9]{32})&asset=([a-f0-9]{32})/g)]) {
      if (match[1] !== id) continue
      const item = repo.db.prepare('SELECT mime FROM workspace_preview_assets WHERE preview=? AND id=?').get(id, match[2])
      if (!item) throw fault('INVALID_IMAGE', '临时图片缺失，收录已取消')
      const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }[item.mime]
      const image = fs.readFileSync(path.join(DOCS_ROOT, '.reader/previews', id, match[2] + ext))
      const saved = assets.upload(file, item.mime, image.toString('base64'))
      content = content.replaceAll(match[0], saved.url)
    }
    repo.write(safeResolve(file), content)
    recordSource(repo, node.id, { kind: 'workspace-file', workspace: '', reference: row.reference, note: '从工作区浏览记录收录' })
    share.setShared(file, false)
    // 收录只复制到知识库；工作区浏览记录仍是历史，之后还可回看源文件。
    return { ok: true, data: { file } }
  },

  /** 改名 = 改文件名 */
  'PATCH /doc': async (body) => {
    const absOld = assertFile(body.path)
    const name = safeName(body.name)
    if (!name) throw new Error('文档名不能为空')
    const dir = path.dirname(body.path)
    // 改名也一样：pdf 不能变成 .md
    const ext = path.extname(body.path) || '.md'
    const next = relJoin(dir === '.' ? '' : dir, name + ext)
    if (next === body.path) return { ok: true, data: { name, file: body.path } }
    const absNew = assertFile(next)
    // 只差大小写不算重名，macOS 文件系统本来就不区分大小写
    const sameExceptCase = next.toLowerCase() === body.path.toLowerCase()
    if (!sameExceptCase && fs.existsSync(absNew)) throw new Error('同目录下已有同名文件: ' + name + '.md')
    if (fs.existsSync(absOld)) {
      if (sameExceptCase) {
        // 大小写改名要两步走，否则在大小写不敏感的文件系统上会变成 no-op
        const tmp = absOld + '.rename-tmp'
        assets.beforeMove(body.path); repo.move(absOld, tmp)
        repo.move(tmp, absNew); repo.remap(body.path, next)
      } else {
        assets.beforeMove(relativeKey(absOld)); repo.move(absOld, absNew); repo.remap(relativeKey(absOld), relativeKey(absNew))
      }
    }
    share.rename(body.path, next)
    moveColWidths(body.path, next)
    remapFoldables(body.path, next)
    removeFromOrder(dir === '.' ? '' : dir, path.basename(body.path))
    return { ok: true, data: { name, file: next } }
  },

  /** 删除文档，挪进回收站 */
  'DELETE /doc': async (body) => {
    const abs = assertFile(body.path)
    if (!fs.existsSync(abs)) throw new Error('文档不存在: ' + body.path)
    const moved = moveToTrash(body.path)
    dropColWidthsUnder(body.path)
    dropFoldables(body.path)
    return { ok: true, data: { movedTo: moved } }
  },

  /** 新建目录 */
  'POST /category': async (body) => {
    const parent = assertDir(body.parent)
    const name = safeName(body.name)
    if (!name) throw new Error('目录名不能为空')
    const rel = relJoin(parent, name)
    const abs = safeResolve(rel)
    if (fs.existsSync(abs)) throw new Error('同位置已有同名目录: ' + name)
    repo.mkdir(abs)
    return { ok: true, data: { name, path: rel } }
  },

  /** 目录改名 */
  'PATCH /category': async (body) => {
    const rel = assertDir(body.path)
    if (!rel) throw new Error('根目录不能改名')
    const name = safeName(body.name)
    if (!name) throw new Error('目录名不能为空')
    const parent = path.posix.dirname(rel)
    const next = relJoin(parent === '.' ? '' : parent, name)
    if (next === rel) return { ok: true, data: { name, path: rel } }
    const absOld = safeResolve(rel)
    const absNew = safeResolve(next)
    if (!fs.existsSync(absOld)) throw new Error('目录不存在: ' + rel)
    if (fs.existsSync(absNew)) throw new Error('同位置已有同名目录: ' + name)
    assets.beforeMove(relativeKey(absOld)); repo.move(absOld, absNew); repo.remap(relativeKey(absOld), relativeKey(absNew))
    share.rename(rel, next)
    remapColWidthsUnder(rel + '/', next + '/')
    remapFoldables(rel, next, true)
    dropOrderFor(rel)
    return { ok: true, data: { name, path: next } }
  },

  /** 删除目录：整个挪进回收站，目录里的东西一件不动 */
  'DELETE /category': async (body) => {
    const rel = assertDir(body.path)
    if (!rel) throw new Error('根目录不能删')
    if (!fs.existsSync(safeResolve(rel))) throw new Error('目录不存在: ' + rel)
    const moved = moveToTrash(rel)
    dropColWidthsUnder(rel + '/')
    dropFoldables(rel, true)
    dropOrderFor(rel)
    return { ok: true, data: { movedTo: moved } }
  },

  /**
   * 拖拽调整某一层里条目的顺序（文档和目录混着排）。
   * 传上来的是这一层的完整名字列表（目录名 / 带扩展名的文件名），按新顺序排。
   * 跟磁盘对不上就报错，不静默写坏。
   */
  'PUT /order': async (body) => {
    const parent = assertDir(body.parent)
    const abs = parent ? safeResolve(parent) : DOCS_ROOT
    if (!fs.existsSync(abs)) throw new Error('目录不存在: ' + parent)
    // 判据跟扫盘完全一致：隐藏项、软链、node_modules、阅读器自己那个目录都不算
    const existing = fs
      .readdirSync(abs, { withFileTypes: true })
      .filter((e) => !e.isSymbolicLink() && !e.name.startsWith('.') && path.join(abs, e.name) !== READER_ROOT)
      .filter((e) => (e.isDirectory() && !SKIP_DIRS.has(e.name)) || (e.isFile() && /\.(md|pdf|html?)$/i.test(e.name)))
      .map((e) => e.name)
    const names = Array.isArray(body.names) ? body.names.map(String) : []
    if (names.length !== existing.length || new Set(names).size !== names.length || names.some((n) => !existing.includes(n))) {
      throw new Error('顺序列表跟磁盘上的条目对不上，拒绝写入')
    }
    const isFile = (n) => /\.(md|pdf|html?)$/i.test(n)
    // 默认顺序（文档在前、目录在后，各自按名字）就不记，省得旁路文件里攒没意义的条目
    const defaultOrder = [...existing].sort((a, b) => {
      if (isFile(a) !== isFile(b)) return isFile(a) ? -1 : 1
      return a.localeCompare(b, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
    })
    const order = readOrder()
    if (names.join('\u0000') === defaultOrder.join('\u0000')) delete order[parent]
    else order[parent] = names
    writeOrder(order)
    return { ok: true, data: { parent, names } }
  },

  /**
   * 把目录挪到另一个目录下（把目录拖进目录里用）。
   * 连同里面的东西一起走：fs.rename 一次搞定，列宽和顺序记录的键跟着改。
   */
  'PUT /move/category': async (body) => {
    const rel = assertDir(body.path)
    if (!rel) throw new Error('根目录不能挪')
    const toParent = assertDir(body.toParent)
    const fromParent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
    if (fromParent === toParent) return { ok: true, data: { path: rel } }
    // 不许挪进自己或自己的子孙里，否则就把自己装进自己了
    if (toParent === rel || toParent.startsWith(rel + '/')) throw new Error('不能把目录挪进它自己里面')
    const absOld = safeResolve(rel)
    if (!fs.existsSync(absOld)) throw new Error('目录不存在: ' + rel)
    const name = path.posix.basename(rel)
    const next = toParent ? toParent + '/' + name : name
    const absNew = safeResolve(next)
    if (fs.existsSync(absNew)) throw new Error('目标位置已有同名目录: ' + name)
    repo.mkdir(safeResolve(toParent))
    assets.beforeMove(relativeKey(absOld)); repo.move(absOld, absNew); repo.remap(relativeKey(absOld), relativeKey(absNew))
    remapColWidthsUnder(rel + '/', next + '/')
    remapFoldables(rel, next, true)
    remapOrderUnder(rel, next)
    /*
     * 分享状态也要跟着走。否则从这个目录里挪出去的东西会脱离
     * 「整枝不分享」的约束，而没标过就是可见 —— 一篇不公开的稿子会因此漏出去。
     */
    share.rename(rel, next)
    // 只把名字从源层摘掉；它自己在 next 那一层的顺序刚才已经搬过去了，不能删
    removeFromOrder(fromParent, name)
    removeFromOrder(toParent, name)
    return { ok: true, data: { path: next } }
  },

  /** 把一篇文档挪到某个目录（拖拽用） */
  'PUT /move/doc': async (body) => {
    const absOld = assertFile(body.file)
    const dir = assertDir(body.dir)
    if (!fs.existsSync(absOld)) throw new Error('文档不存在: ' + body.file)
    const fromDir = path.dirname(body.file)
    if ((fromDir === '.' ? '' : fromDir) === dir) return { ok: true, data: { file: body.file } }
    repo.mkdir(safeResolve(dir))
    // 扩展名要保住：pdf 用 basename(x, '.md') 会变成「xxx.pdf.md」
    const fileName = path.basename(body.file)
    const ext = path.extname(fileName) || '.md'
    const base = fileName.slice(0, fileName.length - ext.length) || fileName
    const next = uniqueFile(dir, base, ext)
    assets.beforeMove(body.file); repo.move(absOld, safeResolve(next)); repo.remap(body.file, next)
    moveColWidths(body.file, next)
    remapFoldables(body.file, next)
    /* 同上：分享状态要跟着文档走，不然一拖就变了可见性 */
    share.rename(body.file, next)
    removeFromOrder(fromDir === '.' ? '' : fromDir, path.basename(body.file))
    return { ok: true, data: { file: next } }
  },

  'POST /copy/doc': async (body) => {
    const from = String(body.file || '')
    const abs = assertFile(from)
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw fault('NOT_FOUND', '文档不存在', 404)
    const dir = assertDir(body.dir)
    if (!dir) throw fault('DESTINATION_REQUIRED', '请选择目标知识库')
    if (!fs.existsSync(safeResolve(dir))) throw fault('NOT_FOUND', '目标目录不存在', 404)
    const ext = path.extname(from)
    const name = path.basename(from, ext)
    const next = uniqueFile(dir, name, ext)
    copyDocument(from, next)
    return { ok: true, data: { file: next } }
  },

  'POST /copy/category': async (body) => {
    const from = assertDir(body.path)
    const parent = assertDir(body.toParent)
    if (!from || !parent) throw fault('INVALID_PATH', '请选择源目录和目标知识库')
    if (parent === from || parent.startsWith(from + '/')) throw fault('INVALID_PATH', '不能复制到自身目录内')
    if (!fs.existsSync(safeResolve(from)) || !fs.statSync(safeResolve(from)).isDirectory()) throw fault('NOT_FOUND', '源目录不存在', 404)
    if (!fs.existsSync(safeResolve(parent))) throw fault('NOT_FOUND', '目标目录不存在', 404)
    const base = path.posix.basename(from)
    let next = relJoin(parent, base), i = 2
    while (fs.existsSync(safeResolve(next))) next = relJoin(parent, base + ' ' + i++)
    const result = copyFolder(from, next)
    return { ok: true, data: { path: next, ...result } }
  },

  /** 一篇 pdf 的书签目录，没有书签就返回空数组 */
  'GET /pdf-toc': async (_body, url) => {
    const rel = url.searchParams.get('path') || ''
    const { toc, source, pages, error } = await readPdfToc(rel)
    return { ok: true, data: { toc, source, pages, error } }
  },

  /** 起一个 pdf 翻译任务（后台跑，前端轮询） */
  'POST /pdf-translate': async (body) => {
    return { ok: true, data: jobInfo(startTranslate(String(body.path || ''))) }
  },

  /** 查翻译任务状态 */
  'GET /pdf-translate': async (_body, url) => {
    const rel = url.searchParams.get('path') || ''
    return { ok: true, data: jobStatus(rel) }
  },

  /**
   * 源码最新修改时间。
   *
   * 给前端当"代码看门狗"：开发时热更新的 websocket 一旦断了，页面会一直跑旧代码，
   * 而界面上看不出来（这次就踩了：编辑器插件改了，页面还是旧的，用户以为没修）。
   * 前端定期问一次这个接口，发现变新了就提示刷新。
   */
  'GET /build': async () => {
    const now = Date.now()
    if (buildStamp.at && now - buildStamp.at < 3000) return { ok: true, data: { mtime: buildStamp.mtime } }
    let newest = 0
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const p = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(p)
          continue
        }
        if (!/\.(js|vue|css|json)$/.test(entry.name)) continue
        const m = fs.statSync(p).mtimeMs
        if (m > newest) newest = m
      }
    }
    try {
      walk(path.join(READER_ROOT, 'src'))
      walk(path.join(READER_ROOT, 'server'))
    } catch {
      /* 扫不动就当没变 */
    }
    buildStamp.at = now
    buildStamp.mtime = newest
    return { ok: true, data: { mtime: newest } }
  },

  /** 读一篇文档的表格列宽 */
  'GET /colw': async (_body, url) => {
    const file = url.searchParams.get('file') || ''
    assertVisible(file)
    assertMd(file)
    return { ok: true, data: readColWidths()[file] || [] }
  },

  /**
   * 写一篇文档的表格列宽。
   *
   * 列宽不写进 markdown：markdown 的表格语法根本没有列宽这个概念，
   * 硬塞进去只能靠 HTML 或注释污染正文。所以单独存一份旁路文件，
   * 正文保持干净，删文档时顺手把这一条也清掉。
   */
  'PUT /colw': async (body) => {
    const file = String(body.file || '')
    const abs = assertMd(file)
    if (!fs.existsSync(abs)) throw new Error('文档不存在: ' + file)
    const all = readColWidths()
    const widths = Array.isArray(body.widths) ? body.widths : []
    if (widths.length) all[file] = widths
    else delete all[file]
    writeColWidths(all)
    return { ok: true, data: widths }
  },
}

/**
 * 一个 /api 请求的统一入口。
 *
 * dev（本机编辑）和分享服务器（别人只读）走的是**同一份代码** —— 区别只在 ctx.role，
 * 这样"我在本地看到的行为"和"别人看到的行为"不会因为两套代码而分叉。
 *
 * 访客的约束在这里一次性做完：
 *   - 只允许 GET（写接口一律 403，连路由都不查）；
 *   - 碰到的每个路径都要 isShared 过关（猜 URL 也没用）；
 *   - /tree 直接把不分享的整枝剪掉再下发（不是前端藏，是根本不下发）。
 */
// 对文件及目录的所有修改在这里统一校验，包含改名、移动、排序、子树删除。
function canWrite(rel, role, recursive = false) {
  if (!rel) throw new Error('请选择一个知识库')
  assertVisible(rel)
  safeResolve(rel)
  if (role !== 'owner' && (!share.isShared(rel) || share.isLocked(rel))) throw new Error('该内容已锁定或不可访问')
  if (recursive && fs.existsSync(safeResolve(rel)) && fs.statSync(safeResolve(rel)).isDirectory()) {
    for (const entry of fs.readdirSync(safeResolve(rel), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      canWrite(rel + '/' + entry.name, role, true)
    }
  }
}
function checkWrite(key, body, role) {
  if (key === 'POST /trash/restore') {
    if (role !== 'owner') throw fault('FORBIDDEN', '回收站仅供管理者使用', 403)
    return
  }
  const source = body.path || body.file
  if (key === 'POST /workspace-preview' || key === 'DELETE /workspace-preview' || key === 'PUT /workspace-preview/archive' || key === 'POST /collect-workspace-preview' || key === 'POST /icon-history') {
    if (role !== 'owner') throw fault('FORBIDDEN', '工作区浏览记录仅供管理者使用', 403)
    if (key === 'POST /collect-workspace-preview') canWrite(body.dir, role)
    return
  }
  if (key === 'POST /copy/doc' || key === 'POST /copy/category') {
    if (role !== 'owner') throw fault('FORBIDDEN', '复制资料需要管理身份', 403)
    canWrite(source, role, key === 'POST /copy/category')
    canWrite(key === 'POST /copy/doc' ? body.dir : body.toParent, role)
    return
  }
  if (key === 'POST /lib' || key === 'PUT /lib/order' || key === 'PUT /lib/config') {
    if (role !== 'owner') throw new Error('请先验证管理密码')
    return
  }
  if (key.includes('/lib')) {
    if (role !== 'owner') throw new Error('请先验证管理密码')
    canWrite(body.from || body.name, role, true)
  } else if (key === 'POST /import-workspace-doc') {
    if (role !== 'owner') throw fault('FORBIDDEN', '请先进入管理工作区', 403)
    canWrite(body.dir, role)
  } else if (key === 'POST /doc') canWrite(body.dir, role)
  else if (key === 'POST /category' || key === 'PUT /order') canWrite(body.parent, role, key.endsWith('/order'))
  else {
    canWrite(source, role, key.includes('category') || key.startsWith('DELETE'))
    if (key === 'PUT /move/doc') canWrite(body.dir, role)
    if (key === 'PUT /move/category') canWrite(body.toParent, role)
    if (key === 'POST /pdf-translate' && role !== 'owner') throw new Error('请先验证管理密码')
  }
}
const loginAttempts = new Map()
function verifyPassword(req, password) {
  const ip = req.socket?.remoteAddress || 'local'
  const now = Date.now()
  const attempt = loginAttempts.get(ip)
  if (attempt && now - attempt.time < 60000 && attempt.count >= 10) throw new Error('尝试过于频繁，请一分钟后再试')
  if (!EDIT_PASSWORD || String(password || '') !== EDIT_PASSWORD) {
    loginAttempts.set(ip, { time: attempt && now - attempt.time < 60000 ? attempt.time : now, count: attempt && now - attempt.time < 60000 ? attempt.count + 1 : 1 })
    throw new Error('密码不正确')
  }
  loginAttempts.delete(ip)
}
export async function handleApi(req, res, ctx = {}) {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname.startsWith('/api/')) url.pathname = url.pathname.slice(4)
  const key = req.method + ' ' + url.pathname
  let role = ctx.role || 'guest'
  let agent=null
  const credential=String(req.headers['x-reader-agent']||'')
  if(credential){agent=repo.db.prepare('SELECT * FROM credentials WHERE hash=? AND revoked=0 AND expires>?').get(digest(credential),Date.now());if(agent)role='owner'}
  const isGuest = role !== 'owner'
  try {
    if (process.env.READER_PUBLIC_SNAPSHOT === '1' && req.method !== 'GET') throw fault('READ_ONLY', '公开快照仅供阅读', 403)
    if (req.method !== 'GET') {
      const origin = req.headers.origin
      if (origin && new URL(origin).host !== req.headers.host && new URL(origin).host !== req.headers['x-forwarded-host']) throw new Error('请求来源不匹配')
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Error('仅接受 JSON 请求')
    }
    const body = req.method === 'GET' ? {} : await readBody(req, key === 'POST /asset' ? 15 * 1024 * 1024 : ['POST /import-workspace-doc','POST /workspace-preview'].includes(key) ? 20 * 1024 * 1024 : undefined)
    if(credential && !agent)throw fault('UNAUTHORIZED','Agent 凭据无效或已过期',401)
    if (key === 'POST /reveal') {
      if (role !== 'owner' || agent || !localFileManagerRequest(req)) throw fault('FORBIDDEN', '仅可在本机管理界面打开文件位置', 403)
      let abs
      if (body.previewId) {
        const row = repo.db.prepare('SELECT reference,source_path AS sourcePath FROM workspace_previews WHERE id=?').get(String(body.previewId))
        if (!row) throw fault('NOT_FOUND', '浏览记录不存在', 404)
        const suppliedPath = String(body.sourcePath || '')
        if (suppliedPath && !row.reference.startsWith('dsh-resource://file/session/')) throw fault('INVALID_PATH', '来源地址不匹配', 400)
        const original = suppliedPath || row.sourcePath || row.reference
        if (!path.isAbsolute(original)) throw fault('SOURCE_UNAVAILABLE', '这条记录没有本机文件路径', 404)
        abs = path.resolve(original)
        if (inReader(abs)) throw fault('FORBIDDEN', '无法打开阅读器内部文件', 403)
        try { if (fs.lstatSync(abs).isSymbolicLink()) throw fault('FORBIDDEN', '不打开符号链接', 403) }
        catch (error) { if (error.code === 'ENOENT') throw fault('NOT_FOUND', '原文件已不存在', 404); throw error }
      } else {
        const rel = repo.resolve(String(body.path || ''))
        if (!rel) throw fault('INVALID_PATH', '请选择文档或目录', 400)
        assertVisible(rel)
        abs = safeResolve(rel)
        if (inReader(abs)) throw fault('FORBIDDEN', '无法打开阅读器内部文件', 403)
      }
      let stat
      try { stat = fs.statSync(abs) } catch { throw fault('NOT_FOUND', '文件已不存在', 404) }
      if (!stat.isDirectory() && (!stat.isFile() || !/\.(md|pdf|html?)$/i.test(abs))) throw fault('INVALID_PATH', '只能定位文档或目录', 400)
      await revealInFileManager(abs, stat.isDirectory())
      if (body.previewId && body.sourcePath) repo.db.prepare('UPDATE workspace_previews SET source_path=? WHERE id=?').run(abs, String(body.previewId))
      return send(res, 200, { ok: true })
    }
    const id=body.id||url.searchParams.get('id')
    if(id && !key.includes('agent-keys') && !key.includes('workspace-preview')) {
      const n=repo.byId(id);if(!n)throw fault('NOT_FOUND','文档不存在',404)
      if(req.method==='GET')url.searchParams.set('path',n.path);else body.path=n.path
    }
    if(agent){
      const allowed=new Set(['GET /me','GET /agent-libs','GET /tree','GET /doc','GET /metadata','GET /resolve','GET /history','GET /search','GET /sources','POST /sources','POST /doc','PUT /doc','PATCH /doc','PUT /metadata','POST /asset','PUT /move/doc','DELETE /doc','GET /file'])
      if(!allowed.has(key))throw fault('FORBIDDEN','Agent 无权执行此操作',403)
      if(req.method!=='GET'&&!JSON.parse(agent.permissions).includes('write'))throw fault('FORBIDDEN','此 Agent 只有读取权限',403)
      const scopes=JSON.parse(agent.scopes).map(x=>repo.byId(x)?.path).filter(Boolean)
      ctx.agentScopes=scopes
      const assetScope=assets.find(url.searchParams.get('path')||'',url.searchParams.get('asset'));
      const fields=[assetScope&&repo.byId(assetScope.owner)?.path,body.path,body.file,body.dir,url.searchParams.get('path'),url.searchParams.get('lib')].filter(Boolean)
      if(!fields.length && !['GET /me','GET /agent-libs'].includes(key))throw fault('SCOPE_REQUIRED','请指定已授权知识库或文档',400)
      for(const field of fields){const rel=repo.resolve(field);if(!scopes.some(p=>rel===p||rel.startsWith(p+'/')))throw fault('FORBIDDEN','超出 Agent 授权范围',403)}
      ctx.actor='agent:'+agent.id
    }
    if (key === 'GET /backups' || key === 'POST /backups') {
      if (role !== 'owner' || ctx.agentScopes || !localFileManagerRequest(req)) throw fault('FORBIDDEN', '备份管理仅限本机使用', 403)
      let data
      if (req.method === 'GET') data = backups.list()
      else if (body.action === 'create') data = backups.create()
      else if (body.action === 'restore') data = await backups.restore(String(body.backupId || ''))
      else if (body.action === 'open') data = await backups.open(String(body.restoredId || ''))
      else if (body.action === 'reveal') { backups.list(); await revealInFileManager(backups.directory, true); data = {} }
      else throw fault('INVALID_ACTION', '未知备份操作')
      return send(res,200,{ok:true,data})
    }
    if (key === 'GET /public-session' || key === 'POST /public-session') {
      if (role !== 'owner') throw fault('FORBIDDEN', '需要管理身份', 403)
      const data = req.method === 'GET' ? publicSharing.status() : await publicSharing.control(body.action)
      return send(res, 200, { ok: true, data: { ...data, busy: false } })
    }
    if (key.includes('/trash') && role !== 'owner') throw fault('FORBIDDEN', '回收站仅供管理者使用', 403)
    if(['GET /agent-keys','POST /agent-keys','DELETE /agent-keys','GET /audit','GET /metadata-export','GET /reconcile','POST /reconcile','GET /history'].includes(key)&&role!=='owner')throw fault('FORBIDDEN','需要管理身份',403)
    if (key.endsWith('/sources') && role !== 'owner') throw fault('FORBIDDEN', '来源记录仅供管理者查看', 403)
    if ((key.startsWith('GET /workspace-preview') || key === 'GET /icon-history') && role !== 'owner') throw fault('FORBIDDEN', '私人资料仅供管理者使用', 403)

    if (key === 'DELETE /session') {
      res.setHeader('Set-Cookie', 'reader_session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0')
      return send(res, 200, { ok: true })
    }
    if (key === 'POST /session') {
      verifyPassword(req, body.password)
      const embeddedLocal = ['localhost', '127.0.0.1'].includes(String(req.headers.host || '').split(':')[0])
      const cookiePolicy = embeddedLocal ? '; SameSite=None; Secure' : '; SameSite=Strict' + (req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '')
      res.setHeader('Set-Cookie', 'reader_session=' + share.token('owner') + '; Path=/; HttpOnly' + cookiePolicy)
      return send(res, 200, { ok: true, data: { role: 'owner' } })
    }
    if (key === 'PUT /access') {
      if (role !== 'owner') throw fault('FORBIDDEN', '访客不能修改公开权限', 403)
      const rel = String(body.path || '')
      if (rel.split('/')[0] === '草稿' && body.shared === true) throw fault('PRIVATE_DRAFT', '草稿不能公开，请先移到正式知识库', 400)
      if (!rel) throw new Error('缺少路径')
      assertVisible(rel)
      if (!fs.existsSync(safeResolve(rel))) throw new Error('内容不存在')
      if (Number(typeof body.locked === 'boolean') + Number(typeof body.shared === 'boolean') !== 1) throw new Error('每次只更改一个权限设置')
      await repo.mutate('PUT /access',role,async()=>{
        if (typeof body.locked === 'boolean') share.setLocked(rel, body.locked)
        if (typeof body.shared === 'boolean') share.setShared(rel, body.shared)
      })
      return send(res, 200, { ok: true, data: share.status(rel) })
    }
    if (isGuest && ['GET /share', 'GET /build'].includes(key)) throw new Error('请先验证管理密码')
    if (key === 'GET /workspace-preview-asset') {
      const id = String(url.searchParams.get('id') || '')
      const asset = String(url.searchParams.get('asset') || '')
      if (!/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{32}$/.test(asset)) throw fault('INVALID_IMAGE', '图片地址无效')
      const item = repo.db.prepare('SELECT mime FROM workspace_preview_assets WHERE preview=? AND id=?').get(id, asset)
      if (!item || !repo.db.prepare('SELECT id FROM workspace_previews WHERE id=?').get(id)) throw fault('NOT_FOUND', '图片不存在', 404)
      const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }[item.mime]
      return sendFile(req, res, '.reader/previews/' + id + '/' + asset + ext, { allowStorage: true })
    }
    if (key === 'GET /file') {
      let rel=url.searchParams.get('path')||''
      let resource=assets.find(rel,url.searchParams.get('asset'))
      if(!resource && rel.includes('/.配图/')) {
        const doc=url.searchParams.get('doc')||''
        if(doc && fs.existsSync(safeResolve(doc))) { assertMd(doc); assets.legacy(doc); resource=assets.find(rel) }
      }
      if(resource) {
        const owner=repo.byId(resource.owner)
        if(!owner || owner.path.split('/').some(x=>x.startsWith('.')) || !fs.existsSync(safeResolve(owner.path)) || (isGuest && !share.isShared(owner.path))) throw fault('FORBIDDEN','内容不可访问',403)
        return sendFile(req,res,resource.path,{allowAsset:true,allowStorage:true})
      }
      if(rel.includes('/.配图/') || rel.startsWith('.reader/')) throw fault('FORBIDDEN','资源归属无法确认',403)
      rel=repo.resolve(rel)
      if(isGuest && !share.isShared(rel)) throw fault('FORBIDDEN','内容不可访问',403)
      return sendFile(req,res,rel,{allowTranslate:true})
    }
    for (const field of ['path','file','lib']) { const v=url.searchParams.get(field);if(v)url.searchParams.set(field,repo.resolve(v)) }
    const handler = routes[key]
    if (!handler) return send(res, 404, { ok: false, error: '接口不存在' })
    if (req.method !== 'GET' && !key.includes('agent-keys') && key!=='POST /reconcile') checkWrite(key, body, role)
    if (isGuest) {
      const rel = url.searchParams.get('path') || url.searchParams.get('lib') || url.searchParams.get('file') || ''
      if (rel && !share.isShared(rel)) throw new Error('内容不可访问')
    }
    const requestId=String(req.headers['idempotency-key']||body.requestId||'')
    if(requestId.length>160)throw fault('INVALID_REQUEST','操作编号过长')
    const retryKey=(ctx.actor||role)+':'+requestId, fingerprint=digest(key+JSON.stringify(body))
    const run=async()=>{
      if(requestId&&req.method!=='GET'){
        const old=repo.db.prepare('SELECT * FROM retries WHERE key=?').get(retryKey)
        if(old){if(old.fingerprint!==fingerprint)throw fault('IDEMPOTENCY_CONFLICT','同一操作编号不能用于不同内容',409);return JSON.parse(old.result)}
      }
      const value=await handler(body,url,{role,agentScopes:ctx.agentScopes})
      if(requestId&&req.method!=='GET')repo.db.prepare('INSERT INTO retries VALUES (?,?,?)').run(retryKey,fingerprint,JSON.stringify(value))
      return value
    }
    const out = req.method === 'GET' ? await run() : await repo.mutate(key,ctx.actor||role,run)
    if (key === 'GET /tree' && out?.data?.nodes) out.data.nodes = share.decorate(isGuest ? share.filterTree(out.data.nodes) : out.data.nodes)
    send(res, 200, out)
  } catch (e) {
    send(res, e.status || 403, { ok:false, code:e.code || 'REQUEST_REJECTED', error:String(e.message||e), ...(e.details ? {details:e.details}: {}) })
  }
}

export default function contentApi() {
  return {
    name: 'content-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1')
        // 本机 dev：默认就是我；带了 guest token 就变成别人（方便在同一个端口上验访客视角）
        return handleApi(req, res, { role: roleOf(req, url, share) })
      })
    },
  }
}

export { share, DOCS_ROOT }
