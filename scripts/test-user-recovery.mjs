import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {Readable} from 'node:stream'
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'reader-user-recovery-'))
const root=path.join(temporary,'knowledge')
process.env.DOCS_ROOT=root;process.env.READER_RUNTIME_DIR=path.join(temporary,'runtime')
fs.mkdirSync(path.join(root,'Library'),{recursive:true})
fs.writeFileSync(path.join(root,'Library','doc.md'),'# Original')
const {handleApi}=await import('../server/content-api.js')
const {workspace}=await import('../server/storage/workspace.js')
const repo=workspace(root)
async function request(method,url,body,role='owner',local=true){
 const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[])
 Object.assign(req,{method,url,headers:{'content-type':'application/json',host:'127.0.0.1:8197'},socket:{remoteAddress:local?'127.0.0.1':'external'}})
 return new Promise(resolve=>handleApi(req,{statusCode:200,setHeader(){},end(value){resolve({status:this.statusCode,...JSON.parse(value)})}},{role}))
}
try{
 const before=await request('GET','/api/doc?path=Library/doc.md')
 repo.setJSON('columns',{'Library/doc.md':{a:[100,200]}})
 assert.equal((await request('PUT','/api/access',{path:'Library',shared:true})).ok,true)
 assert.equal((await request('DELETE','/api/doc',{path:'Library/doc.md'})).ok,true)
 assert.equal(fs.existsSync(path.join(root,'Library/doc.md')),false)
 assert.equal((await request('GET','/api/trash',null,'guest')).status,403)
 let items=(await request('GET','/api/trash')).data.items
 assert.equal(items.length,1)
 assert.equal((await request('POST','/api/trash/restore',{trashId:items[0].id},'guest')).status,403)
 fs.writeFileSync(path.join(root,'Library/doc.md'),'Keep collision')
 assert.equal((await request('POST','/api/trash/restore',{trashId:items[0].id})).status,409)
 assert.equal(fs.readFileSync(path.join(root,'Library/doc.md'),'utf8'),'Keep collision')
 fs.unlinkSync(path.join(root,'Library/doc.md'))
 assert.equal((await request('POST','/api/trash/restore',{trashId:items[0].id})).ok,true)
 assert.equal((await request('GET','/api/doc?path=Library/doc.md')).data.id,before.data.id)
 assert.equal((await request('GET','/api/doc?path=Library/doc.md',null,'guest')).ok,false,'restored document stays private')
 assert.deepEqual(repo.getJSON('columns',{})['Library/doc.md'],{a:[100,200]})
 assert.equal((await request('DELETE','/api/doc',{path:'Library/doc.md'})).ok,true)
 const orphan=(await request('GET','/api/trash')).data.items[0]
 fs.renameSync(path.join(root,'Library'),path.join(root,'Moved'))
 assert.equal((await request('POST','/api/trash/restore',{trashId:orphan.id})).status,409)
 fs.renameSync(path.join(root,'Moved'),path.join(root,'Library'))
 assert.equal((await request('POST','/api/trash/restore',{trashId:orphan.id})).ok,true)
 assert.equal((await request('DELETE','/api/lib',{name:'Library'})).ok,true)
 items=(await request('GET','/api/trash')).data.items
 assert.equal((await request('POST','/api/trash/restore',{trashId:items[0].id})).ok,true)
 assert.equal(fs.readFileSync(path.join(root,'Library/doc.md'),'utf8'),'# Original')
 assert.equal((await request('POST','/api/backups',{action:'create'},'guest')).status,403)
 assert.equal((await request('POST','/api/backups',{action:'create'},'owner',false)).status,403)
 fs.writeFileSync(path.join(root,'.admin-password'),'test-only-secret')
 const backup=await request('POST','/api/backups',{action:'create'})
 assert.equal(backup.ok,true,backup.error)
 assert.equal(fs.existsSync(path.join(backup.data.directory,'知识库/.reader/state.sqlite')),false)
 assert.equal(fs.existsSync(path.join(backup.data.directory,'知识库/.admin-password')),false)
 fs.writeFileSync(path.join(root,'Library/doc.md'),'# Changed after backup')
 const restored=await request('POST','/api/backups',{action:'restore',backupId:backup.data.id})
 assert.equal(restored.ok,true,restored.error)
 assert.equal(fs.readFileSync(path.join(restored.data.directory,'Library/doc.md'),'utf8'),'# Original')
 assert.equal(fs.readFileSync(path.join(root,'Library/doc.md'),'utf8'),'# Changed after backup')
 assert.equal((await request('POST','/api/backups',{action:'restore',backupId:'../../escape'})).status,404)
 console.log('PASS: trash permission, private restore, stable IDs, layout recovery, collision protection, library restore and isolated full backup restore')
}finally{repo.db.close();fs.rmSync(temporary,{recursive:true,force:true})}
