import { $markSchema, $remark } from '@milkdown/kit/utils'
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core'

export const TEXT_COLORS = {
  red: '#c94c4c', orange: '#b86b22', green: '#368568',
  blue: '#356ccc', purple: '#8256b8', gray: '#687487'
}
export const HIGHLIGHT_COLORS = {
  yellow: '#fff0a6', green: '#c9f1dc', blue: '#ddecff', pink: '#ffdce5'
}

const CUSTOM_COLOR = /^#[0-9a-f]{6}$/i
const firstTone = (palette) => Object.keys(palette)[0]

/** 判断一个值是不是可以落进 Markdown 的六位十六进制颜色。 */
export const isCustomTextColor = (value) => typeof value === 'string' && CUSTOM_COLOR.test(value)

/** 把预设名或自定义色号换成实际 CSS 颜色。 */
export const textColorValue = (tone) => {
  if (Object.hasOwn(TEXT_COLORS, tone)) return TEXT_COLORS[tone]
  return isCustomTextColor(tone) ? tone.toLowerCase() : null
}

/** 自定义色号刚好等于某个预设时，回到预设名，菜单里才能显示选中态。 */
export const textColorName = (hex) => {
  const value = String(hex || '').toLowerCase()
  return Object.keys(TEXT_COLORS).find((key) => TEXT_COLORS[key].toLowerCase() === value) || null
}

function validTone(palette, value, custom = false) {
  if (Object.hasOwn(palette, value)) return value
  if (custom && isCustomTextColor(value)) return value.toLowerCase()
  return null
}

function toneCss(palette, tone, custom = false) {
  if (Object.hasOwn(palette, tone)) return palette[tone]
  if (custom && isCustomTextColor(tone)) return tone.toLowerCase()
  return null
}

function marker(node) {
  if (node.type !== 'html') return null
  const value = node.value.trim()
  const color = value.match(/^<span data-reader-color="([^"]+)"(?: style="[^"]*")?>$/)
  if (color) {
    const tone = validTone(TEXT_COLORS, color[1], true)
    if (tone) return { type: 'readerColor', tone, tag: 'span' }
  }
  const highlight = value.match(/^<mark data-reader-highlight="([^"]+)"(?: style="[^"]*")?>$/)
  if (highlight) {
    const tone = validTone(HIGHLIGHT_COLORS, highlight[1])
    if (tone) return { type: 'readerHighlight', tone, tag: 'mark' }
  }
  if (/^<u(?: data-reader-underline="")?>$/.test(value)) return { type: 'readerUnderline', tag: 'u' }
  return null
}

function parseInlineStyles(parent) {
  if (!Array.isArray(parent.children)) return
  const source = parent.children
  const result = []
  for (let i = 0; i < source.length; i++) {
    const open = marker(source[i])
    if (open) {
      let depth = 1, end = i + 1
      for (; end < source.length; end++) {
        const value = source[end].type === 'html' ? source[end].value.trim() : ''
        if (new RegExp(`^<${open.tag}(?:\\s|>)`).test(value)) depth++
        if (value === `</${open.tag}>` && --depth === 0) break
      }
      if (depth === 0) {
        const wrapped = { type: open.type, tone: open.tone, children: source.slice(i + 1, end) }
        parseInlineStyles(wrapped)
        result.push(wrapped)
        i = end
        continue
      }
    }
    parseInlineStyles(source[i])
    result.push(source[i])
  }
  parent.children = result
}

export const inlineStyleRemark = $remark('readerInlineStyles', () => () => parseInlineStyles)

function markSchema(type, tag, palette, { custom = false } = {}) {
  const attr = type === 'readerColor' ? 'color' : 'highlight'
  return $markSchema(type, () => ({
    attrs: palette ? { tone: { default: firstTone(palette), validate: 'string' } } : {},
    parseDOM: [{
      tag: palette ? `${tag}[data-reader-${attr}]` : 'u',
      getAttrs: (dom) => palette
        ? { tone: validTone(palette, dom.getAttribute(`data-reader-${attr}`), custom) || firstTone(palette) }
        : {}
    }],
    toDOM: (mark) => {
      if (!palette) return ['u', { 'data-reader-underline': '' }, 0]
      const tone = validTone(palette, mark.attrs.tone, custom) || firstTone(palette)
      const css = toneCss(palette, tone, custom)
      return [tag, {
        [`data-reader-${attr}`]: tone,
        style: `${type === 'readerColor' ? 'color' : 'background-color'}:${css}`
      }, 0]
    },
    parseMarkdown: {
      match: (node) => node.type === type,
      runner: (state, node, markType) => {
        const attrs = palette
          ? { tone: validTone(palette, node.tone, custom) || firstTone(palette) }
          : {}
        state.openMark(markType, attrs)
        state.next(node.children)
        state.closeMark(markType)
      }
    },
    toMarkdown: {
      match: (mark) => mark.type.name === type,
      runner: (state, mark) => {
        state.withMark(mark, type, undefined, palette ? { tone: mark.attrs.tone } : {})
      }
    }
  }))
}

export const textColorMark = markSchema('readerColor', 'span', TEXT_COLORS, { custom: true })
export const highlightMark = markSchema('readerHighlight', 'mark', HIGHLIGHT_COLORS)
export const underlineMark = markSchema('readerUnderline', 'u')

function handler(type, tag, palette, { custom = false } = {}) {
  const attr = type === 'readerColor' ? 'color' : 'highlight'
  return (node, _, state, info) => {
    const tone = validTone(palette, node.tone, custom) || firstTone(palette)
    const css = toneCss(palette, tone, custom)
    const open = `<${tag} data-reader-${attr}="${tone}" style="${type === 'readerColor' ? 'color' : 'background-color'}:${css}">`
    const close = `</${tag}>`
    return open + state.containerPhrasing(node, { ...info, before: open, after: close }) + close
  }
}

export function configureInlineStyleMarkdown(ctx) {
  ctx.update(remarkStringifyOptionsCtx, (options) => ({
    ...options,
    handlers: {
      ...options.handlers,
      readerColor: handler('readerColor', 'span', TEXT_COLORS, { custom: true }),
      readerHighlight: handler('readerHighlight', 'mark', HIGHLIGHT_COLORS),
      readerUnderline: handler('readerUnderline', 'u')
    }
  }))
}
