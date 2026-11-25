import fs from 'node:fs/promises'
import path from 'node:path'
import { fault } from '../storage/workspace.js'
import { searchableMarkdown } from './search-text.js'

const cacheBudget = 32 * 1024 * 1024
const entryBudget = 2 * 1024 * 1024
const byName = new Intl.Collator('zh-CN', { numeric: true }).compare
const missing = error => ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(error.code)

// A library may contain documents which have never been opened or indexed.
export function librarySearch(repo, assertMd, ignoreDirectory = () => false) {
  const cache = new Map(), pending = new Map()
  let bytes = 0

  function remember(file, stamp, text) {
    const previous = cache.get(file)
    if (previous) { cache.delete(file); bytes -= previous.size }
    const size = 2 * (text.length + file.length) + 192
    if (size > entryBudget) return
    while (bytes + size > cacheBudget) {
      const key = cache.keys().next().value
      bytes -= cache.get(key).size
      cache.delete(key)
    }
    cache.set(file, { stamp, text, size })
    bytes += size
  }

  async function source(file) {
    const absolute = assertMd(file)
    const stat = await fs.stat(absolute)
    const stamp = [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':')
    const old = cache.get(file)
    if (old?.stamp === stamp) return old.text
    const running = pending.get(file)
    if (running?.stamp === stamp) return running.task
    const task = fs.readFile(absolute, 'utf8').then(searchableMarkdown)
    pending.set(file, { stamp, task })
    try {
      const text = await task
      if (pending.get(file)?.task === task) remember(file, stamp, text)
      return text
    } finally { if (pending.get(file)?.task === task) pending.delete(file) }
  }

  async function* files(dir, depth, cancelled) {
    if (depth > 8 || cancelled()) return
    let entries
    try { entries = await fs.readdir(path.join(repo.root, dir), { withFileTypes: true }) }
    catch (error) { if (missing(error)) return; throw error }
    for (const item of entries.sort((a, b) => byName(a.name, b.name))) {
      if (cancelled()) return
      if (item.name.startsWith('.') || item.name === 'node_modules' || item.isSymbolicLink()) continue
      const file = path.posix.join(dir, item.name)
      if (item.isDirectory()) {
        if (!ignoreDirectory(path.join(repo.root, file))) yield* files(file, depth + 1, cancelled)
      } else if (depth && item.isFile() && /\.md$/i.test(item.name)) yield file
    }
  }

  return async function search(url, ctx) {
    if (ctx.role !== 'owner' || ctx.agentScopes) throw fault('FORBIDDEN', '需要本机知识库访问权限', 403)
    const query = (url.searchParams.get('q') || '').trim().slice(0, 200)
    const offset = Math.max(0, Math.floor(Number(url.searchParams.get('offset')) || 0))
    const hits = [], cancelled = ctx.cancelled || (() => false)
    let count = 0
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu')
    if (query) for await (const file of files('', 0, cancelled)) {
      let text
      try { text = await source(file) }
      catch (error) { if (missing(error)) continue; throw error }
      const match = pattern.exec(text)
      if (!match || count++ < offset) continue
      if (hits.length === 50) return { ok: true, data: { hits, truncated: true } }
      const end = match.index + match[0].length
      const lineEnd = text.indexOf('\n', end)
      const snippet = text.slice(Math.max(text.lastIndexOf('\n', match.index - 1) + 1, match.index - 32), Math.min(lineEnd < 0 ? text.length : lineEnd, end + 64))
      hits.push({ file, name: path.basename(file, path.extname(file)), text: snippet })
    }
    return { ok: true, data: { hits, truncated: false } }
  }
}
