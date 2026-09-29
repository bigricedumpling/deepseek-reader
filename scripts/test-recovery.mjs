import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'reader-recovery-')),storage=new URL('../server/storage/workspace.js',import.meta.url).href
try{
 fs.writeFileSync(path.join(root,'note.md'),'before')
 const code=`import{workspace}from ${JSON.stringify(storage)};const r=workspace(${JSON.stringify(root)});await r.mutate('crash','test',async()=>{r.write(${JSON.stringify(path.join(root,'note.md'))},'after');r.mkdir(${JSON.stringify(path.join(root,'newfolder'))});r.setJSON('crash',true);process.exit(7)})`
 const child=spawnSync(process.execPath,['--input-type=module','-e',code]);assert.equal(child.status,7)
 assert.equal(fs.readFileSync(path.join(root,'note.md'),'utf8'),'after')
 const {workspace}=await import(storage);const repo=workspace(root)
 assert.equal(fs.readFileSync(path.join(root,'note.md'),'utf8'),'before')
 assert.equal(fs.existsSync(path.join(root,'newfolder')),false)
 assert.equal(repo.getJSON('crash',false),false)
 assert.equal(repo.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
 repo.db.close();console.log('PASS: interrupted process restores content, directories and metadata')
}finally{fs.rmSync(root,{recursive:true,force:true})}
