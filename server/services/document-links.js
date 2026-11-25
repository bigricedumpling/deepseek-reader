// Keep ordinary filenames (including CJK) legible in Markdown. Escape characters
// that would delimit a Markdown destination, query, fragment or HTML attribute.
export function encodeDocumentPath(value) {
  return value.replace(/[\s\u0000-\u001f\u007f%#?&<>()[\]"'`\\]/gu,
    char => encodeURIComponent(char).replace(/[()']/g, token => '%' + token.charCodeAt(0).toString(16)))
}

/** 把正文里的相对链接解析成知识库里的路径（点了要开哪一篇） */
export function resolveDocHref(href, fromDoc) {
  const raw = String(href || '').split(/[?#]/)[0]
  if (!raw || /^[a-z]+:/i.test(raw) || raw.startsWith('/')) return ''
  let decoded
  try { decoded = decodeURIComponent(raw) } catch { return '' }
  if (!/\.(md|pdf|html?)$/i.test(decoded)) return ''
  const parts = String(fromDoc || '').split('/').slice(0, -1)
  for (const seg of decoded.split('/')) {
    if (seg === '.' || seg === '') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

export function resolveDocReference(href, fromDoc) {
  const hash = href.indexOf('#')
  const file = hash === 0 && href.length > 1 ? fromDoc : resolveDocHref(href, fromDoc)
  return file ? { file, fragment: hash < 0 ? '' : href.slice(hash + 1) } : null
}
