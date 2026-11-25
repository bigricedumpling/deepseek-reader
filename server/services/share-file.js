import fs from 'node:fs'
import path from 'node:path'
import { digest, fault } from '../storage/workspace.js'
import { documentImages } from './document-attachments.js'

const MIME = {
  '.md': 'text/markdown', '.htm': 'text/html', '.html': 'text/html', '.pdf': 'application/pdf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif'
}
const chunkSize = 24 * 1024
const imageReferences = new Map()
const maxParsedBytes = 8 * 1024 * 1024
const deniedImage = () => fault('FORBIDDEN', '此图片不属于所选文档可分享的内容', 403)
const changed = () => fault('CONFLICT', '文件已更改，请从第一块重新读取', 409)

function withFile(abs, read) {
  let fd
  try {
    fd = fs.openSync(abs, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0))
    const stat = fs.fstatSync(fd, { bigint: true })
    if (!stat.isFile()) throw fault('INVALID_PATH', '请选择普通文件')
    return read(fd, stat)
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw fault('NOT_FOUND', '文件已不存在', 404)
    throw error
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

function stamp(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':')
}

// Key the small cache by the actual open file's identity and revision; a new
// version of the source must authorize its image again, including on resume.
function imageBase(fd, stat, doc, reference) {
  if (stat.size > maxParsedBytes) throw fault('TOO_LARGE', '文档超过 8 MiB，无法核对图片引用，请使用带附件的导出文件', 413)
  const key = doc + ':' + stamp(stat)
  let references = imageReferences.get(key)
  if (!references) {
    references = documentImages(fs.readFileSync(fd, 'utf8'), /\.html?$/i.test(doc))
    if (stamp(fs.fstatSync(fd, { bigint: true })) !== stamp(stat)) throw changed()
    if (imageReferences.size >= 8) imageReferences.delete(imageReferences.keys().next().value)
    imageReferences.set(key, references)
  }
  if (!references.images.has(reference)) throw deniedImage()
  return references.base
}

function filePath(value) {
  return value && !/[\\\u0000-\u001f\u007f]/.test(value) && !(process.platform === 'win32' && value.includes(':')) &&
    value.split('/').every(part => part && part !== '.' && part !== '..')
}

function resolveImage(assets, node, ref, base) {
  const external = /^(?:[a-z][\w+.-]*:|\/\/)|[\\\u0000-\u001f\u007f]/i
  if (external.test(ref) || (base && external.test(base))) throw deniedImage()
  const origin = 'https://typocket.invalid'
  const source = new URL('/' + node.path.split('/').map(encodeURIComponent).join('/'), origin)
  let url
  try { url = new URL(ref, new URL(base || '', source)) } catch { throw deniedImage() }
  if (url.origin !== origin) throw deniedImage()

  let rel, assetId
  if (url.pathname === '/api/file') {
    assetId = url.searchParams.get('asset')
    rel = url.searchParams.get('path')
    if (Boolean(assetId) === Boolean(rel) || (rel && !filePath(rel))) throw deniedImage()
  } else {
    if (ref.startsWith('/') || ref.startsWith('#') || ref.startsWith('?')) throw deniedImage()
    try { rel = decodeURIComponent(url.pathname.slice(1)) } catch { throw deniedImage() }
    if (!filePath(rel) || rel.split('/')[0] !== node.path.split('/')[0]) throw deniedImage()
  }
  let resource = assets.find(rel || '', assetId)
  if (!resource && rel?.includes('/.配图/')) {
    assets.legacy(node.path)
    resource = assets.find(rel)
  }
  if (resource) {
    if (resource.owner !== node.id) throw deniedImage()
    return { rel: resource.path, options: { allowAsset: true, allowStorage: true } }
  }
  if (!rel || rel.split('/')[0] !== node.path.split('/')[0] || rel.split('/').some(part => part.startsWith('.'))) throw deniedImage()
  return { rel }
}

