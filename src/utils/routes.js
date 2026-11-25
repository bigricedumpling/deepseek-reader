/** 已交付的书签永久兼容；入口名称不再表示权限。 */
export function resolveEntry(pathname, search = '', base = '') {
  const relative = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname
  if (relative === '/' || !relative) return base + '/'
  const params = new URLSearchParams(search)
  const match = relative.match(/^\/(?:doc|edit|onlyread)(?:\/(.*))?\/?$/)
  let doc = ''
  if (match?.[1]) {
    try { doc = decodeURIComponent(match[1]).replace(/\/+$/, '') }
    catch { doc = match[1].replace(/\/+$/, '') }
  }
  if (doc) params.set('lib', doc.split('/')[0])
  // 访客首页不预设某篇个人文档。公开快照会按自己的可见内容选择首页。
  params.delete('token')
  const entry = /^\/onlyread(?:\/|$)/.test(relative) || relative === '/' || !relative ? 'onlyread' : 'doc'
  const path = base + '/' + entry + (doc ? '/' + doc.split('/').map(encodeURIComponent).join('/') : '/')
  const query = params.toString()
  return path + (query ? '?' + query : '')
}

export function documentRoutePath(file) {
  const path = String(file || '')
  return /\.(?:pdf|html?|md)\.md$/i.test(path) ? path : path.replace(/\.md$/i, '')
}

export function findRoutedDocument(files, path) {
  if (!path) return undefined
  return files.find(node => node.file === path)
    || files.find(node => documentRoutePath(node.file) === path)
    || files.find(node => node.file.replace(/\.(md|pdf|html?)$/i, '') === path)
}
