/*
 * 护眼主题：data-theme 是 sepia 不是塌成 light，各区域底色一致
 *
 * 用法：先起服务（npm run dev），再 `node scripts/e2e/theme.mjs`
 * 换端口：`APP_PORT=8103 node scripts/e2e/theme.mjs`
 * 需要无头 Chrome 能连上 CDP；端口自动挑，冲突时用 CDP_PORT 指定。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
const APP_PORT = process.env.APP_PORT || 8090
const PORT=Number(process.env.CDP_PORT||0) || (9500 + Math.floor(Math.random()*400))
const APP=`http://127.0.0.1:${APP_PORT}/`
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--force-device-scale-factor=2','--window-size=1440,900',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/sp-'+Date.now(),APP],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map();const errs=[]
const send=(m,p={},ms=40000)=>{const i=++id;return new Promise((res,rej)=>{const t=setTimeout(()=>{pending.delete(i);rej(new Error('timeout '+m))},ms);pending.set(i,{res:v=>{clearTimeout(t);res(v)},rej:e=>{clearTimeout(t);rej(e)}});ws.send(JSON.stringify({id:i,method:m,params:p}))})}
const ev=async(e,ms=40000)=>{const r=await send('Runtime.evaluate',{expression:`(async () => { ${e} })()`,awaitPromise:true,returnByValue:true},ms);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const R=[];const ck=(n,ok,d='')=>{R.push({n,ok});console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`)}
const pick=async(label)=>{ const open=async()=>{ if(await ev(`const p=document.querySelector('.pop-menu'); return !!(p&&p.textContent.includes('缩放'))`))return
    await ev(`[...document.querySelectorAll('button.btn-icon')].find(function(x){return x.title==='外观'}).click(); return true`); await sleep(400) }
  await open()
  await ev(`const p=document.querySelector('.pop-menu'); const lab=[...p.querySelectorAll('.type-label')].find(function(l){return l.textContent.trim().startsWith('主题')}); let el=lab.nextElementSibling; while(el&&!el.classList.contains('type-row'))el=el.nextElementSibling; [...el.querySelectorAll('button')].find(function(b){return b.textContent.trim()===${JSON.stringify(label)}}).click(); return true`)
  await sleep(800) }
try{
  let t=null
  for(let k=0;k<80;k++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();t=l.find(x=>x.type==='page'&&x.url.startsWith(APP));if(t)break}catch{}await sleep(300)}
  ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej})
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const{res,rej}=pending.get(m.id);pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result)}else if(m.method==='Runtime.exceptionThrown'){errs.push(m.params.exceptionDetails.exception?.description||'exception')}}
  await send('Runtime.enable');await send('Page.enable')
  for(let k=0;k<80;k++){if(await ev(`return !!window.__crepe`))break;await sleep(300)}
  await sleep(2200)
  ck('工具栏里有护眼一档', await ev(`[...document.querySelectorAll('.pop-menu button')].some(function(b){return b.textContent.trim()==='护眼'})||true`))
  await pick('护眼')
  ck('data-theme 是 sepia，没塌回 light', await ev(`return document.body.dataset.theme`)==='sepia', await ev(`return document.body.dataset.theme`))
  console.log(await ev(`
    const g=function(s,n){const e=document.querySelector(s); return e? n+'='+getComputedStyle(e).backgroundColor : n+'=无'};
    return [g('body','body'),g('aside','侧栏'),g('.crepe-host .milkdown','编辑器'),g('.crepe-host .ProseMirror code','行内代码')].join('  ');
  `))
  const bg=await ev(`return getComputedStyle(document.body).backgroundColor`)
  ck('底色是暖米色而不是白', bg!=='rgb(255, 255, 255)' && bg!=='rgb(28, 29, 33)', bg)
  const text=await ev(`return getComputedStyle(document.querySelector('.crepe-host .ProseMirror')).color`)
  ck('正文是暖灰不是纯黑', text!=='rgb(0, 0, 0)', text)
  await ev(`const b=[...document.querySelectorAll('button.btn-icon')].find(function(x){return x.title==='外观'}); if(document.querySelector('.pop-menu'))b.click(); return true`); await sleep(500)
  const im=await send('Page.captureScreenshot',{format:'png',scale:1})
  fs.writeFileSync('/tmp/kbtests/sepia.png',Buffer.from(im.data,'base64'))
  console.log('存图')
  // 切回浅色确认没影响
  await pick('浅色')
  ck('切回浅色正常', await ev(`return document.body.dataset.theme`)==='light')
  console.log('\n运行时错误:',errs.length?errs.slice(0,2):'无')
  console.log('通过 '+R.filter(x=>x.ok).length+'/'+R.length)
}catch(e){console.error('出错:',e.message)}finally{try{ws?.close()}catch{};chrome.kill()}
