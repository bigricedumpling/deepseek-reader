/* 同 editor-shortcuts：改了这个文件也要整页刷新，否则跑的还是旧的保存逻辑 */
if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload())
}
import MarkdownIt from 'markdown-it'

/**
 * Crepe 序列化 markdown 时会做一批改动，内容多数不受影响，但源码会变样、体积能翻倍，
 * 而且表格单元格里的内联 HTML（比如 <br>）会被直接丢掉。
 *
 * 存回磁盘之前做三件事：
 *   1. 把纯外观的改动还原：*** 还原成 ---、去掉表格对齐空格、拆掉自动链接的尖括号、去掉多余转义
 *   2. 表格单元格逐个跟原文比对，内容没变的就整格沿用原文，把 <br> 之类的东西保住
 *   3. 无序列表的符号按原文换回来，行尾空白按原文补回来，结尾换行跟原文对齐
 *
 * 第二步是关键：编辑器吐出来的单元格文本如果和原文去掉 <br> 之后一样，
 * 说明用户没动过这一格，那就该用原文，而不是编辑器简化过的版本。
 */

/**
 * 比对用的规范化。
 *
 * 只剥 <br>，不能剥掉所有标签：正文里 `p<0.001` 这种写法会被 `<[^>]+>` 当成标签吃掉半行，
 * 比对不上就丢掉整格，单元格里的分行全没了。转义和自动链接也要一并还原，
 * 编辑器会给 @ _ 之类加反斜杠，还会把裸链接包进尖括号。
 */
/**
 * 编辑器会改、但看着一模一样的三类写法，比对时要抹平 —— 抹平了才能认出
 * "这一行用户没动过"，从而整行沿用原文：
 *
 *   1. 自动链接：原文 [url](url) 会被写成 <url>
 *   2. 图片替代文字：原文 ![逐轮评分与理由](url) 会被写成 ![1.00](url)
 *      图还是那张图，但 alt 文字被换成了缩放比例
 *   3. 转义、列表符号、表格空格
 *
 * 只动语法外壳，正文一个字不碰 —— 用户真改了内容就匹配不上，
 * 那一行会保持用户改过的样子。
 */
/*
 * 列表符号统一。
 *
 * 编辑器一律把 - 和 + 写成 *，而且引用块里还多一层 ">"：
 *   原文 "> - 跑过"   →   往返 "> * 跑过"
 * 只认行首的 [-*+] 会漏掉带引用的那行，于是整行被判成"改过"、
 * 原文的 "-" 也换不回来。这里允许行首有任何数量的 ">" 与空白。
 */
const unifyBullet = (s) => String(s).replace(/^((?:\s*>\s*)*)([-*+])(\s+)/, '$1-$3')

const mediaKey = (s) =>
  String(s)
    /* ![alt](url) → 只留 url：alt 被编辑器换掉是常态 */
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '![]($2)')
    /* [text](url) 与 <url> 指向同一个目标，统一成裸 url */
    .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '$2')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')

const cellKey = (s) =>
  mediaKey(String(s))
    .replace(/<br\s*\/?>/gi, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!~$@|])/g, '$1')
    .replace(/\s+/g, '')

