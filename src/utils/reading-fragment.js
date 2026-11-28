import DOMPurify from 'dompurify'
import { renderMarkdown, renderFormula } from './markdown.js'
import { playableVideoUrl } from './video-format.js'

let purifier
const geometry = new Set(['height', 'width', 'min-width', 'top', 'left', 'right', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'padding-left', 'vertical-align', 'border-bottom-width', 'font-size'])
const textStyles = {
  'text-align': /^(?:left|right|center|start|end|justify)$/i,
  'font-weight': /^(?:normal|bold|bolder|lighter|[1-9]\d{0,2}|1000)$/i,
  'font-style': /^(?:normal|italic|oblique)$/i,
}
const color = /^(?:#[a-f\d]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d.%,\s/+\-]+\))$/i

// Document typography is allowed; arbitrary CSS and external resources are not.
function documentPurifier() {
  if (purifier) return purifier
  purifier = DOMPurify(window)
  purifier.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName !== 'style') return
    data.attrValue = data.attrValue.split(';').filter(rule => {
      const colon = rule.indexOf(':')
      if (colon < 0) return false
      const key = rule.slice(0, colon).trim().toLowerCase()
      const value = rule.slice(colon + 1).trim()
      if (key === 'color' || key === 'background-color') return color.test(value)
      if (Object.hasOwn(textStyles, key)) return textStyles[key].test(value)
      return geometry.has(key) && /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:em|ex|px|%|pt)?$/.test(value)
    }).join(';')
  })
  return purifier
}

export const forbiddenReadingTags = ['style', 'iframe', 'object', 'embed', 'form', 'button', 'select', 'textarea']

// Sanitize user-authored markup first. KaTeX's trusted output contains MathML
// semantics and SVG paths that the document sanitizer correctly strips from arbitrary HTML.
export function readingFragment(markdown, { allowHtml = true, gaps = true, purifyOptions = {}, docFile } = {}) {
  const formulas = []
  let slotClass
  const html = renderMarkdown(markdown, { allowHtml, gaps, renderMath(value, display, label) {
    slotClass ??= 'typocket-math-' + crypto.getRandomValues(new Uint32Array(4)).join('-')
    const index = formulas.push({ value, display, label }) - 1
    return '<span class="' + slotClass + '">' + index + '</span>'
  } })
  const fragment = documentPurifier().sanitize(html, {
    FORBID_TAGS: forbiddenReadingTags, ADD_ATTR: ['target'], ...purifyOptions, RETURN_DOM_FRAGMENT: true
  })
  for (const video of fragment.querySelectorAll('video')) {
    video.removeAttribute('autoplay')
    video.setAttribute('controls', '')
    video.setAttribute('playsinline', '')
    video.setAttribute('preload', 'metadata')
    for (const source of [video, ...video.querySelectorAll('source')]) {
      const src = playableVideoUrl(source.getAttribute('src'), docFile)
      if (src) source.setAttribute('src', src)
      else source.removeAttribute('src')
    }
    if (video.hasAttribute('data-typocket-video')) {
      const figure = document.createElement('figure')
      figure.className = 'reader-video-figure'
      video.replaceWith(figure)
      figure.append(video)
      if (!video.title) continue
      const caption = document.createElement('figcaption')
      caption.className = 'reader-video-caption'
      caption.textContent = video.title
      figure.append(caption)
    }
  }
  if (slotClass) {
    for (const marker of fragment.querySelectorAll('.' + slotClass)) {
      const { value, display, label } = formulas[Number(marker.textContent)]
      const template = document.createElement('template')
      template.innerHTML = renderFormula(value, display, label)
      marker.replaceWith(template.content)
    }
  }
  return fragment
}
