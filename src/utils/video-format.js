import { API_BASE, assetUrl } from './api.js'

import { videoTypes, videoExtensions } from '../../server/services/video-types.js'

export { maxVideoBytes, videoTypes, videoExtensions } from '../../server/services/video-types.js'
export const videoAccept = [...Object.values(videoTypes), 'm4v'].map(ext => '.' + ext).join(',')

export function videoMime(file) {
  if (Object.hasOwn(videoTypes, file.type)) return file.type
  const extension = file.name?.match(videoExtensions)?.[1].toLowerCase()
  return Object.keys(videoTypes).find(type => videoTypes[type] === (extension === 'm4v' ? 'mp4' : extension))
}

export function playableVideoUrl(value, docFile) {
  const url = String(value || '').trim()
  if (!url || /[\u0000-\u001f\u007f\\]/.test(url)) return ''
  if (/^\/api\/file\?/i.test(url)) return assetUrl(url)
  if (/^(https?:\/\/|\/\/)/i.test(url)) {
    try {
      const parsed = new URL(url, 'https://typocket.local')
      return parsed.username || parsed.password ? '' : url
    } catch { return '' }
  }
  if (/^[a-z][\w.+-]*:|^#|^\?/i.test(url)) return ''
  if (!docFile || url.startsWith('/')) return url
  const base = 'https://typocket.local/'
  try {
    const directory = docFile.split('/').map(encodeURIComponent).join('/')
    const relative = new URL(url, base + directory)
    const path = decodeURIComponent(relative.pathname.slice(1))
    return API_BASE + '/api/file?' + new URLSearchParams({ path, doc: docFile }) + relative.hash
  } catch { return '' }
}

export function videoScale(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 100
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '&#10;').replaceAll('\r', '&#13;')
}

export function videoMarkdown({ src, caption, scale }) {
  const width = videoScale(scale)
  return '<video data-typocket-video controls playsinline preload="metadata" src="' + escapeAttribute(src) + '"' +
    (caption ? ' title="' + escapeAttribute(caption) + '"' : '') +
    (width < 100 ? ' style="width: ' + width + '%"' : '') + '></video>'
}
