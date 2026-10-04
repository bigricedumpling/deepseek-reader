import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {Readable} from 'node:stream'
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'reader-default-library-'))
process.env.DOCS_ROOT=path.join(temporary,'knowledge');process.env.READER_RUNTIME_DIR=path.join(temporary,'runtime');fs.mkdirSync(process.env.DOCS_ROOT,{recursive:true})
const {handleApi}=await import('../server/content-api.js')
const {workspace}=await import('../server/storage/workspace.js')
async function request(method,url,body){const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{method,url,headers:{'content-type':'application/json',host:'127.0.0.1:8197'},socket:{remoteAddress:'127.0.0.1'}});return new Promise(resolve=>handleApi(req,{statusCode:200,setHeader(){},end(value){resolve(JSON.parse(value))}},{role:'owner'}))}
try{
 const first=await request('GET','/api/libs');assert(first.ok);assert(first.data.libs.some(lib=>lib.name==='草稿'))
 const removed=await request('DELETE','/api/lib',{name:'草稿'});assert(removed.ok,removed.error)
 for(let i=0;i<3;i++){const result=await request('GET','/api/libs');assert(!result.data.libs.some(lib=>lib.name==='草稿'))}
 assert(!fs.existsSync(path.join(process.env.DOCS_ROOT,'草稿')))
 assert.equal(workspace(process.env.DOCS_ROOT).getJSON('onboarding',{}).defaultLibraryInitialized,true)
 console.log('PASS: initial draft is deletable and repeated library reads do not recreate it')
}finally{workspace(process.env.DOCS_ROOT).db.close();fs.rmSync(temporary,{recursive:true,force:true})}
