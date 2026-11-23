import { fromMarkdown } from 'mdast-util-from-markdown'
import { encode } from 'mdurl'
import { math } from 'micromark-extension-math'

// Capture the original spelling around image URLs. Re-serializing an AST would
// change unrelated spacing, headings, code samples and link definitions.
const positions = {
  enter: {
    resourceDestination(token) {
      const node = this.stack.at(-1)
      if (node.type === 'image' || node.type === 'link') node.destination = token
    },
    definitionDestination(token) {
      this.stack.at(-1).destination = token
    },
    referenceMarker(token) {
      const node = this.stack.at(-1)
      if (node.type === 'image' && node.referenceStart === undefined) node.referenceStart = token.start.offset
    },
    definitionTitle(token) {
      this.stack.at(-1).sourceTitle = this.sliceSerialize(token)
    }
  }
}

export { encode as normalizeImageReference }
const localReference = url => !/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(url)
export function parseDocumentMarkdown(markdown) {
  const prefix = /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(markdown)?.[0].length ?? (markdown.startsWith('\uFEFF') ? 1 : 0)
  const tree = fromMarkdown(markdown.slice(prefix), { extensions: [math()], mdastExtensions: [positions] })
  return { tree, prefix }
}

export function workspaceImages(markdown, accepts = localReference) {
  if (!markdown.includes('![')) return []
  const { tree, prefix } = parseDocumentMarkdown(markdown)
  const definitions = new Map()
  const images = []
  function visit(node) {
    if (node.type === 'definition' && !definitions.has(node.identifier)) definitions.set(node.identifier, node)
    if (node.type === 'image' || node.type === 'imageReference') images.push(node)
    if (node.children) node.children.forEach(visit)
  }
  visit(tree)
  const spans = []
  for (const image of images) {
    const definition = image.type === 'imageReference' ? definitions.get(image.identifier) : null
    const url = definition ? definition.url : image.url
    if (!url || !accepts(url)) continue
    const reference = encode(url)
    if (definition) {
      // A definition can also be used by ordinary links. Only the image use
      // becomes inline; the shared definition and any links stay byte-identical.
      const end = prefix + image.position.end.offset
      const start = prefix + (image.referenceStart ?? image.position.end.offset)
      spans.push({ start, end, reference, title: definition.sourceTitle || '', fromDefinition: true })
    } else if (image.destination) {
      let start = prefix + image.destination.start.offset
      let end = prefix + image.destination.end.offset
      if (markdown[start] === '<') { start++; end-- }
      spans.push({ start, end, reference })
    }
  }
  return spans
}

export function rewriteWorkspaceImages(markdown, spans, urlFor) {
  let cursor = 0
  const parts = []
  for (const span of spans) {
    const url = urlFor(span.reference)
    if (!url) continue
    parts.push(markdown.slice(cursor, span.start))
    if (span.fromDefinition) parts.push('(', url, span.title ? ' ' + span.title : '', ')')
    else parts.push(url)
    cursor = span.end
  }
  return parts.length ? parts.join('') + markdown.slice(cursor) : markdown
}
