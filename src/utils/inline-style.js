import { $markSchema, $remark } from '@milkdown/kit/utils'
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core'

export const TEXT_COLORS = {
  red: '#c94c4c', orange: '#b86b22', green: '#368568',
  blue: '#356ccc', purple: '#8256b8', gray: '#687487'
}
export const HIGHLIGHT_COLORS = {
  yellow: '#fff0a6', green: '#c9f1dc', blue: '#ddecff', pink: '#ffdce5'
}

const valid = (palette, value) => Object.hasOwn(palette, value) ? value : null

function marker(node) {
  if (node.type !== 'html') return null
  const value = node.value.trim()
  const color = value.match(/^<span data-reader-color="([a-z]+)"(?: style="[^"]*")?>$/)
  if (color && valid(TEXT_COLORS, color[1])) return { type: 'readerColor', tone: color[1], tag: 'span' }
  const highlight = value.match(/^<mark data-reader-highlight="([a-z]+)"(?: style="[^"]*")?>$/)
  if (highlight && valid(HIGHLIGHT_COLORS, highlight[1])) return { type: 'readerHighlight', tone: highlight[1], tag: 'mark' }
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

function markSchema(type, tag, palette) {
  return $markSchema(type, () => ({
    attrs: palette ? { tone: { default: Object.keys(palette)[0], validate: 'string' } } : {},
    parseDOM: [{
      tag: palette ? `${tag}[data-reader-${type === 'readerColor' ? 'color' : 'highlight'}]` : 'u',
      getAttrs: (dom) => palette ? { tone: valid(palette, dom.getAttribute(`data-reader-${type === 'readerColor' ? 'color' : 'highlight'}`)) || Object.keys(palette)[0] } : {}
    }],
    toDOM: (mark) => palette
      ? [tag, { [`data-reader-${type === 'readerColor' ? 'color' : 'highlight'}`]: mark.attrs.tone,
        style: `${type === 'readerColor' ? 'color' : 'background-color'}:${palette[mark.attrs.tone]}` }, 0]
      : ['u', { 'data-reader-underline': '' }, 0],
    parseMarkdown: {
      match: (node) => node.type === type,
      runner: (state, node, markType) => {
        state.openMark(markType, palette ? { tone: node.tone } : {})
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

export const textColorMark = markSchema('readerColor', 'span', TEXT_COLORS)
export const highlightMark = markSchema('readerHighlight', 'mark', HIGHLIGHT_COLORS)
export const underlineMark = markSchema('readerUnderline', 'u')

function handler(type, tag, palette) {
  return (node, _, state, info) => {
    const tone = palette ? valid(palette, node.tone) || Object.keys(palette)[0] : null
    const open = palette
      ? `<${tag} data-reader-${type === 'readerColor' ? 'color' : 'highlight'}="${tone}" style="${type === 'readerColor' ? 'color' : 'background-color'}:${palette[tone]}">`
      : '<u data-reader-underline="">'
    const close = `</${tag}>`
    return open + state.containerPhrasing(node, { ...info, before: open, after: close }) + close
  }
}

export function configureInlineStyleMarkdown(ctx) {
  ctx.update(remarkStringifyOptionsCtx, (options) => ({
    ...options,
    handlers: {
      ...options.handlers,
      readerColor: handler('readerColor', 'span', TEXT_COLORS),
      readerHighlight: handler('readerHighlight', 'mark', HIGHLIGHT_COLORS),
      readerUnderline: handler('readerUnderline', 'u')
    }
  }))
}
