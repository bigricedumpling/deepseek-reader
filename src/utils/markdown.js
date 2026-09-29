import {layoutText} from './column-format'
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import footnote from 'markdown-it-footnote'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import { assetUrl } from './api.js'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,      // 段内单个换行按 Markdown 标准并成一段，行尾反斜杠或两个空格才是硬换行
  typographer: false
})
  .use(taskLists, { label: true, labelAfter: true })   // - [x] 画成真复选框
  .use(sub)                                            // H~2~O
  .use(sup)                                            // x^2^
  .use(footnote)
  .use(texmath, { engine: katex, delimiters: 'dollars', katexOptions: { throwOnError: false } })

/* ---------- LaTeX 原生定界符 ---------- */

/**
 * AI 工具输出的 markdown 常用 \(…\) 表行内公式、\[…\] 表独立公式，
 * 而不是 markdown 世界惯用的 $…$。这里转成 $ 形式再交给同一个渲染器。
 *
 * 恪守宁可不转、绝不错转：代码块、行内代码、HTML 块一律豁免。
 */
function normalizeMathDelimiters(src) {
  const text = String(src ?? '')
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/)
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part          // 代码片段原样
      return part
        /* \[1\] 这种一到两位纯数字是引用标记，不是公式；真正的公式不会只有一个数字 */
      .replace(/\\\[([\s\S]*?)\\\]/g, (m, body) =>
        /^\s*\d{1,2}\s*$/.test(body) ? m : '$$' + body + '$$'
      )
        .replace(/\\\(([\s\S]*?)\\\)/g, (_, body) => '$' + body + '$')
    })
    .join('')
}

/* ---------- 标题锚点 ---------- */

/** 把标题文本转成锚点 id，支持中文 */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[*`~]/g, '')
    .trim()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/* 给标题加 id，供右侧目录跳转 */
const defaultHeadingOpen =
  md.renderer.rules.heading_open ||
  function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  const inline = tokens[idx + 1]
  const text = inline && inline.type === 'inline' ? inline.content : ''
  if (text) token.attrSet('id', slugify(text))
  return defaultHeadingOpen(tokens, idx, options, env, self)
}

/* 外链新窗口打开 */
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const href = tokens[idx].attrGet('href') || ''
  if (/^https?:\/\//.test(href)) {
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener noreferrer')
  }
  return defaultLinkOpen(tokens, idx, options, env, self)
}

const defaultImage = md.renderer.rules.image || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.image = function (tokens, idx, options, env, self) {
  const src = tokens[idx].attrGet('src')
  if (src) tokens[idx].attrSet('src', assetUrl(src))
  return defaultImage(tokens, idx, options, env, self)
}

/* ---------- Front matter ---------- */

/**
 * 文件开头的 YAML（---）或 TOML（+++）元数据块不渲染、不进查找。
 * 文档中间或没闭合的 --- 仍然照常画成分隔线。
 */
function stripFrontMatter(src) {
  const text = String(src ?? '')
  const m = text.match(/^(---|\+\+\+)\r?\n([\s\S]*?)\r?\n\1\r?\n?/)
  return m ? text.slice(m[0].length) : text
}

/* ---------- 中西文间距 ---------- */

const CJK = '\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F'
const CJK_RE = new RegExp('([' + CJK + '])', 'g')
const CJK_END = new RegExp('[' + CJK + ']$')
const LATIN_START = /^[A-Za-z0-9@#$%&*+=<>^_`~]/
const LATIN_END = /[A-Za-z0-9)\]}>%]$/
const CJK_START = new RegExp('^[' + CJK + ']')

/**
 * 中日韩文字与西文之间自动留出缝隙。
 * 用零宽标记实现，不改变复制的字节——选中复制出来的仍是原文。
 */
function cjkGap(html) {
  // 代码块与行内代码里的汉字不参与中西缝，跟 Tamari 的判据保持一致
  const parts = String(html).split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/)
  return parts
    .map((part, i) => (i % 2 === 1 ? part : addGapsInText(part)))
    .join('')
}

function addGapsInText(html) {
  return html.replace(/([^<>]+)/g, (chunk) => {
    let out = ''
    for (let i = 0; i < chunk.length; i++) {
      const prev = chunk[i - 1]
      const cur = chunk[i]
      if (prev && CJK_END.test(prev) && LATIN_START.test(cur)) out += '\u2009'
      else if (prev && LATIN_END.test(prev) && CJK_START.test(cur)) out += '\u2009'
      out += cur
    }
    return out
  })
}

export function renderMarkdown(src, { gaps = true } = {}) {
  if (!src) return ''
  let html = md.render(normalizeMathDelimiters(stripFrontMatter(src)))
  if (gaps) html = cjkGap(html)
  return html
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>')
}

/** 抽取一到六级标题生成右侧目录。 */
export function extractToc(src) {
  const toc = []
  const tokens = md.parse(normalizeMathDelimiters(stripFrontMatter(src)), {})
  const plain = (parts) => (parts || []).map((part) => {
    if (part.children?.length) return plain(part.children)
    if (['text', 'code_inline', 'image', 'sub', 'sup', 'math_inline'].includes(part.type)) return part.content
    if (part.type === 'softbreak' || part.type === 'hardbreak') return ' '
    return ''
  }).join('')
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]
    if (token.type !== 'heading_open') continue
    const inline = tokens[i + 1]
    if (inline?.type !== 'inline') continue
    const level = Number(token.tag.slice(1))
    const foldTitle = plain(inline.children).trim()
    const title = foldTitle
      .replace(/^[§#]+\s*/, '')
      .replace(/^\d+[.、]\s*/, '')
      .trim()
    if (!title) continue
    toc.push({ level, title, foldTitle, id: slugify(inline.content) })
  }
  return toc
}

/** 搜索结果高亮（返回 HTML 片段） */
export function highlight(text, kw) {
  const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  if (!kw) return escape(text)
  const safe = String(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let at = 0, out = ''
  for (const match of String(text).matchAll(new RegExp(safe, 'gi'))) {
    out += escape(String(text).slice(at, match.index)) + `<mark>${escape(match[0])}</mark>`
    at = match.index + match[0].length
  }
  return out + escape(String(text).slice(at))
}

function searchLineText(line) {
  return line
    .replace(/<\/?(?:span|mark|u|strong|em|sup|sub|s|del|ins|br)(?:\s[^>]*)?>/gi, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
}

/**
 * 全文检索：返回命中的文档 + 上下文片段
 * @param {Array<{id,title,raw}>} docs
 * @param {string} keyword
 */
export function searchDocs(docs, keyword) {
  const kw = String(keyword || '').trim().toLowerCase()
  if (!kw) return []
  const results = []
  for (const doc of docs) {
    const lines = layoutText(doc.raw).split('\n')
    const hits = []
    let ordinal = 0
    lines.forEach((line, i) => {
      const visible = searchLineText(line)
      const lower = visible.toLowerCase()
      let from = lower.indexOf(kw)
      let occurrence = 0
      while (from >= 0) {
        occurrence++
        if (hits.length < 20) {
          const start = Math.max(0, from - 55)
          const clean = (start ? '…' : '') + visible.slice(start, from + kw.length + 75).replace(/^[#>\-*\s]+/, '').trim()
          if (clean) hits.push({
            line: i + 1,
            ordinal,
            occurrence,
            text: clean.length > 140 ? clean.slice(0, 140) + '…' : clean
          })
        }
        ordinal++
        from = lower.indexOf(kw, from + kw.length)
      }
    })
    if (hits.length) results.push({ id: doc.id, title: doc.title, hits })
  }
  return results
}
