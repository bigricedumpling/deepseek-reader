import fs from 'node:fs'
import path from 'node:path'
import {backupCopyFilter} from '../server/services/backups.js'
import {resources} from '../server/services/resources.js'
import {workspace} from '../server/storage/workspace.js'
const root=path.resolve(process.env.DOCS_ROOT||'../知识库'),target=path.resolve(process.argv[2]||'')
if(!process.argv[2]||target===root||target.startsWith(root+path.sep)||fs.existsSync(target))throw Error('指定知识库之外的全新备份目录')
const repo=workspace(root);resources(repo)
// Same lock as content mutations: copies and metadata represent one consistent point in time.
repo.db.exec('BEGIN IMMEDIATE')
try{
 fs.mkdirSync(target,{recursive:true})
 fs.cpSync(root,path.join(target,'知识库'),{recursive:true,filter:p=>backupCopyFilter(p)&&!p.includes(path.sep+'.reader'+path.sep+'state.sqlite')&&!p.includes(path.sep+'.reader'+path.sep+'operations')})
 const tables=['nodes','aliases','assets','asset_aliases','settings','versions','sources','workspace_previews','workspace_preview_assets']
 const manifest={schemaVersion:3,createdAt:new Date().toISOString(),tables:Object.fromEntries(tables.map(t=>[t,repo.db.prepare('SELECT * FROM '+t).all()]))}
 fs.writeFileSync(path.join(target,'metadata.json'),JSON.stringify(manifest,null,2),{mode:0o600})
 fs.writeFileSync(path.join(target,'README.txt'),'正文、附件和待整理快照位于知识库/；metadata.json 保存稳定标识、权限、页面设置、历史索引、私人来源记录及待整理索引。会话和 Agent 凭据不包含在内。\n')
 console.log(target)
}finally{repo.db.exec('ROLLBACK');repo.db.close()}
