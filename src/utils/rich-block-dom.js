import { iconSvg, iconPaths, ensureIconPaths } from './icon-catalog.js'
import { readingFragment } from './reading-fragment.js'
import { assetUrl, API_BASE } from './api.js'

export function calloutIcon(value, { editable = true, allowImage = () => true } = {}) {
  const icon = document.createElement('span')
  icon.className = 'rich-callout-icon'
  if (editable) {
    icon.contentEditable = 'false'
    icon.title = '更换提示块图标'
    icon.setAttribute('role', 'button')
    icon.setAttribute('aria-label', icon.title)
    icon.tabIndex = 0
  }
  const key = value.icon ?? '💡'
  if (key.startsWith('icon:')) {
    const name = key.slice(5)
    icon.insertAdjacentHTML('beforeend', iconSvg(name, 'fill', 22))
    if (!iconPaths(name)) ensureIconPaths().then(() => {
      const svg = icon.querySelector('svg')
      if (svg && icon.isConnected) svg.outerHTML = iconSvg(name, 'fill', 22)
    })
  } else if (/^(data:image\/|\/|https?:\/\/)/.test(key)) {
    const src = assetUrl(key)
    if (allowImage(src)) {
      const img = document.createElement('img')
      img.alt = ''
      img.width = img.height = 22
      img.style.objectFit = 'contain'
      img.src = src
      icon.append(img)
    }
  } else icon.textContent = key || '＋'
  return icon
}

const renderBody = raw => readingFragment(raw, { allowHtml: false, gaps: false })

export function richDOM(value, renderContent = renderBody, options = {}) {
  const { editable = true, links = true, allowImage = () => true } = options
  const root = document.createElement('div')
  root.className = 'reader-rich-block reader-rich-' + value.type
  if (editable) {
    root.dataset.readerBlock = JSON.stringify(value)
    root.contentEditable = 'false'
  }
  function appendText(raw) {
    const part = document.createElement('div')
    part.append(renderContent(String(raw || '')))
    root.append(part)
  }
  if (value.type === 'callout') {
    root.append(calloutIcon(value, options))
    appendText(value.content)
  }
  if (value.type === 'columns') {
    appendText(value.left)
    appendText(value.right)
  }
  if (value.type === 'figure') {
    root.style.textAlign = ['left','center','right'].includes(value.align) ? value.align : 'center'
    const fig = document.createElement('figure')
    fig.style.width = Math.max(20, Math.min(100, Number(value.width) || 100)) + '%'
    const src = /^(https?:\/\/|\/api\/file\?)/.test(value.src || '') ? assetUrl(value.src) : ''
    if (src && allowImage(src)) {
      const img = document.createElement('img')
      img.alt = value.alt || ''
      img.loading = 'lazy'
      img.src = src
      fig.append(img)
    } else if (value.alt) fig.append(value.alt)
    const caption = document.createElement('figcaption')
    caption.textContent = value.caption || ''
    fig.append(caption)
    root.append(fig)
  }
  if (value.type === 'card') {
    const title = document.createElement(links ? 'a' : 'span')
    title.textContent = value.title || '打开文档'
    if (links) {
      title.href = '#'
      title.onclick = async event => {
        event.preventDefault()
        try {
          const res = await fetch(API_BASE + '/api/resolve?id=' + encodeURIComponent(value.id))
          const out = await res.json()
          if (out.ok) window.dispatchEvent(new CustomEvent('reader-open-document', { detail: out.data.path }))
          else title.title = out.error
        } catch { title.title = '暂时无法打开文档' }
      }
    }
    root.append(title)
    appendText(value.description)
  }
  return root
}
