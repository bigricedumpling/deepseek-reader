import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import readline from 'node:readline'
const child=spawn(process.execPath,['plugins/reader-workspace/scripts/reader.mjs','--stdio'],{stdio:['pipe','pipe','pipe'],env:{...process.env,READER_TOKEN:''}})
const waiters=new Map(),lines=readline.createInterface({input:child.stdout})
lines.on('line',line=>{const m=JSON.parse(line);waiters.get(m.id)?.(m)})
let id=0
function rpc(method,params){const n=++id;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('MCP timeout')),5000);waiters.set(n,m=>{clearTimeout(timeout);resolve(m)});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n')})}
try{
 const init=await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});assert.equal(init.result.protocolVersion,'2025-06-18')
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n')
 const list=await rpc('tools/list');assert.equal(list.result.tools.length,10)
 assert(list.result.tools.find(x=>x.name==='reader_update').inputSchema.required.includes('revision'))
 const call=await rpc('tools/call',{name:'reader_read',arguments:{path:'Test/doc.md'}});assert.equal(call.result.isError,true)
 assert.match(call.result.content[0].text,/READER_TOKEN/)
 console.log('PASS: MCP handshake, discovery, revision schema, missing credential refusal')
}finally{child.stdin.end();child.kill()}
