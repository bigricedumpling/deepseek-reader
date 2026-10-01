import fs from 'node:fs'
import path from 'node:path'
import {workspace} from '../server/storage/workspace.js'
import {resources} from '../server/services/resources.js'
const backup=path.resolve(process.argv[2]||''),target=path.resolve(process.argv[3]||'')
if(!process.argv[2]||!process.argv[3]||fs.existsSync(target))throw Error('恢复只允许写入全新目录，禁止覆盖现有知识库')
const data=JSON.parse(fs.readFileSync(path.join(backup,'metadata.json'),'utf8'))
if(![1,2,3].includes(data.schemaVersion))throw Error('不支持的备份版本')
fs.cpSync(path.join(backup,'知识库'),target,{recursive:true});const repo=workspace(target);resources(repo)
const allowed=new Set(['nodes','aliases','assets','asset_aliases','settings','versions','sources','workspace_previews','workspace_preview_assets'])
await repo.mutate('restore','local restore',async()=>{for(const[table,rows]of Object.entries(data.tables)){if(!allowed.has(table))throw Error('无效备份表');for(const row of rows){const columns=Object.keys(row);const known=repo.db.prepare('PRAGMA table_info('+table+')').all().map(x=>x.name);if(columns.some(x=>!known.includes(x)))throw Error('无效字段');repo.db.prepare('INSERT OR REPLACE INTO '+table+' ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')').run(...Object.values(row))}}})
console.log('恢复完成：'+target);repo.db.close()
