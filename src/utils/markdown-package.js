import { zipSync, strToU8 } from 'fflate'
import { rewriteDocumentUrls } from '../../server/services/document-attachments.js'
import { API_BASE, assetUrl } from './api.js'
import { videoExtensions, videoTypes } from './video-format.js'

const imageTypes = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/gif':'gif', 'image/svg+xml':'svg', 'image/avif':'avif', 'image/bmp':'bmp', 'image/x-icon':'ico' }
const fileImage = /\.(?:png|jpe?g|webp|gif|svg|avif|bmp|ico)$/i

function attachment(raw, kind, file) {
  if (!raw || raw.startsWith('#') || /^(?:data:(?:image|video)\/)/i.test(raw)) return null
  const managed = raw.startsWith('/api/file?')
  let url
  if (managed) {
    url = new URL(assetUrl(raw), location.origin)
    const target = url.searchParams.get('path') || ''
    if (kind !== 'image' && !url.searchParams.has('asset') && !fileImage.test(target) && !videoExtensions.test(target) && !/\.pdf$/i.test(target)) return null
  } else if (/^(?:https?:|\/\/|blob:)/i.test(raw)) {
    if (kind !== 'image' && kind !== 'video') return null
    url = new URL(raw, location.href)
  }
  else if (/^[a-z][\w+.-]*:|^\/|\\/i.test(raw)) return null
  else {
    const origin = new URL(file.split('/').map(encodeURIComponent).join('/'), location.origin + '/')
    const rel = new URL(raw, origin)
    if (rel.origin !== location.origin) return null
    const dest = decodeURIComponent(rel.pathname.slice(1))
    if (kind !== 'image' && !fileImage.test(dest) && !videoExtensions.test(dest) && !/\.pdf$/i.test(dest)) return null
    url = new URL(API_BASE + '/api/file', location.origin)
    url.searchParams.set('path', dest)
    url.searchParams.set('doc', file)
    url.hash = rel.hash
  }
  const fragment = url.hash
  url.hash = ''
  return { url: url.href, fragment }
}

export async function markdownPackage(doc, raw) {
  const context = new Map(), files = Object.create(null)
  // Record the references actually parsed as content. Code samples, unrelated
  // links and frontmatter retain their original bytes.
  rewriteDocumentUrls(raw, false, (reference, kind) => {
    const asset = attachment(reference, kind, doc.file)
    if (asset) context.set(kind + '\n' + reference, asset)
  })
  const names = new Map()
  let total = 0
  for (const [key, asset] of context) {
    if (names.has(asset.url)) continue
    try {
      const response = await fetch(asset.url, { credentials: 'same-origin', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw Error()
      const blob = await response.blob(), mime = blob.type.toLowerCase().split(';')[0]
      const extension = imageTypes[mime] || videoTypes[mime] || (mime === 'application/pdf' ? 'pdf' : '')
      if (!extension || !blob.size) throw Error()
      total += blob.size
      if (total > 256 * 1024 * 1024) throw RangeError()
      const output = 'attachments/' + String(names.size + 1).padStart(3, '0') + '.' + extension
      files[output] = new Uint8Array(await blob.arrayBuffer())
      names.set(asset.url, output)
    } catch (error) {
      if (error instanceof RangeError) throw Error('附件总大小超过 256 MB，无法打包。')
      throw Error('无法打包附件「' + key.slice(key.indexOf('\n') + 1, key.indexOf('\n') + 101) + '」，请确认附件可读取。')
    }
  }
  const source = rewriteDocumentUrls(raw, false, (reference, kind) => {
    const asset = context.get(kind + '\n' + reference)
    return asset && names.get(asset.url) + asset.fragment
  })
  const name = (doc.name || '文档').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
  files[name + '.md'] = strToU8(source)
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' })
}
