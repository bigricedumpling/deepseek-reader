import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const defaultDirectory = fileURLToPath(new URL('../.runtime/route-aliases/', import.meta.url))

// Keep bookmarks for a particular data directory separate from all other instances.
export function loadRouteAliases(dataRoot, directory = defaultDirectory) {
  const id = createHash('sha256').update(path.resolve(dataRoot)).digest('hex').slice(0, 24)
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, id + '.json'), 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('旧书签配置无法读取。')
    return null
  }
}

function mapped(table, key) {
  if (!table || !Object.hasOwn(table, key)) return ''
  const value = table[key]
  return typeof value === 'string' && value.split('/').every(segment =>
    segment && segment !== '.' && segment !== '..' && !segment.includes('\\')
  ) ? value : ''
}

export function redirectForAlias(url, aliases) {
  if (!aliases) return ''
  const match = url.pathname.match(/^\/(doc|edit|onlyread)(?:\/(.*))?$/)
  if (!match && url.pathname !== '/') return ''
  let oldPath
  try { oldPath = decodeURIComponent(match?.[2] || '').replace(/\/+$/, '') } catch { return '' }
  const [first, ...rest] = oldPath.split('/')
  const prefix = rest.length && mapped(aliases.prefixes, first)
  const prefixed = prefix ? [prefix, ...rest].join('/') : oldPath
  const extension = prefixed.match(/\.md$/i)?.[0] || ''
  const document = mapped(aliases.documents, prefixed.replace(/\.md$/i, ''))
  const newPath = document ? document + extension : prefixed
  const library = mapped(aliases.libraries, url.searchParams.get('lib') || '')
  if (newPath === oldPath && !library) return ''

  const query = new URLSearchParams(url.searchParams)
  query.set('lib', newPath ? newPath.split('/')[0] : library)
  if (newPath === oldPath) return '?' + query.toString()
  const target = '/' + match[1] + '/' + newPath.split('/').map(encodeURIComponent).join('/')
  // A relative Location also works behind a reverse proxy that strips its base path.
  const directory = url.pathname.endsWith('/') ? url.pathname : path.posix.dirname(url.pathname)
  return './' + path.posix.relative(directory, target) + '?' + query.toString()
}
