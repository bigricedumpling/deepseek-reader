/*
 * 窄/中/宽三档在各种窗口尺寸下都要互不相同
 *
 * 用法：先起服务（npm run dev），再 `node scripts/e2e/readingwidth.mjs`
 * 换端口：`APP_PORT=8103 node scripts/e2e/readingwidth.mjs`
 * 需要无头 Chrome 能连上 CDP；端口自动挑，冲突时用 CDP_PORT 指定。
 */
import { spawn } from 'node:child_process'
const APP_PORT = process.env.APP_PORT || 8090
const PORT=Number(process.env.CDP_PORT||0) || (9500 + Math.floor(Math.random()*400))
const APP=`http://127.0.0.1:${APP_PORT}/`
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--window-size=1440,900',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/wd-'+Date.now(),APP],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map()
const send=(m,p={},ms=40000)=>{const i=++id;return new Promise((res,rej)=>{const t=setTimeout(()=>{pending.delete(i);rej(new Error('timeout '+m))},ms);pending.set(i,{res:v=>{clearTimeout(t);res(v)},rej:e=>{clearTimeout(t);rej(e)}});ws.send(JSON.stringify({id:i,method:m,params:p}))})}
const ev=async(e,ms=40000)=>{const r=await send('Runtime.evaluate',{expression:`(async () => { ${e} })()`,awaitPromise:true,returnByValue:true},ms);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const openMenu=async()=>{ if(await ev(`const p=document.querySelector('.pop-menu'); return !!(p&&p.textContent.includes('正文字号'))`))return
  await ev(`[...document.querySelectorAll('button.btn-icon')].find(function(x){return x.title==='排版'}).click(); return true`); await sleep(400) }
const pick=async(txt)=>{ await openMenu()
  await ev(`const p=document.querySelector('.pop-menu'); const lab=[...p.querySelectorAll('.type-label')].find(function(l){return l.textContent.trim().startsWith('正文宽度')}); let el=lab.nextElementSibling; while(el&&!el.classList.contains('type-row'))el=el.nextElementSibling; [...el.querySelectorAll('button')].find(function(b){return b.textContent.trim()===${JSON.stringify(txt)}}).click(); return true`)
  await sleep(500) }
const MEASURE = `(() => {
  const sc=document.querySelector('.editor-shell');
  const pm=document.querySelector('.crepe-host .ProseMirror');
  const p=pm.querySelector(':scope > p');
  const shell=Math.round(sc.getBoundingClientRect().width);
  return {可用:shell, measure:sc.style.getPropertyValue('--measure'), 段落宽:p?Math.round(p.getBoundingClientRect().width):-1};
})()`
try{
  let t=null
  for(let k=0;k<80;k++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();t=l.find(x=>x.type==='page'&&x.url.startsWith(APP));if(t)break}catch{}await sleep(300)}
  ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej})
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const{res,rej}=pending.get(m.id);pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result)}}
  await send('Runtime.enable')
  for(let k=0;k<80;k++){if(await ev(`return document.querySelectorAll('button.doc-title').length`))break;await sleep(300)}
  await ev(`const b=[...document.querySelectorAll('button.doc-title')].find(function(x){return x.textContent.trim()==='评测调研'}); if(b)b.click(); return !!b;`)
  for(let k=0;k<60;k++){if(await ev(`return !!(window.__crepe && document.querySelector('.crepe-host .ProseMirror > p'))`))break;await sleep(400)}
  await sleep(2000)
  for (const [w,h,toc] of [[1440,900,true],[1440,900,false],[1200,900,true],[1100,900,true]]) {
    await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false})
    await sleep(400)
    const cur=await ev(`return document.querySelector('.toc-panel').getBoundingClientRect().width>100`)
    if (cur!==toc) { await ev(`[...document.querySelectorAll('button.btn-icon')].find(function(x){return x.title==='目录'}).click(); return true`); await sleep(600) }
    const out=[]
    for (const txt of ['窄','中','宽']) { await pick(txt); const m=await ev(`return ${MEASURE}`); out.push(txt+'='+m.段落宽) }
    console.log(`窗口 ${w}  目录${toc?'开':'关'}  编辑器可用 ${(await ev(`return ${MEASURE}`)).可用}px  →  ${out.join('  ')}`)
  }
  await send('Emulation.clearDeviceMetricsOverride')
}catch(e){console.error('出错:',e.message)}finally{try{ws?.close()}catch{};chrome.kill()}
