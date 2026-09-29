import fs from 'node:fs'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {workspace} from '../server/storage/workspace.js'
import {resources} from '../server/services/resources.js'
const root=path.resolve(process.env.DOCS_ROOT||'../知识库'),repo=workspace(root),assets=resources(repo)
await repo.mutate('workspace migration','local migration',async()=>{
 for(const[key,file,fallback]of [['libraries','.知识库.json',{libs:[]}],['access','.分享.json',{}],['order','.顺序.json',{order:{}}],['columns','.表宽.json',{}],['foldables','.折叠标题.json',{}]])repo.getJSON(key,fallback,file)
 for(const name of fs.readdirSync(root))if(!name.startsWith('.')&&fs.lstatSync(path.join(root,name)).isDirectory())assets.beforeMove(name)
 const legacy=path.join(root,'.版本'),done=repo.getJSON('legacyVersions',[])
 if(fs.existsSync(legacy)&&fs.statSync(legacy).isDirectory())for(const name of fs.readdirSync(legacy)){
  if(done.includes(name))continue
  const node=repo.db.prepare("SELECT * FROM nodes WHERE kind='doc'").all().find(n=>name.endsWith('__'+encodeURIComponent(n.path))||name.endsWith('__'+createHash('sha256').update(n.path).digest('hex')+'.md'))
  if(!node)continue
  const data=fs.readFileSync(path.join(legacy,name)),id=randomUUID(),rel='.reader/versions/'+id+'.md'
  repo.write(path.join(root,rel),data);repo.db.prepare('INSERT INTO versions VALUES (?,?,?,?,?)').run(id,node.id,createHash('sha256').update(data).digest('hex'),rel,fs.statSync(path.join(legacy,name)).mtimeMs);done.push(name)
 }
 repo.setJSON('legacyVersions',done);repo.setJSON('schema',{version:1,migratedAt:Date.now()})
})
const{createShare}=await import('../server/share.js');createShare(root)
console.log(JSON.stringify({nodes:repo.db.prepare('SELECT count(*) n FROM nodes').get().n,assets:repo.db.prepare('SELECT count(*) n FROM assets').get().n,history:repo.db.prepare('SELECT count(*) n FROM versions').get().n,integrity:repo.db.prepare('PRAGMA integrity_check').get()}))
repo.db.close()
