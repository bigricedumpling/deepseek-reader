/**
 * 本地内容读写接口。
 *
 * ★ 磁盘是文档树的唯一真源：目录 = 分类，.md 文件 = 文档，文件名 = 文档名。
 *   这里不存任何清单文件，所以不存在"清单和磁盘对不上"这回事 ——
 *   在 Finder 里改名、换目录、新建、删除，下一次 GET /tree 就跟着变，没有同步逻辑。
 *
 * 正文里的一级标题只是正文内容，不参与命名。历史上一版把它当成了名字的真源：
 * 保存时"正文一级标题 → 侧栏名"单向同步，而改名接口又不动正文，
 * 于是改完名一保存就被弹回去。现在名字只有一个来源（文件名），这类问题不会再出现。
 *
 * 只在 127.0.0.1 上跑，不做鉴权；所有写操作都限制在 DOCS_ROOT 之内。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createShare, roleOf } from './share.js'

// 用文件自身位置推导，不依赖启动时的工作目录
const READER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOCS_ROOT = path.resolve(READER_ROOT, '..')
/** 分享状态（谁能看到什么）：只有两种身份，见 server/share.js */
const share = createShare(DOCS_ROOT)

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
  return abs
}

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
function assertVisible(rel, { allowTranslate = false } = {}) {
  const segs = String(rel || '').split('/').filter(Boolean)
  const bad = segs.some((x) => x.startsWith('.') && !(allowTranslate && x === TRANSLATE_DIR))
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
  if (!/\.(md|pdf)$/i.test(abs)) throw new Error('只能操作 md 或 pdf 文件: ' + rel)
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
      folders.push({ type: 'folder', name: e.name, path: childRel, children: scanDir(childAbs, childRel, depth + 1, order) })
    } else if (e.isFile() && /\.(md|pdf)$/i.test(e.name)) {
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
        type: isPdf ? 'pdf' : 'doc',
        name: e.name.replace(/\.(md|pdf)$/i, ''),
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

function readOrder() {
  try {
    const data = JSON.parse(fs.readFileSync(ORDER_FILE, 'utf8'))
    return data && typeof data === 'object' && data.order && typeof data.order === 'object' ? data.order : {}
  } catch {
    return {}
  }
}

function writeOrder(order) {
  fs.writeFileSync(ORDER_FILE, JSON.stringify({ order }, null, 1), 'utf8')
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

function readColWidths() {
  try {
    const data = JSON.parse(fs.readFileSync(COLW_FILE, 'utf8'))
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function writeColWidths(data) {
  fs.writeFileSync(COLW_FILE, JSON.stringify(data, null, 1), 'utf8')
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
const SECTION_WORD = /^(abstract|introduction|related work|background|method|methods|methodology|approach|experiment|experiments|evaluation|results|analysis|discussion|limitations|conclusion|conclusions|references|appendix|acknowledg)/i

/**
 * 顺序文件里用的名字：目录就是目录名，文档用带扩展名的文件名。
 * （节点上的 name 是去掉扩展名的，不能拿来当键 —— 「术语表.md」和叫「术语表」的目录会撞。）
 */
function entryKey(node) {
  return node.type === 'folder' ? node.name : path.posix.basename(node.file)
}

/** 把一页的文字按 y 归成行 */
function pdfLines(items) {
  const rows = []
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue
    const y = it.transform[5]
    let row = rows.find((r) => Math.abs(r.y - y) <= 3)
    if (!row) {
      row = { y, parts: [], size: 0 }
      rows.push(row)
    }
    row.parts.push(it.str)
    if ((it.height || 0) > row.size) row.size = it.height || 0
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => ({ text: r.parts.join('').replace(/\s+/g, ' ').trim(), size: r.size }))
}

/**
 * 有些 pdf 根本没有书签（腾讯混元那篇 ArtifactsBench 就是），
 * 那就退一步：从正文里认章节标题。
 *
 * 判据三条一起用，尽量只在真标题上命中：
 *   1. 字号明显大于这一页的正文（大 12% 以上）
 *   2. 一行很短（不超过 90 字）
 *   3. 长得像标题：`1 Introduction` / `2.1 Method` 这种编号开头，或者 Abstract 这类固定词
 * 层级按编号的点数算（1 → 一级，1.1 → 二级），固定词算一级。
 */
async function pdfTocFromText(doc) {
  const toc = []
  const pages = Math.min(doc.numPages, 80)
  for (let p = 1; p <= pages; p++) {
    let lines
    try {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      lines = pdfLines(tc.items)
    } catch {
      continue
    }
    if (!lines.length) continue
    // 这一页的正文字号：按字符数加权取众数
    const weight = new Map()
    for (const l of lines) weight.set(l.size, (weight.get(l.size) || 0) + l.text.length)
    let body = 0
    let best = -1
    for (const [size, n] of weight) if (n > best) { best = n; body = size }
    for (const l of lines) {
      if (!l.text || l.text.length > 90) continue
      // 纯页码、arXiv 页眉这些不是标题
      if (/^\d+$/.test(l.text) || /^arXiv:/i.test(l.text)) continue
      const numbered = /^(\d+(?:\.\d+)*)\s*\S/.test(l.text)
      const big = l.size >= body * 1.12
      // 字号跟正文一样大的小节标题（`4.1 Evaluation Setup`、`3.1Fine-Grained Checklists`）也认：
      // 带小节编号、短、编号后面是大写字母或汉字、结尾不带句读。
      // 这样就排掉了纯数字的表格行（4.1 3.2 1.0）和正文里的 `3.5x faster than ...`。
      const smallSub = /^\d+\.\d+(?:\.\d+)*\s*[A-Z\u4e00-\u9fa5][^.|,;:]{0,58}$/.test(l.text)
      if (!smallSub && !(big && (numbered || SECTION_WORD.test(l.text)))) continue
      const m = l.text.match(/^(\d+(?:\.\d+)*)\s*(.*)$/)
      const title = m ? (m[1] + ' ' + m[2]).trim() : l.text
      const level = m ? Math.min(m[1].split('.').length, 3) : 1
      toc.push({ level, title, page: p })
    }
  }
  return toc
}

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

  const outline = await doc.getOutline()
  const toc = []
  const walk = async (items, level) => {
    for (const it of items || []) {
      let page = 0
      try {
        let dest = it.dest
        if (typeof dest === 'string') dest = await doc.getDestination(dest)
        if (Array.isArray(dest) && dest[0]) page = (await doc.getPageIndex(dest[0])) + 1
      } catch {
        /* 有的书签指不到具体页，那就不给页码，点了不跳 */
      }
      toc.push({ level: Math.min(level, 3), title: String(it.title || '').trim(), page })
      if (it.items && it.items.length) await walk(it.items, level + 1)
    }
  }
  await walk(outline, 1)
  // 没有书签的 pdf（不少论文都这样）就从正文里认标题
  const source = toc.length ? 'outline' : 'text'
  const finalToc = toc.length ? toc : await pdfTocFromText(doc)
  await task.destroy()
  pdfTocCache.set(rel, { mtime: st.mtimeMs, toc: finalToc, source, pages: doc.numPages })
  return { toc: finalToc, source, pages: doc.numPages }
}

/* ---------- 删除保护 ---------- */

/**
 * 删除一律走这里：不真删，挪进 .回收站 并加时间戳。
 * 文件和目录都能丢进来，误删了还能自己捞回来，不至于把面试资料搞丢。
 */
function moveToTrash(rel) {
  if (!rel) throw new Error('不能删根目录')
  const abs = safeResolve(rel)
  if (!fs.existsSync(abs)) return null
  const dir = path.join(DOCS_ROOT, TRASH)
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  let target = path.join(dir, stamp + '__' + path.basename(abs))
  let i = 2
  while (fs.existsSync(target)) {
    target = path.join(dir, stamp + '__' + i + '__' + path.basename(abs))
    i++
  }
  fs.renameSync(abs, target)
  return path.relative(DOCS_ROOT, target)
}

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

/* ---------- 请求体 ---------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
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

const routes = {
  /** 这次请求算谁：我 还是 别人。前端靠它决定要不要露出编辑相关的东西 */
  'GET /me': async (_body, _url, ctx) => ({ ok: true, data: { role: ctx.role } }),

  /** 分享设置（只有我能读写） */
  'GET /share': async (_body, _url, ctx) => {
    if (ctx.role !== 'owner') throw new Error('只有你能看分享设置')
    return { ok: true, data: share.snapshot() }
  },

  /** 勾选 / 取消某个节点对外可见（子级继承，见 share.js） */
  'PUT /share': async (body, _url, ctx) => {
    if (ctx.role !== 'owner') throw new Error('只有你能改分享设置')
    const rel = String(body.path || '')
    if (!rel) throw new Error('缺 path')
    assertVisible(rel)
    share.setShared(rel, !!body.shared)
    if (body.editable !== undefined) share.setEditable(rel, !!body.editable)
    return { ok: true, data: share.snapshot() }
  },

  /** 整棵树：直接扫盘，附每个文件的修改时间与大小 */
  'GET /tree': async () => {
    scanned = 0
    return { ok: true, data: { nodes: scanDir(DOCS_ROOT, '', 0, readOrder()) } }
  },

  /** 读一篇文档 */
  'GET /doc': async (_body, url) => {
    const rel = url.searchParams.get('path') || ''
    const abs = assertMd(rel)
    if (!fs.existsSync(abs)) throw new Error('文档不存在: ' + rel)
    return { ok: true, data: { path: rel, content: fs.readFileSync(abs, 'utf-8') } }
  },

  /** 保存一篇文档 */
  'PUT /doc': async (body) => {
    const abs = assertMd(body.path)
    if (!fs.existsSync(abs)) throw new Error('文档不存在: ' + body.path)
    fs.writeFileSync(abs, String(body.content ?? ''), 'utf-8')
    return { ok: true, savedAt: Date.now() }
  },

  /** 新建文档：dir 为空串表示根目录 */
  'POST /doc': async (body) => {
    const dir = assertDir(body.dir)
    const name = safeName(body.name)
    if (!name) throw new Error('文档名不能为空')
    fs.mkdirSync(safeResolve(dir), { recursive: true })
    const file = uniqueFile(dir, name)
    fs.writeFileSync(safeResolve(file), String(body.content ?? '# ' + name + '\n'), 'utf-8')
    return { ok: true, data: { name: path.basename(file, '.md'), file } }
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
        fs.renameSync(absOld, tmp)
        fs.renameSync(tmp, absNew)
      } else {
        fs.renameSync(absOld, absNew)
      }
    }
    moveColWidths(body.path, next)
    removeFromOrder(dir === '.' ? '' : dir, path.basename(body.path))
    return { ok: true, data: { name, file: next } }
  },

  /** 删除文档，挪进回收站 */
  'DELETE /doc': async (body) => {
    const abs = assertFile(body.path)
    if (!fs.existsSync(abs)) throw new Error('文档不存在: ' + body.path)
    const moved = moveToTrash(body.path)
    dropColWidthsUnder(body.path)
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
    fs.mkdirSync(abs, { recursive: true })
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
    fs.renameSync(absOld, absNew)
    remapColWidthsUnder(rel + '/', next + '/')
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
      .filter((e) => (e.isDirectory() && !SKIP_DIRS.has(e.name)) || (e.isFile() && /\.(md|pdf)$/i.test(e.name)))
      .map((e) => e.name)
    const names = Array.isArray(body.names) ? body.names.map(String) : []
    if (names.length !== existing.length || new Set(names).size !== names.length || names.some((n) => !existing.includes(n))) {
      throw new Error('顺序列表跟磁盘上的条目对不上，拒绝写入')
    }
    const isFile = (n) => /\.(md|pdf)$/i.test(n)
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
    fs.mkdirSync(safeResolve(toParent), { recursive: true })
    fs.renameSync(absOld, absNew)
    remapColWidthsUnder(rel + '/', next + '/')
    remapOrderUnder(rel, next)
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
    fs.mkdirSync(safeResolve(dir), { recursive: true })
    // 扩展名要保住：pdf 用 basename(x, '.md') 会变成「xxx.pdf.md」
    const fileName = path.basename(body.file)
    const ext = path.extname(fileName) || '.md'
    const base = fileName.slice(0, fileName.length - ext.length) || fileName
    const next = uniqueFile(dir, base, ext)
    fs.renameSync(absOld, safeResolve(next))
    moveColWidths(body.file, next)
    removeFromOrder(fromDir === '.' ? '' : fromDir, path.basename(body.file))
    return { ok: true, data: { file: next } }
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
export async function handleApi(req, res, ctx = {}) {
  const url = new URL(req.url, 'http://127.0.0.1')
  /*
   * 两个入口的前缀不一样：dev 的中间件挂在 '/api' 上、会把前缀剥掉，
   * 独立服务器是直接收原始请求（带 /api）。这里统一剥一次，两边行为完全一致。
   */
  if (url.pathname.startsWith('/api/')) url.pathname = url.pathname.slice(4)
  const key = req.method + ' ' + url.pathname
  const role = ctx.role || 'owner'
  const isGuest = role !== 'owner'

  if (role === 'denied') {
    return send(res, 403, { ok: false, error: '禁止访问：请用 /edit 或 /onlyread 打开' })
  }
  if (isGuest && req.method !== 'GET') {
    return send(res, 403, { ok: false, error: '这份是只读分享，你没有编辑权限' })
  }
  // 只有我能碰的东西
  if (isGuest && (key === 'GET /share' || key === 'GET /build' || key === 'PUT /share')) {
    return send(res, 403, { ok: false, error: '只有库的主人能看这个' })
  }

  // 文件流不进 routes：它要把原始字节转发出去，不走 JSON 那条路
  if (key === 'GET /file') {
    try {
      const rel = url.searchParams.get('path') || ''
      if (isGuest && !share.isShared(rel)) throw new Error('这个文件没有对外分享')
      return sendFile(req, res, rel, { allowTranslate: true })
    } catch (e) {
      return send(res, 400, { ok: false, error: String(e.message || e) })
    }
  }

  const handler = routes[key]
  if (!handler) return send(res, 404, { ok: false, error: '没有这个接口: ' + key })

  try {
    // 访客：凡是带 path 的接口，路径必须是分享出去的
    if (isGuest) {
      const rel = url.searchParams.get('path') || ''
      if (rel && !share.isShared(rel)) throw new Error('这篇没有对外分享')
    }
    const body = req.method === 'GET' ? {} : await readBody(req)
    const out = await handler(body, url, { role })
    // 树是唯一一处"要加工结果"的接口：访客拿到的是剪掉过的版本
    if (isGuest && key === 'GET /tree' && out && out.data && Array.isArray(out.data.nodes)) {
      out.data.nodes = share.filterTree(out.data.nodes)
    }
    send(res, 200, out)
  } catch (e) {
    send(res, 400, { ok: false, error: String(e.message || e) })
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
