import fs from 'node:fs'
import path from 'node:path'
import { workspace } from '../storage/workspace.js'
import { resources } from './resources.js'

/** Read-only inventory using the same visibility and directory rules as snapshots. */
export function publicScope(source, share) {
  const libraries = new Map()
  function walk(dir = '') {
    for (const item of fs.readdirSync(path.join(source.root, dir), {withFileTypes:true})) {
      if (item.name.startsWith('.') || item.isSymbolicLink() || item.name === 'node_modules') continue
      const rel = path.posix.join(dir, item.name)
      if (!share.isShared(rel)) continue
      if (item.isDirectory()) walk(rel)
      else if (item.isFile() && /\.(md|markdown|pdf|html?)$/i.test(rel)) {
        const name = dir ? rel.split('/')[0] : '根目录'
        if (!libraries.has(name)) libraries.set(name, {name, documents:[]})
        libraries.get(name).documents.push(rel)
      }
    }
  }
  walk()
  const items = [...libraries.values()]
  return {libraries:items,documents:items.reduce((total,item)=>total+item.documents.length,0)}
}

// Only public documents and assets owned by public documents enter this directory.
// Credentials, sources, previews, revisions and operation logs are never copied.
export function buildPublicSnapshot(source, share, destination) {
  const target = workspace(destination), visible = new Set()
  const assets = resources(source)
  function copy(rel) {
    const from = path.join(source.root, rel), to = path.join(destination, rel)
    if (!path.resolve(to).startsWith(path.resolve(destination) + path.sep) || !fs.realpathSync(from).startsWith(fs.realpathSync(source.root) + path.sep)) throw Error('资源路径超出抽屉')
    if (fs.lstatSync(from).isSymbolicLink()) throw Error('公开快照不支持符号链接')
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to)
  }
  function walk(dir = '') {
    for (const item of fs.readdirSync(path.join(source.root, dir), { withFileTypes: true })) {
      if (item.name.startsWith('.') || item.isSymbolicLink() || item.name === 'node_modules') continue
      const rel = path.posix.join(dir, item.name)
      if (!share.isShared(rel)) continue
      if (item.isDirectory()) { fs.mkdirSync(path.join(destination, rel), { recursive: true }); walk(rel) }
      else if (item.isFile() && /\.(md|markdown|pdf|html?|png|jpe?g|webp|gif|svg|css|woff2?|ttf|otf)$/i.test(rel)) {
        copy(rel)
        if (/\.(md|markdown|pdf|html?)$/i.test(rel)) {
          assets.legacy(rel)
          const node = source.node(rel)
          if (node) { visible.add(node.id); target.db.prepare('INSERT OR REPLACE INTO nodes VALUES (?,?,?,?,?,?)').run(node.id, node.path, node.kind, JSON.stringify(node.meta), node.fingerprint, 0) }
        }
      }
    }
  }
  walk()
  for (const row of source.db.prepare('SELECT * FROM assets').all()) {
    if (!visible.has(row.owner) || !fs.existsSync(path.join(source.root, row.path))) continue
    copy(row.path); target.db.prepare('INSERT INTO assets VALUES (?,?,?,?)').run(row.id, row.path, row.owner, row.mime)
  }
  target.db.exec('CREATE TABLE IF NOT EXISTS asset_aliases (path TEXT PRIMARY KEY,id TEXT NOT NULL)')
  for (const row of source.db.prepare('SELECT * FROM asset_aliases').all()) {
    if (target.db.prepare('SELECT id FROM assets WHERE id=?').get(row.id)) target.db.prepare('INSERT INTO asset_aliases VALUES (?,?)').run(row.path, row.id)
  }
  for (const row of source.db.prepare('SELECT * FROM aliases').all()) {
    if (visible.has(row.id)) target.db.prepare('INSERT INTO aliases VALUES (?,?)').run(row.path, row.id)
  }
  const libraries = source.getJSON('libraries', { libs: [], config: {} })
  const libs = libraries.libs.filter(lib => share.isShared(lib.name))
  target.setJSON('libraries', { ...libraries, libs })
  target.setJSON('access', { shared: Object.fromEntries(libs.map(lib => [lib.name, true])), locked: Object.fromEntries(libs.map(lib => [lib.name, true])), editable: {} })
  // Keep presentation settings for public paths only.
  for (const key of ['order', 'colWidths', 'foldables']) {
    const settings = source.getJSON(key, {})
    target.setJSON(key, Object.fromEntries(Object.entries(settings).filter(([rel]) => share.isShared(rel))))
  }
  target.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  target.db.close()
  return { documents: visible.size, libraries: libs.length }
}
