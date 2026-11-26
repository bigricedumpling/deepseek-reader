import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import footnote from 'markdown-it-footnote'
import { readMathAt, mathSourceSpans } from './math-source.js'
import katex from 'katex'
import { assetUrl } from './api.js'
import { imageScaleMarker, legacyImageRatio } from './preserved-markdown.js'

// Inline rules run only in Markdown text. Code samples, attributes, links and
// HTML blocks stay with the Markdown parser that owns those source ranges.
function inlineMath(state, silent) {
  const span = readMathAt(state.src, state.pos, state.posMax)
  if (!span) return false
  if (!silent) {
    const token = state.push('math_inline', '', 0)
    token.content = span.value
    token.meta = { display: span.display }
  }
  state.pos = span.to
  return true
}

function blockMath(state, start, end, silent) {
  const offset = state.bMarks[start] + state.tShift[start]
  const opener = state.src.slice(offset, offset + 2)
  if (opener !== '$$' && opener !== '\\[') return false
  if (state.sCount[start] - state.blkIndent >= 4) return false
  const candidate = readMathAt(state.src, offset, state.eMarks[end - 1])
  if (!candidate?.display) return false
  const close = candidate.to - 1
  let last = start
  while (last + 1 < end && state.eMarks[last] < close) {
    ++last
    if (state.sCount[last] < state.blkIndent && !state.isEmpty(last)) return false
  }
  // getLines removes list/quote prefixes before passing multiline TeX to KaTeX.
  const source = state.getLines(start, last + 1, state.blkIndent, false).trimStart()
  const span = readMathAt(source, 0)
  if (!span?.display) return false
  const suffix = source.slice(span.to).trim()
  if (suffix && !/^\([^()\s]+\)$/.test(suffix)) return false
  if (!silent) {
    const token = state.push('math_block', 'section', 0)
    token.block = true
    token.map = [start, last + 1]
    token.content = span.value
    token.info = suffix
    state.line = last + 1
  }
  return true
}

