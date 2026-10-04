import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'reader-performance-'))
const docs=path.join(root,'knowledge','Bench')
fs.mkdirSync(docs,{recursive:true})
for(let i=0;i<300;i++)fs.writeFileSync(path.join(docs,`${i}.md`),`# Document ${i}\n`+'Research notes for human and Agent.\n'.repeat(500))
const long='# Long document\n'+Array.from({length:10000},(_,i)=>`Paragraph ${i}: research, review, collect and find again.\n`).join('\n')
fs.writeFileSync(path.join(docs,'long.md'),long)
const start=performance.now()
const child=spawn(process.execPath,[fileURLToPath(new URL('../server/serve.js',import.meta.url))],{env:{...process.env,DOCS_ROOT:path.dirname(docs),PORT:'0',READER_RUNTIME_DIR:path.join(root,'runtime')},stdio:['ignore','ignore','pipe','ipc']})
let timer
try{
 const url=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Startup timeout')),20000);child.once('error',reject);child.once('exit',()=>reject(Error('Server exited')));child.on('message',value=>{if(value.port){clearTimeout(timer);resolve(`http://127.0.0.1:${value.port}`)}})})
 const metrics={platform:process.platform,node:process.version,documents:301,totalTextBytes:fs.readdirSync(docs).reduce((n,file)=>n+fs.statSync(path.join(docs,file)).size,0),startupMs:Math.round(performance.now()-start)}
 async function measure(name,route){const before=performance.now();const response=await fetch(url+'/api/'+route);const data=await response.json();if(!data.ok)throw Error(data.error);metrics[name]=Math.round(performance.now()-before);return data}
 await measure('treeMs','tree?lib=Bench')
 await measure('longDocumentMs','doc?path=Bench/long.md')
 await measure('fullScanSearchMs','search?lib=Bench&q=not-in-any-document')
 const multi=performance.now()
 await Promise.all(Array.from({length:8},(_,i)=>fetch(url+'/api/doc?path=Bench/'+i+'.md').then(r=>r.json()).then(r=>{if(!r.ok)throw Error(r.error)})))
 metrics.eightDocumentsMs=Math.round(performance.now()-multi)
 metrics.longDocumentBytes=Buffer.byteLength(long)
 console.log(JSON.stringify(metrics,null,2))
}finally{clearTimeout(timer);if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}fs.rmSync(root,{recursive:true,force:true})}
