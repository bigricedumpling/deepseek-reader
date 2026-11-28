import { onMounted, onBeforeUnmount } from 'vue'
import { readingDocument } from '../utils/safe-reading.js'
import { getCoverArtwork } from '../utils/cover-artworks.js'
import { coverPalettes } from '../utils/cover-presets.js'
import { renderCoverFrame } from '../utils/cover-renderer.js'
import documentFlow from '../styles/document-flow.css?inline'
import { assetUrl } from '../utils/api.js'
import { mermaidCodeBlocks, mermaidSourceKey, renderMermaidSvg } from '../utils/mermaid.js'

function download(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Render from the document snapshot. Editor widgets can contain only the visible code lines.
function articleFragment(raw, docFile) {
  const purifyOptions = { FORBID_TAGS: ['style', 'link', 'form', 'button', 'textarea', 'iframe', 'audio', 'object', 'embed'] }
  const fragment = readingDocument(raw, { gaps: false, links: false, docFile, purifyOptions })
  for (const katex of fragment.querySelectorAll('.katex')) {
    // Keep the accessible expression. The native tree needs no script, remote font or duplicate visual layer.
    const math = katex.querySelector('.katex-mathml > math')
    if (!math) continue
    const wrapper = document.createElement('span')
    wrapper.className = math.getAttribute('display') === 'block' ? 'export-math-block' : 'export-math-inline'
    const visual = katex.parentElement?.classList.contains('katex-display') ? katex.parentElement : katex
    wrapper.append(math)
    visual.replaceWith(wrapper)
  }
  for (const element of fragment.querySelectorAll('[style]')) {
    // Preserve document typography and layout without carrying positioning or resource URLs into print.
    const source = element.style
    const clean = document.createElement('span').style
    for (const key of ['color', 'background-color', 'text-align', 'font-weight', 'font-style', 'width', '--column-count']) {
      const value = source.getPropertyValue(key)
      if (value && !/[()]/.test(value.replace(/rgba?\([\d.% ,/]+\)/g, ''))) clean.setProperty(key, value)
    }
    element.style.cssText = clean.cssText
  }
  for (const input of fragment.querySelectorAll('input')) {
    if (input.type === 'checkbox') input.disabled = true
    else input.remove()
  }
  return fragment
}

// A formula can scroll on screen. On paper it has to fit the available column.
function measurePrintMath(article) {
  const formulas = [...article.querySelectorAll('.export-math-block, .export-math-inline')]
  if (!formulas.length) return
  const probe = document.createElement('div')
  probe.className = 'typocket-math-probe'
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;inset:0 auto auto 0;font-size:16px;width:max-content'
  for (const wrapper of formulas) {
    const row = document.createElement('div')
    row.style.width = 'max-content'
    row.append(wrapper.firstElementChild.cloneNode(true))
    probe.append(row)
  }
  document.body.append(probe)
  try {
    Array.from(probe.children).forEach((row, i) => {
      const width = row.getBoundingClientRect().width
      if (width > 0) formulas[i].style.setProperty('--export-math-fit', (99 * 16 / width).toFixed(4) + 'cqi')
    })
  } finally {
    probe.remove()
  }
}

// The picker can temporarily replace or hide the live artwork. Exports always
// reconstruct the saved cover, including when printed during a preview.
function exportedCover(cover, width) {
  const box = document.createElement('div')
  const height = { small: 160, medium: 240, large: 330 }[cover.height] || 240
  box.className = 'page-cover ' + (cover.height || 'medium')
  box.style.height = height + 'px'
  box.style.overflow = 'hidden'
  const image = document.createElement('img')
  image.className = 'document-cover-image'
  image.alt = ''
  if (cover.type === 'gradient') {
    const bitmap = document.createElement('canvas')
    bitmap.width = Math.max(1, Math.min(1600, Math.round(width * 1.5)))
    bitmap.height = Math.max(1, Math.round(bitmap.width * height / width))
    if (renderCoverFrame(bitmap, cover, 0) === false) {
      const [a, b, c] = cover.colors || coverPalettes[0]
      box.style.backgroundImage = `radial-gradient(ellipse at 20% 30%, ${a}, transparent 75%), linear-gradient(110deg, ${b}, ${c})`
      return box
    }
    image.src = bitmap.toDataURL('image/png')
  } else {
    const src = cover.type === 'artwork' ? getCoverArtwork(cover.artwork)?.url
      : cover.type === 'image' && cover.asset ? assetUrl('/api/file?asset=' + encodeURIComponent(cover.asset)) : ''
    if (!src) throw Error('无法读取已保存的封面')
    image.src = src
    image.style.objectPosition = 'center ' + (cover.position ?? 50) + '%'
  }
  box.append(image)
  return box
}

function exportedHeader(original, cover) {
  const header = original.querySelector('.page-header')
  if (!header) return document.createDocumentFragment()
  const copy = header.cloneNode(true)
  copy.querySelector('.page-cover')?.remove()
  copy.classList.toggle('has-cover', !!cover)
  if (cover) copy.prepend(exportedCover(cover, original.clientWidth || 960))
  for (const icon of copy.querySelectorAll('button.page-icon')) {
    const span = document.createElement('span')
    span.className = 'page-icon'
    span.append(...icon.childNodes)
    icon.replaceWith(span)
  }
  for (const widget of copy.querySelectorAll('button,.cover-actions,.page-header-controls,.reader-error')) widget.remove()
  return copy
}

async function mediaData(url, kind) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw Error('附件读取失败')
  const blob = await response.blob()
  if (!blob.size || !blob.type.startsWith(kind + '/')) throw Error('附件格式无效')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function embedImages(article, original) {
  const cache = new Map()
  const liveImages = Array.from(original.querySelectorAll('img'))
  for (const image of article.querySelectorAll('img, svg image')) {
    const svg = image.localName === 'image'
    const attr = svg ? 'href' : 'src'
    let src = image.getAttribute(attr) || image.getAttribute('xlink:href')
    if (!svg && (image.hasAttribute('srcset') || image.parentElement?.matches('picture'))) {
      const live = liveImages.find(item => item.getAttribute('src') === src && item.getAttribute('srcset') === image.getAttribute('srcset'))
      src = live?.currentSrc || src
      image.removeAttribute('srcset')
      image.removeAttribute('sizes')
    }
    try {
      if (!src) throw Error('缺少图片地址')
      const url = new URL(assetUrl(src), document.baseURI)
      if (!['http:', 'https:', 'blob:', 'data:'].includes(url.protocol)) throw Error('图片地址无效')
      if (!cache.has(url.href)) {
        const data = await mediaData(url, 'image')
        const probe = new Image()
        probe.src = data
        await probe.decode()
        cache.set(url.href, data)
      }
      image.setAttribute(attr, cache.get(url.href))
      image.removeAttribute('xlink:href')
      image.removeAttribute('loading')
    } catch {
      const label = image.getAttribute('alt') || src?.split(/[?#]/)[0]?.split('/').pop()?.slice(0, 64) || '未命名图片'
      throw Error('无法嵌入图片「' + label + '」，请检查图片或替换后再导出。')
    }
  }
  for (const source of article.querySelectorAll('picture source')) source.remove()
}

async function embedVideos(article) {
  const cache = new Map()
  for (const media of article.querySelectorAll('video[src], video source[src], video[poster]')) {
    for (const attr of ['src', 'poster']) {
      const src = media.getAttribute(attr)
      if (!src) continue
      try {
        const url = new URL(src, document.baseURI)
        if (!['http:', 'https:'].includes(url.protocol)) throw Error('地址无效')
        const kind = attr === 'poster' ? 'image' : 'video'
        const key = kind + ' ' + url.href
        if (!cache.has(key)) cache.set(key, await mediaData(url, kind))
        media.setAttribute(attr, cache.get(key))
      } catch {
        throw Error('无法嵌入视频，请确认视频和封面可读取后再导出。')
      }
    }
  }
}

const exportStyles = `
  body{max-width:960px;margin:40px auto;padding:0 24px;font:16px/1.8 system-ui,sans-serif;color:#252525;overflow-wrap:anywhere}
  h1,h2,h3{line-height:1.4} img,svg,video{max-width:100%;height:auto} .reader-video-figure video{display:block;margin-inline:auto} figure{margin-inline:0}
  table{border-collapse:collapse;max-width:100%} td,th{border:1px solid #ddd;padding:6px 10px}
  pre{white-space:pre-wrap;background:#f5f5f5;padding:16px} pre > code{font-size:.8125em} blockquote{border-left:3px solid #ddd;margin-left:0;padding-left:20px;color:#666}
  .page-cover{height:240px;overflow:hidden}.page-cover.small{height:160px}.page-cover.large{height:330px}.page-cover img{display:block;width:100%;height:100%;object-fit:cover}
  .page-icon{font-size:40px}.page-description,figcaption{color:#666}
  .reader-rich-callout{display:flex;gap:12px;background:#f5f5f5;border-radius:8px;padding:18px}
  .reader-columns,.reader-rich-columns{display:grid;grid-template-columns:repeat(var(--column-count,2),minmax(0,1fr));gap:24px}
  .reader-rich-card{border:1px solid #ddd;border-radius:10px;padding:16px}.reader-rich-figure figure{display:inline-block}
  eqn,section.eqno{display:block;text-align:center} .katex-display{display:block;margin:1em 0}
  @media(max-width:600px){.reader-columns,.reader-rich-columns{display:block}}
`

export function useExport(getDoc, getRaw, getCover) {
  function exportMarkdown() {
    const doc = getDoc()
    if (doc) download(doc.name + '.md', new Blob([getRaw()], { type: 'text/markdown;charset=utf-8' }))
  }

  async function exportPackage() {
    const doc = getDoc()
    if (!doc?.file) throw Error('正文尚未加载')
    const raw = getRaw()
    const { markdownPackage } = await import('../utils/markdown-package.js')
    download(doc.name + '.zip', await markdownPackage(doc, raw))
  }

  // The menu can await all diagrams, including diagrams outside the live editor's
  // viewport. Native beforeprint is synchronous, so it reuses matching live SVGs.
  async function renderPaperDiagrams(article) {
    for (const code of mermaidCodeBlocks(article)) {
      const svg = await renderMermaidSvg(code.textContent, { paper: true })
      if (svg) code.parentElement.outerHTML = svg
    }
  }

  let printed = null
  let readyToPrint = null
  function removePrintCopy() {
    printed?.remove()
    printed = null
    readyToPrint = null
  }

  function printSheet(original) {
    const sheet = document.createElement('article')
    sheet.className = 'typocket-print'
    sheet.append(exportedHeader(original, getCover()), articleFragment(getRaw(), getDoc()?.file))
    for (const image of sheet.querySelectorAll('img')) image.loading = 'eager'
    return sheet
  }

  function preparePrint() {
    if (printed?.isConnected && !readyToPrint) return
    const original = document.getElementById('main-scroll-container')
    if (!original?.querySelector('.editor-shell')) return
    const sheet = readyToPrint || printSheet(original)
    if (!readyToPrint) {
      const diagrams = new Map()
      for (const preview of original.querySelectorAll('.mermaid-preview[data-src]')) {
        const svg = preview.querySelector('svg')
        if (svg) diagrams.set(preview.dataset.src, svg)
      }
      for (const code of mermaidCodeBlocks(sheet)) {
        const svg = diagrams.get(mermaidSourceKey(code.textContent))
        if (svg) code.parentElement.replaceWith(svg.cloneNode(true))
      }
    }
    removePrintCopy()
    measurePrintMath(sheet)
    document.body.append(sheet)
    printed = sheet
  }

  onMounted(() => {
    window.addEventListener('beforeprint', preparePrint)
    window.addEventListener('afterprint', removePrintCopy)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('beforeprint', preparePrint)
    window.removeEventListener('afterprint', removePrintCopy)
    removePrintCopy()
  })

  async function exportPdf() {
    const original = document.getElementById('main-scroll-container')
    const file = getDoc()?.file
    if (!file || !original?.querySelector('.editor-shell')) throw Error('正文尚未加载')
    const sheet = printSheet(original)
    await renderPaperDiagrams(sheet)
    if (getDoc()?.file !== file || !original.isConnected) return
    readyToPrint = sheet
    window.print()
  }

  async function exportHtml() {
    const original = document.getElementById('main-scroll-container')
    if (!getDoc() || !original?.querySelector('.editor-shell')) throw Error('正文尚未加载')
    const title = getDoc().name || '文档'
    const output = document.implementation.createHTMLDocument(title)
    output.documentElement.lang = 'zh-CN'
    const charset = output.createElement('meta')
    charset.setAttribute('charset', 'UTF-8')
    const policy = output.createElement('meta')
    policy.httpEquiv = 'Content-Security-Policy'
    policy.content = "default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
    const viewport = output.createElement('meta')
    viewport.name = 'viewport'
    viewport.content = 'width=device-width,initial-scale=1'
    const style = output.createElement('style')
    style.textContent = exportStyles + documentFlow
    output.head.prepend(charset, policy, viewport)
    output.head.append(style)
    output.body.className = 'typocket-export'
    output.body.append(exportedHeader(original, getCover()), articleFragment(getRaw(), getDoc()?.file))
    await renderPaperDiagrams(output.body)
    for (const el of output.body.querySelectorAll('*')) {
      for (const attr of Array.from(el.attributes)) {
        if (/^(?:data-reader-|on)/.test(attr.name) || ['contenteditable', 'draggable', 'tabindex'].includes(attr.name)) el.removeAttribute(attr.name)
      }
    }
    measurePrintMath(output.body)
    await embedImages(output.body, original)
    await embedVideos(output.body)
    download(title + '.html', new Blob(['<!doctype html>\n', output.documentElement.outerHTML], { type: 'text/html;charset=utf-8' }))
  }
  return { exportMarkdown, exportPackage, exportPdf, exportHtml }
}
