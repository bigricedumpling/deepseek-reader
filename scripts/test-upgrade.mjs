import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
const baseline=process.env.READER_UPGRADE_BASELINE
if(!baseline)throw Error('需要 READER_UPGRADE_BASELINE 指向旧版 Reader 源码；升级验收不能用当前代码替代旧版')
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'reader-upgrade-')),root=path.join(temporary,'knowledge')
const createScript=`
import fs from 'node:fs';import path from 'node:path';import {workspace} from './server/storage/workspace.js';import {resources} from './server/services/resources.js';
const root=process.env.DOCS_ROOT;fs.mkdirSync(path.join(root,'Notes'),{recursive:true});fs.writeFileSync(path.join(root,'Notes','doc.md'),'# Before upgrade');const repo=workspace(root);resources(repo);const node=repo.node('Notes/doc.md');repo.db.prepare('UPDATE nodes SET meta=? WHERE id=?').run(JSON.stringify({icon:'📘',layout:'wide'}),node.id);repo.setJSON('columns',{'Notes/doc.md':{a:[120,240]}});console.log(JSON.stringify({id:node.id}));repo.db.close();`
try{
 const output=execFileSync(process.execPath,['--input-type=module','-e',createScript],{cwd:baseline,env:{...process.env,DOCS_ROOT:root},encoding:'utf8'})
 const old=JSON.parse(output.trim())
 process.env.DOCS_ROOT=root;process.env.READER_RUNTIME_DIR=path.join(temporary,'runtime')
 const {workspace}=await import('../server/storage/workspace.js'),{resources}=await import('../server/services/resources.js')
 const repo=workspace(root);resources(repo)
 assert.equal(repo.node('Notes/doc.md').id,old.id)
 assert.equal(repo.node('Notes/doc.md').meta.icon,'📘')
 assert.deepEqual(repo.getJSON('columns',{})['Notes/doc.md'],{a:[120,240]})
 assert.equal(fs.readFileSync(path.join(root,'Notes/doc.md'),'utf8'),'# Before upgrade')
 const {backupService}=await import('../server/services/backups.js'),service=backupService(repo),backup=service.create()
 const restored=await service.restore(backup.id)
 assert.equal(fs.readFileSync(path.join(restored.directory,'Notes/doc.md'),'utf8'),'# Before upgrade')
 repo.db.close()
 console.log('PASS: previous-version data opens with stable document IDs, content and page settings; new backup/restore preserves it')
}finally{fs.rmSync(temporary,{recursive:true,force:true})}
