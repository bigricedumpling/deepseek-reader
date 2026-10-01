import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {Readable,Writable} from 'node:stream'
import {DatabaseSync} from 'node:sqlite'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'reader-upgrade-'))
process.env.DOCS_ROOT=root
process.env.READER_PASSWORD='temporary-test-password'
const {handleApi,share}=await import('../server/content-api.js')
const {workspace}=await import('../server/storage/workspace.js')
const repo=workspace(root)
function request(method,url,body,role='owner',headers={}){
 const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[])
 Object.assign(req,{method,url,headers:{'content-type':'application/json',...headers},socket:{remoteAddress:'fixture'}})
 return new Promise((resolve,reject)=>{
  let bytes=[];const res=new Writable({write(chunk,_,next){bytes.push(chunk);next()}});res.statusCode=200;res.setHeader=()=>{}
  res.on('finish',()=>{const text=Buffer.concat(bytes).toString();let json;try{json=JSON.parse(text)}catch{}resolve({status:res.statusCode,json})});res.on('error',reject)
  handleApi(req,res,{role}).catch(reject)
 })
}
async function get(file){return (await request('GET','/api/doc?path='+encodeURIComponent(file))).json.data}
try{
 const legacyRoot=fs.mkdtempSync(path.join(os.tmpdir(),'reader-v1-'))
 try{
  fs.mkdirSync(path.join(legacyRoot,'.reader'))
  const legacy=new DatabaseSync(path.join(legacyRoot,'.reader','state.sqlite'))
  legacy.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO settings VALUES ('marker', '{\"kept\":true}'); PRAGMA user_version=1;")
  legacy.close()
  const migrated=workspace(legacyRoot)
  assert.equal(migrated.db.prepare('PRAGMA user_version').get().user_version,2)
  assert.equal(migrated.getJSON('marker',{}).kept,true)
  assert.ok(migrated.db.prepare("SELECT name FROM sqlite_master WHERE name='sources'").get())
  migrated.db.close()
 }finally{fs.rmSync(legacyRoot,{recursive:true,force:true})}
 assert.equal((await request('POST','/api/lib',{name:'Test'})).json.ok,true)
 const a=(await request('POST','/api/doc',{dir:'Test',name:'one',content:'first'})).json.data.file
 const initial=await get(a)
 fs.writeFileSync(path.join(root,a),'external')
 assert.equal((await request('PUT','/api/doc',{path:a,revision:initial.revision,content:'stale'})).status,409)
 assert.equal(fs.readFileSync(path.join(root,a),'utf8'),'external')
 assert.equal((await request('PUT','/api/doc',{path:a,content:'stale'})).status,428)
 const fresh=await get(a)
 assert.equal((await request('PUT','/api/doc',{path:a,revision:fresh.revision,content:'saved'})).json.ok,true)
 share.setShared('Test',true)
 const asset=(await request('POST','/api/asset',{path:a,mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='})).json.data
 assert.equal((await request('GET',asset.url,null,'guest')).status,200)
 const renamed=(await request('PATCH','/api/doc',{path:a,name:'two'})).json.data.file
 assert.equal((await get(renamed)).id,initial.id)
 share.setShared(renamed,false)
 assert.equal((await request('GET',asset.url,null,'guest')).status,403)
 assert.equal((await request('GET','/api/doc?path='+a,null,'guest')).status,403)
 const meta=(await request('GET','/api/metadata?path='+renamed)).json.data
 assert.equal((await request('PUT','/api/metadata',{path:renamed,revision:meta.revision,meta:{icon:'📘',cover:{type:'gradient'}}})).json.ok,true)
 assert.equal((await request('PUT','/api/lib/name',{from:'Test',to:'Renamed'})).json.ok,true)
 const moved='Renamed/two.md'
 assert.equal((await get(moved)).id,initial.id)
 assert.equal((await get(moved)).meta.icon,'📘')
 assert.equal((await request('GET',asset.url)).status,200)
 const token=(await request('POST','/api/agent-keys',{name:'test',scopes:['Renamed'],write:true})).json.data.token
 const headers={'x-reader-agent':token}
 assert.deepEqual((await request('GET','/api/agent-libs',null,'guest',headers)).json.data.libs.map(x=>x.name),['Renamed'])
 assert.equal((await request('GET','/api/agent-libs',null,'guest')).status,403)
 assert.equal((await request('GET','/api/doc?id='+initial.id,null,'guest',headers)).json.data.content,'saved')
 assert.equal((await request('GET','/api/tree',null,'guest',headers)).status,400)
 assert.equal((await request('POST','/api/lib',{name:'No'},'guest',headers)).status,403)
 const create={dir:'Renamed',name:'retry',content:'body',requestId:'unique',source:{kind:'conversation',workspace:'Graduation project',reference:'session-1'}}
 const once=await request('POST','/api/doc',create,'guest',headers),twice=await request('POST','/api/doc',create,'guest',headers)
 assert.equal(once.json.data.file,twice.json.data.file)
 assert.equal(once.json.data.id,twice.json.data.id)
 assert.equal(once.json.data.revision,twice.json.data.revision)
 const createdSources=(await request('GET','/api/sources?id='+once.json.data.id,null,'guest',headers)).json.data.sources
 assert.equal(createdSources.length,1,'重试不应重复写入来源')
 assert.equal(createdSources[0].workspace,'Graduation project')
 assert.equal((await request('GET','/api/sources?path='+encodeURIComponent(once.json.data.file),null,'guest')).status,403,'公开文档不暴露私人来源')
 assert.equal(fs.readdirSync(path.join(root,'Renamed')).filter(x=>x.startsWith('retry')).length,1)
 // A failure after filesystem mutation restores both body and metadata.
 await assert.rejects(repo.mutate('fault','test',async()=>{repo.write(path.join(root,moved),'broken');repo.setJSON('probe',{bad:true});throw Error('injected')}))
 assert.equal(fs.readFileSync(path.join(root,moved),'utf8'),'saved')
 assert.equal(repo.db.prepare("SELECT value FROM settings WHERE key='probe'").get(),undefined)
 // Legacy image URLs survive library rename and external reconciliation.
 const legacyDoc='Renamed/legacy.md';await request('POST','/api/doc',{dir:'Renamed',name:'legacy',content:'legacy'})
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')
 const hash=x=>createHash('sha256').update(x).digest('hex')
 const legacyFile='Renamed/.配图/'+hash(legacyDoc).slice(0,16)+'-'+hash(bytes)+'.png'
 fs.mkdirSync(path.dirname(path.join(root,legacyFile)),{recursive:true});fs.writeFileSync(path.join(root,legacyFile),bytes)
 const oldURL='/api/file?path='+encodeURIComponent(legacyFile)+'&doc='+encodeURIComponent(legacyDoc)
 assert.equal((await request('GET',oldURL)).status,200)
 assert.equal((await request('PUT','/api/lib/name',{from:'Renamed',to:'Moved'})).json.ok,true)
 assert.equal((await request('GET',oldURL)).status,200)
 fs.renameSync(path.join(root,'Moved'),path.join(root,'External'))
 const pending=(await request('GET','/api/reconcile')).json.data
 assert.ok(pending.some(x=>x.from==='Moved'&&x.to==='External'))
 assert.equal((await request('POST','/api/reconcile',{from:'Moved',to:'External'})).json.ok,true)
 assert.equal((await get('External/two.md')).id,initial.id)
 assert.equal((await request('GET',oldURL)).status,200)
 assert.equal((await request('GET','/api/doc?path=External/two.md',null,'guest')).status,403)
 share.setShared('External/legacy.md',false)
 assert.equal((await request('GET',oldURL,null,'guest')).status,403)
 const preview=(await request('POST','/api/workspace-preview',{reference:'dsh-resource://file/session/test/draft.md',sourcePath:'/workspace/draft.md',title:'draft.md',content:'![image](./draft.png)',assets:[{reference:'./draft.png',mime:'image/png',base64:bytes.toString('base64')}]})).json.data
 assert.equal((await request('GET','/api/workspace-preview?id='+preview.id)).json.data.sourcePath,'/workspace/draft.md')
 // An isolated backup restores body, stable IDs, ownership, aliases and metadata.
 const backup=root+'-backup',restored=root+'-restored'
 try{
  execFileSync(process.execPath,['scripts/backup-workspace.mjs',backup],{env:{...process.env,DOCS_ROOT:root}})
  execFileSync(process.execPath,['scripts/restore-workspace.mjs',backup,restored])
  const restoredRepo=workspace(restored)
  assert.equal(restoredRepo.byId(initial.id).path,'External/two.md')
  assert.equal(restoredRepo.byId(initial.id).meta.icon,'📘')
  assert.equal(restoredRepo.db.prepare('SELECT workspace FROM sources WHERE node=?').get(once.json.data.id).workspace,'Graduation project')
  assert.equal(fs.readFileSync(path.join(restored,'External/two.md'),'utf8'),'saved')
  assert.equal(restoredRepo.db.prepare('SELECT count(*) n FROM credentials').get().n,0)
  assert.ok(restoredRepo.db.prepare('SELECT id FROM asset_aliases WHERE path=?').get(legacyFile))
  assert.equal(restoredRepo.db.prepare('SELECT title FROM workspace_previews WHERE id=?').get(preview.id).title,'draft.md')
  assert.equal(restoredRepo.db.prepare('SELECT source_path FROM workspace_previews WHERE id=?').get(preview.id).source_path,'/workspace/draft.md')
  assert.ok(fs.readdirSync(path.join(restored,'.reader/previews',preview.id)).length)
  restoredRepo.db.close()
 }finally{fs.rmSync(backup,{recursive:true,force:true});fs.rmSync(restored,{recursive:true,force:true})}
 // A revoked token is unusable.
 const credential=repo.db.prepare('SELECT id FROM credentials').get()
 await request('DELETE','/api/agent-keys',{id:credential.id})
 assert.equal((await request('GET','/api/doc?id='+initial.id,null,'guest',headers)).status,401)
 console.log('PASS: revisions, stable IDs, metadata, rename, asset privacy, scoped Agent, retries, rollback, revocation')
}finally{repo.db.close();fs.rmSync(root,{recursive:true,force:true})}
