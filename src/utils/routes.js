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
  if (doc.startsWith('笔试题/')) doc = 'Agent（设计方向）/' + doc.slice('笔试题/'.length)
  if (doc.startsWith('业务面/')) doc = '面试准备/' + doc
  if (doc) params.set('lib', doc.split('/')[0])
  else if (!params.get('lib')) {
    doc = 'Agent（设计方向）/笔试题交付：题目一'
    params.set('lib', 'Agent（设计方向）')
  }
  params.delete('token')
  const entry = /^\/onlyread(?:\/|$)/.test(relative) || relative === '/' || !relative ? 'onlyread' : 'doc'
  return base + '/' + entry + (doc ? '/' + doc.split('/').map(encodeURIComponent).join('/') : '') + '?' + params.toString()
}