function integer(query, name, fallback, min, max) {
  const raw = query.get(name) ?? String(fallback)
  const value = Number(raw)
  if (!/^(0|[1-9]\d*)$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw fault('INVALID_RANGE', name + ' 超出允许的范围 ' + min + '–' + max)
  }
  return value
}

export function shareManifest(repo, lib, scan, query) {
  const files = scan.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  const revision = digest(JSON.stringify([lib, scan.complete, files]))
  const offset = integer(query, 'offset', 0, 0, Number.MAX_SAFE_INTEGER)
  const limit = integer(query, 'limit', 50, 1, 100)
  if ((offset || query.has('revision')) && query.get('revision') !== revision) {
    throw fault('CONFLICT', '知识库清单已更改，请从第一页重新读取', 409)
  }
  if (offset > files.length) throw fault('INVALID_RANGE', '知识库清单读取位置无效')
  const page = files.slice(offset, offset + limit).map(({path}) => {
    const kind = /\.md$/i.test(path) ? 'doc' : /\.pdf$/i.test(path) ? 'pdf' : 'h5'
    const node = repo.node(path, kind)
    if (!node || node.missing) throw fault('CONFLICT', '知识库清单已更改，请重新读取', 409)
    return { path, id: node.id }
  })
  const end = offset + page.length
  return { lib, files: page, complete: scan.complete, revision, nextOffset: end < files.length ? end : null }
}

function chunk(fd, stat, binding, query) {
  const revision = digest(JSON.stringify([binding, stamp(stat)]))
  const size = Number(stat.size)
  const offset = integer(query, 'offset', 0, 0, Number.MAX_SAFE_INTEGER)
  if ((offset || query.has('revision')) && query.get('revision') !== revision) throw changed()
  if (!Number.isSafeInteger(size) || offset > size) throw fault('INVALID_RANGE', '文件读取位置无效')
  const limit = integer(query, 'limit', chunkSize, 1, chunkSize)
  const bytes = Buffer.alloc(Math.min(limit, size - offset))
  let used = 0
  while (used < bytes.length) {
    const count = fs.readSync(fd, bytes, used, bytes.length - used, offset + used)
    if (!count) throw changed()
    used += count
  }
  if (stamp(fs.fstatSync(fd, { bigint: true })) !== stamp(stat)) throw changed()
  return { size, offset, revision, base64: bytes.toString('base64'), nextOffset: offset + used < size ? offset + used : null }
}

export function readShareFile(repo, assets, assertFile, query) {
  const doc = query.get('path')
  if (!filePath(doc) || !doc.includes('/') || !/\.(md|html?|pdf)$/i.test(doc)) throw fault('INVALID_PATH', '请指定文档在知识库中的完整路径')
  const mime = MIME[path.posix.extname(doc).toLowerCase()]
  return withFile(assertFile(doc), (fd, stat) => {
    const node = repo.node(doc, mime === 'text/markdown' ? 'doc' : mime === 'text/html' ? 'h5' : 'pdf')
    if (query.has('id') && query.get('id') !== node.id) throw fault('SELECTION_CHANGED', '文档标识和路径不匹配，请重新确认分享范围', 409)
    const scope = { path: doc, id: node.id }
    if (!query.has('image')) return { ...scope, mime, ...chunk(fd, stat, [doc, node.id], query) }
    const image = query.get('image')
    if (mime === 'application/pdf' || !image || image.length > 8192) throw deniedImage()
    const { rel, options } = resolveImage(assets, node, image, imageBase(fd, stat, doc, image))
    const imageMime = MIME[path.posix.extname(rel).toLowerCase()]
    if (!imageMime?.startsWith('image/')) throw deniedImage()
    return withFile(assertFile(rel, options), (imageFd, imageStat) => ({
      ...scope, image, mime: imageMime, ...chunk(imageFd, imageStat, [doc, node.id, stamp(stat), image], query)
    }))
  })
}
