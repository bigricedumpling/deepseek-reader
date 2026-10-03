import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { workspace, fault, digest } from '../storage/workspace.js'
import { resources } from './resources.js'
const tables = ['nodes','aliases','assets','asset_aliases','settings','versions','sources','workspace_previews','workspace_preview_assets']
const excluded = new Set(['state.sqlite','state.sqlite-wal','state.sqlite-shm','.admin-password','.分享.json'])
export function backupCopyFilter(file) {
  if (fs.lstatSync(file).isSymbolicLink()) throw fault('SYMLINK', '备份中存在符号链接，请先处理后重试')
  return !excluded.has(path.basename(file)) && !file.includes(path.sep+'.reader'+path.sep+'operations'+path.sep) && !(path.basename(file) === 'operations' && path.basename(path.dirname(file)) === '.reader')
}
export function backupService(repo) {
  const realRoot = fs.realpathSync(repo.root)
  const home = path.join(path.dirname(realRoot), 'Reader备份', digest(repo.root).slice(0,12))
  function safeHome() {
    if (home === realRoot || home.startsWith(realRoot + path.sep)) throw fault('INVALID_BACKUP_LOCATION', '备份目录不能位于当前知识库内')
    let dir = home
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) throw fault('SYMLINK', '备份位置不能是符号链接')
      dir = path.dirname(dir)
    }
    fs.mkdirSync(home, { recursive: true, mode: 0o700 })
  }
  function list() {
    safeHome()
    return { directory: home, items: fs.readdirSync(home).filter(id => /^[a-f0-9-]{36}$/.test(id)).flatMap(id => {
      try {
        const file = path.join(home,id,'metadata.json')
        if(fs.lstatSync(path.dirname(file)).isSymbolicLink() || fs.lstatSync(file).isSymbolicLink()) return []
        const metadata = JSON.parse(fs.readFileSync(file,'utf8'))
        return [{ id, at: metadata.createdAt }]
      } catch { return [] }
    }).sort((a,b) => b.at.localeCompare(a.at)) }
  }
  function create() {
    safeHome(); const id = randomUUID(), target = path.join(home,id), staging = path.join(home,'.creating-'+id)
    repo.db.exec('BEGIN IMMEDIATE')
    try {
      fs.mkdirSync(staging, { mode: 0o700 })
      fs.cpSync(repo.root,path.join(staging,'知识库'),{recursive:true,filter:backupCopyFilter})
      const metadata = { schemaVersion:3,createdAt:new Date().toISOString(),tables:Object.fromEntries(tables.map(table => [table,repo.db.prepare('SELECT * FROM '+table).all()])) }
      fs.writeFileSync(path.join(staging,'metadata.json'),JSON.stringify(metadata),{mode:0o600})
      fs.renameSync(staging,target)
      return { id, directory: target }
    } finally { repo.db.exec('ROLLBACK'); fs.rmSync(staging,{recursive:true,force:true}) }
  }
  async function restore(id) {
    safeHome()
    if (!list().items.some(item => item.id === id)) throw fault('NOT_FOUND','备份不存在',404)
    const backup = path.join(home,id), data = JSON.parse(fs.readFileSync(path.join(backup,'metadata.json'),'utf8'))
    if (data.schemaVersion !== 3 || !data.tables || Object.keys(data.tables).some(table => !tables.includes(table))) throw fault('INVALID_BACKUP','备份格式无效')
    const target = path.join(home,'恢复副本-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'-'+randomUUID().slice(0,8))
    let restored
    try {
      fs.cpSync(path.join(backup,'知识库'),target,{recursive:true,filter:backupCopyFilter})
      restored = workspace(target); resources(restored)
      await restored.mutate('restore','local owner',async () => {
        for (const [table,rows] of Object.entries(data.tables)) {
          if (!Array.isArray(rows)) throw fault('INVALID_BACKUP','备份数据无效')
          const known = new Set(restored.db.prepare('PRAGMA table_info('+table+')').all().map(row => row.name))
          for (const row of rows) {
            const columns=Object.keys(row)
            if (!columns.length || columns.some(column => !known.has(column))) throw fault('INVALID_BACKUP','备份字段无效')
            restored.db.prepare('INSERT OR REPLACE INTO '+table+' ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')').run(...Object.values(row))
          }
        }
      })
      return { directory:target }
    } catch(error) { restored?.db.close(); restored = undefined; fs.rmSync(target,{recursive:true,force:true}); throw error }
    finally { restored?.db.close() }
  }
  return { list,create,restore, directory:home }
}
