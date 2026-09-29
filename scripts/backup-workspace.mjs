import fs from 'node:fs'
import path from 'node:path'
import {workspace} from '../server/storage/workspace.js'
const root=path.resolve(process.env.DOCS_ROOT||'../知识库'),target=path.resolve(process.argv[2]||'')
if(!process.argv[2]||target===root||target.startsWith(root+path.sep)||fs.existsSync(target))throw Error('指定知识库之外的全新备份目录')
const repo=workspace(root)
// Same lock as content mutations: copies and metadata represent one consistent point in time.
repo.db.exec('BEGIN IMMEDIATE')
try{
 fs.mkdirSync(target,{recursive:true})
 fs.cpSync(root,path.join(target,'知识库'),{recursive:true,filter:p=>!p.includes(path.sep+'.reader'+path.sep+'state.sqlite')&&!p.includes(path.sep+'.reader'+path.sep+'operations')})
 const tables=['nodes','aliases','assets','asset_aliases','settings','versions']
 const manifest={schemaVersion:1,createdAt:new Date().toISOString(),tables:Object.fromEntries(tables.map(t=>[t,repo.db.prepare('SELECT * FROM '+t).all()]))}
 fs.writeFileSync(path.join(target,'metadata.json'),JSON.stringify(manifest,null,2),{mode:0o600})
 fs.writeFileSync(path.join(target,'README.txt'),'正文和附件位于知识库/；metadata.json 保存稳定标识、权限、页面设置及历史索引。会话和 Agent 凭据不包含在内。\n')
 console.log(target)
}finally{repo.db.exec('ROLLBACK');repo.db.close()}
