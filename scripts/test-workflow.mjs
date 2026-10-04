import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {callTool} from '../plugins/reader-workspace/scripts/reader.mjs'
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'reader-workflow-'))
const source=path.join(temporary,'work','research.md'),text='# Research\n\nA finding to keep.'
fs.mkdirSync(path.dirname(source));fs.writeFileSync(source,text)
let timer
const child=spawn(process.execPath,[fileURLToPath(new URL('../server/serve.js',import.meta.url))],{env:{...process.env,DOCS_ROOT:path.join(temporary,'knowledge'),READER_RUNTIME_DIR:path.join(temporary,'runtime'),PORT:'0'},stdio:['ignore','ignore','pipe','ipc']})
try{
 const url=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Server startup timeout')),15000);child.once('error',reject);child.once('exit',()=>reject(Error('Server exited')));child.on('message',message=>{if(message.port){clearTimeout(timer);resolve(`http://127.0.0.1:${message.port}/`)}})})
 async function owner(method,route,body){const response=await fetch(url+'api/'+route,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();assert.equal(result.ok,true,result.error);return result.data}
 await owner('POST','lib',{name:'Research'});await owner('POST','lib',{name:'Private'})
 const preview=await owner('POST','workspace-preview',{reference:source,title:'Research',content:text})
 const saved=await owner('POST','collect-workspace-preview',{id:preview.id,dir:'Research',name:'Finding'})
 const doc=await owner('GET','doc?path='+encodeURIComponent(saved.file))
 await owner('POST','category',{parent:'Research',name:'Archive'})
 await owner('PUT','move/doc',{file:saved.file,dir:'Research/Archive'})
 const issued=await owner('POST','agent-keys',{name:'Isolated workflow test',scopes:['Research'],write:true,days:7})
 process.env.READER_URL=url;process.env.READER_TOKEN=issued.token
 const found=await callTool('reader_search',{lib:'Research',q:'finding'})
 assert.equal(found.ok,true,found.error);assert.equal(found.data.hits[0].id,doc.id)
 const read=await callTool('reader_read',{id:doc.id});assert.equal(read.data.content,text)
 const sources=await callTool('reader_sources',{id:doc.id});assert.equal(sources.data.sources[0].reference,source)
 assert.equal((await callTool('reader_update',{id:doc.id,revision:read.data.revision,content:text+'\n\nAgent follow-up.',requestId:'follow-up'})).ok,true)
 assert.equal((await callTool('reader_update',{id:doc.id,revision:read.data.revision,content:'stale',requestId:'stale'})).code,'CONFLICT')
 assert.equal((await callTool('reader_tree',{lib:'Private'})).ok,false)
 assert.equal(fs.readFileSync(source,'utf8'),text,'collection and Agent edits never write back to source')
 assert.equal((await owner('GET','workspace-previews')).length,1,'collection keeps browsing record')
 console.log('PASS: actual HTTP workspace preview → private copy → folder → search → scoped Agent source/read/update; original preserved and stale update rejected')
}finally{clearTimeout(timer);if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}fs.rmSync(temporary,{recursive:true,force:true})}
