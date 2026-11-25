import { API_BASE } from './api.js'
import { readingFragment, forbiddenReadingTags } from './reading-fragment.js'
import { richDOM } from './rich-block-dom.js'
import { parseColumns } from './column-format.js'
import { parseRichBlock } from './rich-block-format.js'

export { readingFragment }

const snapshotOptions = {
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: [...forbiddenReadingTags, 'video', 'audio', 'source', 'track', 'picture'],
  FORBID_ATTR: ['id', 'name', 'for', 'tabindex', 'autofocus', 'srcset', 'contenteditable'],
}

function snapshotImageAllowed(src) {
  return src.split('?')[0] === API_BASE + '/api/file' || /^data:image\/(png|jpeg|gif|webp|avif);base64,/i.test(src)
}

// Expand only recognized and validated layout fences. Invalid JSON stays visible as code.
export function readingDocument(markdown, options = {}) {
  const { snapshot = false, allowHtml = true, gaps = true, links = true, purifyOptions = {} } = options
  const fragment = readingFragment(markdown, { allowHtml, gaps, purifyOptions: snapshot ? snapshotOptions : purifyOptions })
  const richContent = text => readingDocument(text, { ...options, allowHtml: false })
  for (const code of fragment.querySelectorAll('pre > code.language-reader-block, pre > code.language-reader-columns')) {
    if (code.classList.contains('language-reader-block')) {
      const value = parseRichBlock(code.textContent)
      if (value) code.parentElement.replaceWith(richDOM(value, richContent, {
        editable: false, links: links && !snapshot, allowImage: snapshot ? snapshotImageAllowed : undefined,
      }))
    } else {
      const columns = parseColumns(code.textContent)
      if (!columns) continue
      const row = document.createElement('div')
      row.className = 'reader-columns'
      row.style.setProperty('--column-count', columns.length)
      for (const text of columns) {
        const column = document.createElement('div')
        column.className = 'reader-column'
        column.append(readingDocument(text, options))
        row.append(column)
      }
      code.parentElement.replaceWith(row)
    }
  }
  return fragment
}

export function readingHtml(markdown) {
  const container = document.createElement('div')
  container.append(readingDocument(markdown))
  return container.innerHTML
}

// Historical snapshots coexist with the actual document. Omit its DOM IDs and interactive controls.
export function readingSnapshot(markdown) {
  const fragment = readingDocument(markdown, { snapshot: true })
  for (const input of fragment.querySelectorAll('input')) {
    if (input.type === 'checkbox') input.disabled = true
    else input.remove()
  }
  for (const link of fragment.querySelectorAll('a')) {
    link.removeAttribute('href')
    link.removeAttribute('xlink:href')
  }
  for (const image of fragment.querySelectorAll('img')) {
    const src = image.getAttribute('src') || ''
    if (snapshotImageAllowed(src)) {
      image.loading = 'lazy'
    } else {
      image.replaceWith(document.createTextNode(image.alt || '图片'))
    }
  }
  const container = document.createElement('div')
  container.append(fragment)
  return container
}
