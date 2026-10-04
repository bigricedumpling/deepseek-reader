import fs from 'node:fs'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

export const digest = value => createHash('sha256').update(value).digest('hex')
export function fault(code, message, status = 400, details) {
  return Object.assign(new Error(message), { code, status, details })
}
export function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp-' + randomUUID()
  let fd
  try {
    fd = fs.openSync(tmp, 'wx', 0o600)
    fs.writeFileSync(fd, data); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined
    fs.renameSync(tmp, file)
  } finally { if (fd !== undefined) fs.closeSync(fd); try { fs.unlinkSync(tmp) } catch {} }
}
const instances = new Map()
export function workspace(root) {
  root = path.resolve(root)
  if (instances.has(root)) return instances.get(root)
  const home = path.join(root, '.reader')
  fs.mkdirSync(home, { recursive: true, mode:0o700 })
  const db = new DatabaseSync(path.join(home, 'state.sqlite'))
  const schemaVersion = db.prepare('PRAGMA user_version').get().user_version
  if (schemaVersion > 2) throw fault('SCHEMA_TOO_NEW', '抽屉由更新版本的阅读器管理，请先升级阅读器', 500)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, path TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}', fingerprint TEXT, missing INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS aliases (path TEXT PRIMARY KEY, id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, path TEXT UNIQUE NOT NULL, owner TEXT NOT NULL, mime TEXT);
    CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, action TEXT, actor TEXT, at INTEGER, details TEXT);
    CREATE TABLE IF NOT EXISTS retries (key TEXT PRIMARY KEY, fingerprint TEXT, result TEXT);
    CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, hash TEXT UNIQUE, name TEXT, scopes TEXT, permissions TEXT, expires INTEGER, revoked INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, node TEXT, revision TEXT, path TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS workspace_previews (id TEXT PRIMARY KEY, reference TEXT UNIQUE NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, updated INTEGER NOT NULL, incomplete INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS workspace_previews_updated ON workspace_previews(updated DESC);
    CREATE TABLE IF NOT EXISTS workspace_preview_assets (preview TEXT NOT NULL, id TEXT NOT NULL, mime TEXT NOT NULL, PRIMARY KEY(preview,id));`)
  if (!db.prepare('PRAGMA table_info(workspace_previews)').all().some(column => column.name === 'archived')) db.exec('ALTER TABLE workspace_previews ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
  if (!db.prepare('PRAGMA table_info(workspace_previews)').all().some(column => column.name === 'source_path')) db.exec("ALTER TABLE workspace_previews ADD COLUMN source_path TEXT NOT NULL DEFAULT ''")
  if (schemaVersion < 2) {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, node TEXT NOT NULL, kind TEXT NOT NULL, workspace TEXT NOT NULL DEFAULT '', reference TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sources_by_node ON sources(node, at);
      PRAGMA user_version=2;
      COMMIT;`)
  }
  let active = null
  const journalRoot = path.join(home, 'operations')
  fs.mkdirSync(journalRoot, { recursive: true })
  function restore(j) {
    for (const item of [...j.files].reverse()) {
      if(item.type==='mkdir'){try{fs.rmdirSync(item.path)}catch{}}
      else if (item.type === 'move') {
        if (fs.existsSync(item.to) && !fs.existsSync(item.from)) fs.renameSync(item.to, item.from)
      } else if (item.backup) atomicWrite(item.path, fs.readFileSync(item.backup))
      else if (fs.existsSync(item.path)) fs.unlinkSync(item.path)
    }
  }
  db.exec('BEGIN IMMEDIATE')
  for (const name of fs.readdirSync(journalRoot)) {
    const dir = path.join(journalRoot, name), manifest = path.join(dir, 'journal.json')
    if (!fs.existsSync(manifest)) continue
    const j = JSON.parse(fs.readFileSync(manifest, 'utf8'))
    // SQLite commit is the decision record. Uncommitted filesystem changes roll back.
    if (!db.prepare('SELECT id FROM operations WHERE id=?').get(j.id)) restore(j)
    fs.rmSync(dir, { recursive: true, force: true })
  }
  db.exec('COMMIT')
  function record(item) {
    if (!active) return
    active.files.push(item)
    atomicWrite(path.join(active.dir, 'journal.json'), JSON.stringify(active))
  }
  function write(file, data) {
    mkdir(path.dirname(file))
    if (active && !active.files.some(x => x.path === file)) {
      const backup = fs.existsSync(file) ? path.join(active.dir, 'backup-' + active.files.length) : null
      if (backup) atomicWrite(backup,fs.readFileSync(file))
      record({ type: 'write', path: file, backup })
    }
    mkdir(path.dirname(file));atomicWrite(file, data)
  }
  function remove(file) {
    if(!active)throw fault('TRANSACTION_REQUIRED','删除必须在事务中进行',500)
    if(!fs.existsSync(file))return
    const backup=path.join(active.dir,'backup-'+active.files.length);atomicWrite(backup,fs.readFileSync(file));record({type:'write',path:file,backup});fs.unlinkSync(file)
  }
  function mkdir(dir) {
    if(fs.existsSync(dir))return
    mkdir(path.dirname(dir));record({type:'mkdir',path:dir});fs.mkdirSync(dir)
  }
  function move(from, to) {
    if (!fs.existsSync(from)) throw fault('NOT_FOUND', '内容不存在', 404)
    mkdir(path.dirname(to))
    record({ type: 'move', from, to }); fs.renameSync(from, to)
  }
  async function mutate(action, actor, fn) {
    if (active) throw fault('BUSY', '另一个修改正在进行，请稍后重试', 409)
    const id = randomUUID(), dir = path.join(journalRoot, id)
    fs.mkdirSync(dir)
    const j = { id, dir, files: [] }
    try { db.exec('BEGIN IMMEDIATE') } catch(error) { fs.rmSync(dir,{recursive:true,force:true}); throw error }
    active = j
    try {
      atomicWrite(path.join(dir, 'journal.json'), JSON.stringify(j))
      const out = await fn()
      db.prepare('INSERT INTO operations VALUES (?,?,?,?,?)').run(id, action, actor, Date.now(), JSON.stringify({ files: j.files.map(x => ({ type:x.type, path:x.path && path.relative(root,x.path), from:x.from && path.relative(root,x.from), to:x.to && path.relative(root,x.to) })) }))
      db.exec('COMMIT'); active = null
      try{fs.rmSync(dir, { recursive: true, force: true })}catch{}; return out
    } catch (error) {
      try { db.exec('ROLLBACK') } catch {}
      active = null
      restore(j); fs.rmSync(dir, { recursive: true, force: true }); throw error
    }
  }
  function getJSON(key, fallback, legacy) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key)
    if (row) return JSON.parse(row.value)
    let value = fallback
    if (legacy && fs.existsSync(path.join(root, legacy))) {
      try { value = JSON.parse(fs.readFileSync(path.join(root, legacy), 'utf8')) }
      catch { throw fault('METADATA_INVALID', '元数据无法读取：' + legacy + '，原文件已保留', 500) }
    }
    setJSON(key, value); return value
  }
  function setJSON(key, value) { db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key, JSON.stringify(value)) }
  function node(rel, kind = 'doc') {
    let n = db.prepare('SELECT * FROM nodes WHERE path=?').get(rel)
    const abs = path.join(root, rel)
    if (!fs.existsSync(abs)) return n ? { ...n, missing:1, meta:JSON.parse(n.meta) } : null
    const st = fs.statSync(abs), fingerprint = `${st.dev}:${st.ino}`
    if (!n) {
      // Only identify an external move when the old physical path disappeared.
      const candidates = db.prepare('SELECT * FROM nodes WHERE fingerprint=?').all(fingerprint).filter(x => !fs.existsSync(path.join(root,x.path)))
      if (candidates.length) throw fault('EXTERNAL_MOVE', '检测到外部改名或移动，请通过阅读器迁移以保留权限：' + candidates[0].path, 409, { from:candidates[0].path, to:rel })
      n = { id:randomUUID(), path:rel, kind, meta:'{}', fingerprint, missing:0 }
      db.prepare('INSERT INTO nodes VALUES (?,?,?,?,?,?)').run(n.id,rel,kind,'{}',fingerprint,0)
    } else db.prepare('UPDATE nodes SET fingerprint=?,missing=0 WHERE id=?').run(fingerprint,n.id)
    return { ...n, meta:JSON.parse(n.meta) }
  }
  function byId(id) { const n=db.prepare('SELECT * FROM nodes WHERE id=?').get(id);return n?{...n,meta:JSON.parse(n.meta)}:null }
  function resolve(rel) {
    if (fs.existsSync(path.join(root,rel))) return rel
    const a=db.prepare('SELECT id FROM aliases WHERE path=?').get(rel)
    const n=a&&byId(a.id)
    return n && !n.path.split('/').some(x=>x.startsWith('.')) && fs.existsSync(path.join(root,n.path)) ? n.path : rel
  }
  function remap(from,to) {
    for (const n of db.prepare('SELECT * FROM nodes').all()) if(n.path===from||n.path.startsWith(from+'/')) {
      db.prepare('INSERT OR REPLACE INTO aliases VALUES (?,?)').run(n.path,n.id)
      db.prepare('UPDATE nodes SET path=? WHERE id=?').run(to+n.path.slice(from.length),n.id)
    }
    for (const a of db.prepare('SELECT * FROM assets').all()) if(a.path===from||a.path.startsWith(from+'/'))
      db.prepare('UPDATE assets SET path=? WHERE id=?').run(to+a.path.slice(from.length),a.id)
  }
  function pendingMoves() {
    const missing=db.prepare('SELECT * FROM nodes').all().filter(n=>!fs.existsSync(path.join(root,n.path)))
    const byFingerprint=new Map(missing.map(n=>[n.fingerprint,n])),out=[]
    const scan=rel=>{for(const e of fs.readdirSync(path.join(root,rel),{withFileTypes:true})){if(e.name.startsWith('.')||e.isSymbolicLink())continue;const p=path.posix.join(rel,e.name),st=fs.statSync(path.join(root,p)),old=byFingerprint.get(`${st.dev}:${st.ino}`);if(old){out.push({from:old.path,to:p});if(e.isDirectory())continue}if(e.isDirectory())scan(p)}}
    scan('');return out
  }
  const api={root,home,db,write,move,mkdir,remove,pendingMoves,mutate,getJSON,setJSON,node,byId,resolve,remap}
  instances.set(root,api);return api
}
