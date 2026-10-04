import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {atomicWrite} from '../storage/workspace.js'
const viewers=new Map()
process.once('exit',()=>{for(const value of viewers.values())value.child.kill()})
/** Open a restored directory as a separate local Reader; never repoint the current workspace. */
export async function openRestoredReader(root){
 if(viewers.has(root))return viewers.get(root).ready
 const stateFile=path.join(root,'.reader','restore-viewer.json')
 let port=0
 if(fs.existsSync(stateFile)){const value=JSON.parse(fs.readFileSync(stateFile,'utf8'));port=value.port;if(!Number.isInteger(port)||port<1||port>65535)throw Error('恢复副本的服务记录无效')}
 const child=spawn(process.execPath,[fileURLToPath(new URL('../serve.js',import.meta.url))],{env:{...process.env,DOCS_ROOT:root,PORT:String(port),READER_RUNTIME_DIR:path.join(root,'.reader','runtime'),ELECTRON_RUN_AS_NODE:'1',KB_TITLE:'Reader，恢复副本',READER_RESTORED_COPY:'1'},stdio:['ignore','ignore','pipe','ipc']})
 const ready=new Promise((resolve,reject)=>{
  let errors='',settled=false
  const timer=setTimeout(()=>{child.kill();reject(Error('恢复副本启动超时，请重试'))},15000)
  child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-1000)})
  child.once('error',error=>{clearTimeout(timer);viewers.delete(root);reject(error)})
  child.once('exit',()=>{clearTimeout(timer);viewers.delete(root);if(!settled)reject(Error(errors.includes('EADDRINUSE')?'恢复副本的原端口被占用，请关闭占用程序后重试':'恢复副本未能启动'))})
  child.on('message',message=>{const actual=Number(message?.port);if(!Number.isInteger(actual)||actual<1||actual>65535||settled)return;try{atomicWrite(stateFile,JSON.stringify({port:actual}));settled=true;clearTimeout(timer);resolve({url:`http://127.0.0.1:${actual}/`})}catch(error){child.kill();reject(error)}})
 })
 viewers.set(root,{child,ready});return ready
}
export function stopRestoredReaders(){for(const value of viewers.values())value.child.kill();viewers.clear()}