const FENCE = /^\s*(`{3,}|~{3,})/

/**
 * 编辑器会给可能被当成 markdown 语法的字符加反斜杠，`223.104.*` 会变成 `223.104.\*`。
 *
 * 哪些反斜杠该留、哪些是编辑器自己加的，看原文决定：原文里从来没出现过 `\X`，
 * 那 `\X` 就是编辑器加的，去掉；原文自己用了 `\X`，说明是有意转义，原样保留。
 *
 * 只认 markdown 的标点转义，字母一律不动。LaTeX 的 `\frac` 和代码块里的 `\d`
 * 要是被当成多余转义剥掉，公式和正则就全毁了。
 */
const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/

function escapeStripper(original) {
  const intentional = new Set()
  if (original) for (const m of String(original).matchAll(/\\([\s\S])/g)) intentional.add(m[1])
  return (s) =>
    s.replace(/\\([\s\S])/g, (whole, ch) =>
      ESCAPABLE.test(ch) && !intentional.has(ch) ? ch : whole
    )
}

/**
 * 单元格被改过之后，把换行重新锚回去。
 *
 * 原文被 <br> 切成若干段，改动通常只发生在某一段内部，其余段落还是老样子。
 * 每个断点夹在两段之间，两边都能当锚：前一段还在就挂在它结尾，前一段被改了就挂到
 * 后一段开头。只认一边的话，改首段会丢掉它后面那个断点，改末段会丢掉它前面那个。
 *
 * 两边都对不上的断点直接放弃，不至于因为一处对不上就把整格的换行全丢了。
 */
function reanchorBreaks(originalCell, edited) {
  const segs = String(originalCell)
    .split(/<br\s*\/?>/i)
    .map((s) => s.trim())
    .filter(Boolean)
  if (segs.length < 2) return null

  /* 每段在改后文本里的起点，找不到记 -1 */
  const pos = []
  let cursor = 0
  for (const seg of segs) {
    const at = edited.indexOf(seg, cursor)
    pos.push(at)
    if (at !== -1) cursor = at + seg.length
  }

  const cuts = []
  for (let i = 1; i < segs.length; i++) {
    const prevEnd = pos[i - 1] === -1 ? -1 : pos[i - 1] + segs[i - 1].length
    const at = prevEnd !== -1 ? prevEnd : pos[i]
    if (at !== -1) cuts.push(at)
  }
  if (!cuts.length) return null

  let out = ''
  let last = 0
  for (const c of [...new Set(cuts)].sort((a, b) => a - b)) {
    if (c < last) continue
    out += edited.slice(last, c) + '<br>'
    last = c
  }
  return out + edited.slice(last)
}

/**
 * 整行还原：一行只差"空白"或"自动链接的尖括号"时，整行照原文。
 *
 * 编辑器会干这几件事：给有序列表的续行加缩进、把 <https://x> 和 https://x 互相改、
 * 表格行补对齐空格。这些都不动文字，所以判据可以很紧：把尖括号拆掉、两端空白去掉之后
 * 完全一致，才算用户没动过这一行，那就整行沿用原文（连原文的空格和尖括号一起）。
 *
 * 内容只要有一个字不一样就不认 —— 用户改过的行永远保持用户改的样子。
 * 同一行内容出现多次就按出现顺序排队取，纯空白行不管。
 */
function restoreOriginalLines(lines, original) {
  if (!original) return lines

  /*
   * 比对用的键：拆掉自动链接尖括号、列表符号统一成 -、表格行里的空格折叠掉。
   * 这几样都是编辑器会改、但看着一模一样的东西，正文一个字不同就不会匹配上。
   */
  const strip = (s) => {
    /* 先抹平图片 alt 与链接写法（见 mediaKey 的说明），再管尖括号和列表符号 */
    let out = mediaKey(s)
    out = unifyBullet(out)
    if (out.trimStart().startsWith('|')) out = out.replace(/\s+/g, ' ')
    return out.trim()
  }
  const queues = new Map()
  for (const line of String(original).split('\n')) {
    const body = strip(line).trim()
    if (!body) continue
    if (!queues.has(body)) queues.set(body, [])
    queues.get(body).push(line)
  }
  if (!queues.size) return lines

  return lines.map((line) => {
    const body = strip(line).trim()
    if (!body) return line
    const queue = queues.get(body)
    return queue && queue.length ? queue.shift() : line
  })
}

/**
 * 空行排布也照原文。
 *
 * 编辑器会在表格前后补空行，也会把某些空行吃掉。这类差异只动空行，
 * 所以判据可以做成"可证明安全"的：**非空行逐字节全都一样**时，
 * 直接整篇采用原文的行序列（空行、行尾都回原样）。
 * 只要有一行正文对不上就不动 —— 那说明还有别的差异，交给 lossy 判定去回落源码模式。
 */
function adoptOriginalSpacing(lines, original) {
  if (!original) return lines
  const orig = String(original).split('\n')
  const a = lines.filter((l) => l.trim() !== '')
  const b = orig.filter((l) => l.trim() !== '')
  if (a.length !== b.length) return lines
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return lines
  return orig
}

/**
 * @param {{ spacing?: boolean }} options
 *   spacing=true（默认）：原文的空行排布也照抄 —— 给"编辑器能不能表达这篇"的往返检查用。
 *   spacing=false：只做逐行还原，空行结构保持编辑器（也就是用户）现在的样子 —— 保存时用这个，
 *   否则用户删掉一个空行、把两段并成一段这类操作会被偷偷还原回去。
 */
/**
 * 逐行比出"原文"和"编辑器还原后的样子"差在哪，给界面和命令行用。
 *
 * 有损的时候只丢一句"这篇里有编辑器表达不了的结构"是没法决策的：
 * 用户要知道到底是哪一行、差在哪，才能判断"要不要按编辑器规范重排这篇"。
 * 返回最多 limit 处差异，每处给出行号和两侧的内容。
 */
export function diffLines(original, out, limit = 8) {
  const a = String(original ?? '').split('\n')
  const b = String(out ?? '').split('\n')
  const diffs = []
  let i = 0
  let j = 0
  while ((i < a.length || j < b.length) && diffs.length < limit) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    diffs.push({ line: i + 1, original: a[i] === undefined ? null : a[i], out: b[j] === undefined ? null : b[j] })
    // 对齐：找下一个相同行，找不到就各自前进一行
    const ni = a[i] === undefined ? -1 : b.indexOf(a[i], j + 1)
    const nj = b[j] === undefined ? -1 : a.indexOf(b[j], i + 1)
    if (nj >= 0 && (ni < 0 || nj - i <= ni - j)) i = nj
    else if (ni >= 0) j = ni
    else {
      i++
      j++
    }
  }
  return diffs
}

export function normalizeMarkdown(input, original, { spacing = true } = {}) {
  const src = String(input ?? '')
  const escape = escapeStripper(original)
  /* 先把编辑器加的尖括号一律拆掉，原文写没写交给下面的整行还原去对齐 */
  const unautolink = (s) => s.replace(/<(https?:\/\/[^>\s]+)>/g, '$1')

  const splitCells = (line) =>
    line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((c) => c.trim())

  const push = (map, k, row) => {
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(row)
  }
  const take = (map, k) => {
    const q = map.get(k)
    return q && q.length ? q.shift() : null
  }

  /*
   * 原文的表格行。
   *
   * 同一行内表格的首格经常重复（比如都写同一个方案名），只按首格建索引会让整行互相覆盖，
   * 所以每个键后面挂一条队列，按出现顺序取。整行的键优先，取不到再退回首格。
   */
  const byRow = new Map()
  const byRowLine = new Map()
  const byFirst = new Map()

  /* 原文无序列表的符号，同样按出现顺序排队 */
  const bullets = []

  let dashRule = false
  let fence = null

  if (original) {
    for (const line of String(original).split('\n')) {
      const f = line.match(FENCE)
      if (f) {
        if (!fence) fence = f[1][0]
        else if (f[1][0] === fence) fence = null
        continue
      }
      if (fence) continue

      if (/^-{3,}$/.test(line.trim())) dashRule = true

      const b = line.match(/^((?:\s*>\s*)*)([-*+])\s+(.*)$/)
      if (b) bullets.push([b[2], cellKey(b[3])])

      if (!line.startsWith('|') || /^\|[\s\-:|]+\|$/.test(line.trim())) continue
      const cells = splitCells(line)
      if (!cells.length) continue
      const sig = cells.map(cellKey).join('\u0000')
      push(byRow, sig, cells)
      push(byRowLine, sig, line)
      push(byFirst, cellKey(cells[0]), cells)
    }
  }

  let bi = 0
  fence = null
  const out = []

  for (const line of src.split('\n')) {
    // 代码块原样穿过，里面的 | 和 - 不是表格和列表
    const f = line.match(FENCE)
    if (f) {
      if (!fence) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      out.push(line)
      continue
    }
    if (fence) {
      out.push(line)
      continue
    }

    if (line.startsWith('|')) {
      // 分隔行统一
      if (/^\|[\s\-:|]+\|$/.test(line.trim())) {
        out.push('|' + '---|'.repeat(line.trim().split('|').length - 2))
        continue
      }
      const parts = line.split(/(?<!\\)\|/)
      const lead = parts[0]
      const trail = parts[parts.length - 1]
      const cells = splitCells(line)
      const from = take(byRow, cells.map(cellKey).join('\u0000')) || take(byFirst, cellKey(cells[0]))

      const merged = cells.map((cell, i) => {
        const plain = unautolink(cell)
        if (!from || from[i] === undefined) return plain
        // 原文同一格去掉 <br> 之后跟它一样，说明用户没改过这一格，沿用原文
        if (cellKey(from[i]) === cellKey(plain)) return from[i]
        // 改过了，但换行点大多还在，尽量锚回去，别让用户一编辑就把整格的分行丢掉
        return reanchorBreaks(from[i], plain) || plain
      })

      /*
       * 每一格都跟原文对得上，就整行照抄原文。
       *
       * 重建这一行时固定会写成 " |"（竖线前带一个空格），而原文可能是 "）|"（紧贴着），
       * 于是"内容一个字没改"的表格行也会平白多出几个字节 —— 表现得就是这篇文档被判成
       * 有损、回落到源码编辑。整行照抄既逐字节一致，也顺手保住了格子里的 <br>。
       */
      const sig = cells.map(cellKey).join('\u0000')
      const srcLine = from ? take(byRowLine, sig) : null
      const untouched = !!srcLine && from.length === cells.length && merged.every((cell, i) => cell === from[i])
      if (untouched) {
        out.push(srcLine)
        continue
      }
      out.push(lead + '| ' + merged.join(' | ') + ' |' + trail.replace(/\s+$/, ''))
      continue
    }

    if (/^\*{3,}$/.test(line.trim())) {
      out.push(dashRule ? '---' : '***')
      continue
    }

    // 编辑器一律把 - 和 + 写成 *，文字没动过的就换回原文的符号
    const b = line.match(/^(\s*)\*(\s+.*)$/)
    if (b) {
      let marker = null
      if (bullets[bi] && bullets[bi][1] === cellKey(b[2])) {
        marker = bullets[bi][0]
        bi++
      }
      out.push(marker && marker !== '*' ? b[1] + marker + b[2] : line)
      continue
    }

    if (/^\s*[-+]\s+/.test(line)) bi++

    out.push(unautolink(line))
  }

  const lines = restoreOriginalLines(escape(out.join('\n')).split('\n'), original)
  const finalLines = spacing ? adoptOriginalSpacing(lines, original) : lines
  const text = finalLines.join('\n').replace(/\n+$/, '')
  // 编辑器会省略文末的空白段落。初始化往返检查时保留原来的占位，
  // 避免仅因最后一个 <br /> 就把完整图文降级为源码；实际编辑不恢复已删空行。
  if (spacing && original) {
    const originalLines = String(original).split('\n')
    let removedBreak = false
    while (originalLines.length && (!originalLines.at(-1).trim() || /^\s*<br\s*\/?>\s*$/i.test(originalLines.at(-1)))) {
      if (originalLines.pop().trim()) removedBreak = true
    }
    if (removedBreak && originalLines.join('\n').trimEnd() === text.trimEnd()) return String(original)
  }
  const tail = original ? (String(original).match(/\n+$/) || [''])[0] : '\n'
  return text + tail
}
const comparisonParser = new MarkdownIt({ html: true, linkify: true })

/**
 * 只把语法写法变化视为无损。比较解析后的结构与内容，不能简单抹掉星号、
 * 反引号等字符：那会把加粗、行内代码丢失误判成纯外观变化。
 */
export function isCosmeticOnly(before, after) {
  const shape = (token) => ({
    type: token.type,
    tag: token.tag,
    nesting: token.nesting,
    hidden: token.hidden,
    attrs: token.attrs || null,
    info: token.info?.trim() || '',
    content: token.type === 'inline' ? '' :
      token.type === 'text' ? token.content.replace(/\s+/g, ' ') : token.content,
    children: token.children?.map(shape) || null
  })
  try {
    const a = comparisonParser.parse(String(before ?? ''), {}).map(shape)
    const b = comparisonParser.parse(String(after ?? ''), {}).map(shape)
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}
