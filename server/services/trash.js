import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fault } from '../storage/workspace.js'

export function trashService(repo, { safeResolve, assets, share, registry, saveRegistry }) {
  const under = (key, root) => key === root || key.startsWith(root + '/')
  const records = () => repo.getJSON('trashEntries', [])
  const relative = absolute => path.relative(repo.root, absolute).split(path.sep).join('/')
  function move(original) {
    const source = safeResolve(original)
    if (!original || original.split('/').some(part => part.startsWith('.'))) throw fault('INVALID_PATH', '无法删除此位置')
    if (!fs.existsSync(source)) throw fault('NOT_FOUND', '内容不存在', 404)
    const id = randomUUID(), trashed = '.回收站/' + id + '__' + path.basename(source)
    const settings = {}
    for (const key of ['columns', 'foldables', 'order']) {
      const value = repo.getJSON(key, {}), map = key === 'order' ? value.order || {} : value
      settings[key] = Object.fromEntries(Object.entries(map).filter(([entry]) => under(entry, original)))
    }
    const library = !original.includes('/') ? registry().libs.find(item => item.name === original) : undefined
    const item = { id, original, trashed, at: Date.now(), kind: fs.statSync(source).isDirectory() ? 'folder' : 'file', settings, library }
    repo.mkdir(safeResolve('.回收站'))
    assets.beforeMove(original)
    repo.move(source, safeResolve(trashed)); repo.remap(original, trashed); share.rename(original, trashed)
    repo.setJSON('trashEntries', [...records(), item])
    return trashed
  }
  function list() {
    const all = records(), known = new Set(all.map(item => item.trashed))
    const dir = safeResolve('.回收站')
    const legacyCount = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => !known.has(relative(path.join(dir, name)))).length : 0
    return { items: all.filter(item => fs.existsSync(safeResolve(item.trashed))).sort((a,b) => b.at-a.at).map(({ settings, library, trashed, ...item }) => item), legacyCount }
  }
  function restore(id) {
    const all = records(), item = all.find(entry => entry.id === id)
    if (!item) throw fault('NOT_FOUND', '回收记录不存在', 404)
    const source = safeResolve(item.trashed), target = safeResolve(item.original)
    if (!fs.existsSync(source)) throw fault('NOT_FOUND', '回收文件已被移走', 404)
    if (fs.existsSync(target)) throw fault('CONFLICT', '原位置已有同名内容。请先改名或移走现有内容，再恢复。', 409)
    if (!fs.existsSync(path.dirname(target))) throw fault('MISSING_PARENT', '原文件夹不存在，请先恢复所属文件夹或知识库。', 409)
    assets.beforeMove(item.trashed)
    repo.move(source, target); repo.remap(item.trashed, item.original)
    share.rename(item.trashed, item.original); share.setShared(item.original, false)
    for (const key of ['columns', 'foldables', 'order']) {
      const value = repo.getJSON(key, {}), restored = { ...(key === 'order' ? value.order || {} : value), ...item.settings[key] }
      repo.setJSON(key, key === 'order' ? { ...value, order: restored } : restored)
    }
    if (item.library) {
      const reg = registry(); reg.libs = reg.libs.filter(lib => lib.name !== item.original)
      const restoredLibrary = { ...item.library }
      if (reg.libs.some(lib => lib.id === restoredLibrary.id)) restoredLibrary.id = 'restored-' + randomUUID()
      reg.libs.push(restoredLibrary); saveRegistry(reg)
    }
    repo.setJSON('trashEntries', all.filter(entry => entry.id !== id))
    return { path: item.original }
  }
  return { move, list, restore }
}