export function renderFormula(value, display, label = '') {
  const html = katex.renderToString(value, { displayMode: display, throwOnError: false, trust: false })
  if (!label || html.includes('class="katex-tag"')) return html
  return html + '<span class="math-number">' + md.utils.escapeHtml(label) + '</span>'
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

function createParser(allowHtml) {
  const md = new MarkdownIt({ html: allowHtml, linkify: true, breaks: false, typographer: false })
    .use(taskLists, { label: true, labelAfter: true })
    .use(sub)
    .use(sup)
    .use(footnote)

  // GFM splits cells before inline parsing and consumes a backslash preceding a
  // pipe. Protect TeX-owned pipes until the block parser has finished the rows.
  md.core.ruler.before('block', 'protect_math_pipes', state => {
    if (!state.src.includes('|') || !/^[\s>:|]*-+:?[ \t|:-]*$/m.test(state.src)) return
    const spans = mathSourceSpans(state.src).filter(span => !span.raw.includes('\n') && span.raw.includes('|'))
    if (!spans.length) return
    let marker = '\uE000'
    while (state.src.includes(marker)) marker += '\uE001'
    state.env.tableMath = { source: state.src, marker }
    let at = 0
    const chunks = []
    for (const { from, to } of spans) {
      chunks.push(state.src.slice(at, from), state.src.slice(from, to).replaceAll('|', marker))
      at = to
    }
    state.src = chunks.join('') + state.src.slice(at)
  })
  md.core.ruler.after('block', 'restore_math_pipes', state => {
    const saved = state.env.tableMath
    if (!saved) return
    state.src = saved.source
    for (const token of state.tokens) {
      if (token.content.includes(saved.marker)) token.content = token.content.replaceAll(saved.marker, '|')
    }
    delete state.env.tableMath
  })

  md.inline.ruler.before('escape', 'math_inline', inlineMath)
  md.block.ruler.before('fence', 'math_block', blockMath, { alt: ['paragraph', 'reference', 'blockquote'] })
  md.renderer.rules.math_inline = (tokens, i, _, env) =>
    env.renderMath(tokens[i].content, tokens[i].meta.display)
  md.renderer.rules.math_block = (tokens, i, _, env) => {
    const token = tokens[i]
    return '<section class="math-block">' + env.renderMath(token.content, true, token.info) + '</section>\n'
  }

  // Add CJK spacing to prose before escaping. Math, code, attributes and HTML entities keep their bytes.
  md.renderer.rules.text = (tokens, i, _, env) =>
    md.utils.escapeHtml(env.gaps ? addGapsInText(tokens[i].content) : tokens[i].content)
  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n'
  md.renderer.rules.table_close = () => '</table></div>\n'

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

  md.core.ruler.after('inline', 'typocket_block_image_scale', state => {
    for (let i = 1; i < state.tokens.length - 1; i++) {
      const inline = state.tokens[i]
      if (inline.type !== 'inline' || state.tokens[i - 1].type !== 'paragraph_open' ||
          state.tokens[i + 1].type !== 'paragraph_close') continue
      const [image, marker] = inline.children
      if (image?.type !== 'image' || inline.children.length > 2) continue
      // In a text-only reading surface the HTML parser is disabled. Recognize the
      // editor's exact adjacent marker there as well; leave escaped examples alone.
      const marked = marker && (marker.type === 'html_inline' || marker.type === 'text') &&
        inline.content.endsWith(')' + marker.content) && imageScaleMarker(marker.content)
      if (marker && !marked) continue
      const legacy = legacyImageRatio(image.content)
      if (marked) inline.children.pop()
      if (marked || legacy !== null) image.meta = { ...image.meta, scale: marked || legacy, numericAlt: legacy !== null }
    }
  })
  const defaultImage = md.renderer.rules.image || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.image = function (tokens, idx, options, env, self) {
    const image = tokens[idx]
    const src = image.attrGet('src')
    if (src) image.attrSet('src', assetUrl(src))
    const scale = image.meta?.scale
    if (scale && scale !== 1) image.attrSet('style', 'width:' + Number((scale * 100).toFixed(2)) + '%')
    let html
    if (image.meta?.numericAlt) {
      image.attrSet('alt', image.attrGet('title') || '')
      html = self.renderToken(tokens, idx, options)
    } else html = defaultImage(tokens, idx, options, env, self)
    return scale && scale !== 1
      ? '<span class="reader-image-column"><span class="reader-image-natural">' + html + '</span></span>'
      : html
  }

  return md
}

const md = createParser(true)
const plainMarkdown = createParser(false)

/* ---------- Front matter ---------- */

/**
 * 文件开头的 YAML（---）或 TOML（+++）元数据块不渲染、不进查找。
 * 文档中间或没闭合的 --- 仍然照常画成分隔线。
 */
function stripFrontMatter(src) {
  const text = String(src ?? '').replace(/^\uFEFF/, '')
  const m = text.match(/^(---|\+\+\+)\r?\n([\s\S]*?)\r?\n\1\r?\n?/)
  return m ? text.slice(m[0].length) : text
}

/* ---------- 中西文间距 ---------- */

const CJK = '\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F'
const CJK_END = new RegExp('[' + CJK + ']$')
const LATIN_START = /^[A-Za-z0-9@#$%&*+=<>^_`~]/
const LATIN_END = /[A-Za-z0-9)\]}>%]$/
const CJK_START = new RegExp('^[' + CJK + ']')

/**
 * 中日韩文字与西文之间自动留出缝隙。
 * 正文的显示间距使用窄空格。公式、代码与原始 Markdown 不参与。
 */
function addGapsInText(text) {
  let result = ''
  for (let i = 0; i < text.length; i++) {
    const prev = text[i - 1]
    const cur = text[i]
    if (prev && ((CJK_END.test(prev) && LATIN_START.test(cur)) || (LATIN_END.test(prev) && CJK_START.test(cur)))) result += '\u2009'
    result += cur
  }
  return result
}

export function renderMarkdown(src, { gaps = true, allowHtml = true, renderMath = renderFormula } = {}) {
  if (!src) return ''
  return (allowHtml ? md : plainMarkdown).render(stripFrontMatter(src), { gaps, renderMath })
}

/** 抽取一到六级标题生成右侧目录。 */
export function extractToc(src) {
  const toc = []
  const tokens = md.parse(stripFrontMatter(src), {})
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
