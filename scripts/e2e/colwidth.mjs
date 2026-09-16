/*
 * 列宽拖拽：拖、此消彼长、总宽不变、指示线、写旁路文件、刷新恢复、markdown 零污染
 *
 * 用法：先起服务（npm run dev），再 `node scripts/e2e/colwidth.mjs`
 * 换端口：`APP_PORT=8103 node scripts/e2e/colwidth.mjs`
 * 需要无头 Chrome 能连上 CDP；端口自动挑，冲突时用 CDP_PORT 指定。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
const APP_PORT = process.env.APP_PORT || 8090
const PORT=Number(process.env.CDP_PORT||0) || (9500 + Math.floor(Math.random()*400))
const APP=`http://127.0.0.1:${APP_PORT}/`
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--window-size=1440,900',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/cw-'+Date.now(),APP],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map();const errs=[]
const send=(m,p={},ms=40000)=>{const i=++id;return new Promise((res,rej)=>{const t=setTimeout(()=>{pending.delete(i);rej(new Error('timeout '+m))},ms);pending.set(i,{res:v=>{clearTimeout(t);res(v)},rej:e=>{clearTimeout(t);rej(e)}});ws.send(JSON.stringify({id:i,method:m,params:p}))})}
const ev=async(e,ms=40000)=>{const r=await send('Runtime.evaluate',{expression:`(async () => { ${e} })()`,awaitPromise:true,returnByValue:true},ms);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const R=[];const ck=(n,ok,d='')=>{R.push({n,ok});console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`)}
try{
  let t=null
  for(let k=0;k<80;k++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();t=l.find(x=>x.type==='page'&&x.url.startsWith(APP));if(t)break}catch{}await sleep(300)}
  ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej})
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const{res,rej}=pending.get(m.id);pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result)}else if(m.method==='Runtime.exceptionThrown'){errs.push(m.params.exceptionDetails.exception?.description||'exception')}}
  await send('Runtime.enable')
  for(let k=0;k<80;k++){if(await ev(`return document.querySelectorAll('button.doc-title').length`))break;await sleep(300)}
  await ev(`const b=[...document.querySelectorAll('button.doc-title')].find(function(x){return x.textContent.trim()==='训练数据调研'}); if(b)b.click(); return !!b;`)
  for(let k=0;k<60;k++){if(await ev(`return !!(window.__col && document.querySelector('.crepe-host .ProseMirror table tr'))`))break;await sleep(400)}
  await sleep(2500)
  const bi=await ev(`return window.__col.parts().findIndex(function(p){return p.cells.length>0})`)
  const g=await ev(`
    const sc=document.getElementById('main-scroll-container');
    const p=window.__col.parts()[${bi}];
    let c=p.cells[0].getBoundingClientRect(); sc.scrollTop += (c.top-300);
    await new Promise(function(r){setTimeout(r,600);});
    const b=p.cells[0].getBoundingClientRect();
    return {x:Math.round(b.right), y:Math.round(b.top+b.height/2), 宽:p.cells.map(function(c){return Math.round(c.getBoundingClientRect().width)})};
  `)
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:g.x-120,y:g.y,buttons:0}); await sleep(250)
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:g.x,y:g.y,buttons:0}); await sleep(400)
  ck('边界上出现 col-resize', await ev(`return document.querySelector('.crepe-host').style.cursor`)==='col-resize')
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:g.x,y:g.y,button:'left',buttons:1,clickCount:1}); await sleep(150)
  for(let k=1;k<=8;k++){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:g.x+Math.round(120*k/8),y:g.y,button:'left',buttons:1});await sleep(70)}
  const during=await ev(`const p=window.__col.parts()[${bi}]; return {fixed:getComputedStyle(p.table).tableLayout, 线:!!document.querySelector('body > .col-guide')}`)
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:g.x+120,y:g.y,button:'left',buttons:0,clickCount:1}); await sleep(1200)
  const after=await ev(`const p=window.__col.parts()[${bi}]; return p.cells.map(function(c){return Math.round(c.getBoundingClientRect().width)})`)
  ck('列宽真的变了', JSON.stringify(after)!==JSON.stringify(g.宽), `${JSON.stringify(g.宽)} → ${JSON.stringify(after)}`)
  ck('相邻两列此消彼长', after[0]+after[1]===g.宽[0]+g.宽[1])
  ck('切到 fixed', during.fixed==='fixed')
  ck('拖动时有指示线', during.线===true)
  ck('松手后指示线撤掉', (await ev(`return !!document.querySelector('body > .col-guide')`))===false)
  let disk=null; try{ disk=JSON.parse(fs.readFileSync('/tmp/kb-ui/.表宽.json','utf8')) }catch{}
  ck('写进旁路文件', !!(disk && Object.keys(disk).length), disk?Object.keys(disk).join(','):'(空)')
  await ev(`location.reload(); return true`).catch(()=>{})
  await sleep(6000)
  for(let k=0;k<80;k++){if(await ev(`return document.querySelectorAll('button.doc-title').length`))break;await sleep(400)}
  await ev(`const b=[...document.querySelectorAll('button.doc-title')].find(function(x){return x.textContent.trim()==='训练数据调研'}); if(b)b.click(); return !!b;`)
  for(let k=0;k<60;k++){if(await ev(`return !!(window.__col && document.querySelector('.crepe-host .ProseMirror table tr'))`))break;await sleep(400)}
  await sleep(2500)
  const re=await ev(`const p=window.__col.parts()[${bi}]; return p.cells.map(function(c){return Math.round(c.getBoundingClientRect().width)})`)
  ck('刷新后恢复', JSON.stringify(re)===JSON.stringify(after), JSON.stringify(re))
  ck('markdown 没被污染', !/colwidth|style="width/.test(await ev(`return window.__crepe.getMarkdown()`)))
  console.log('\n运行时错误:',errs.length?errs.slice(0,2):'无')
  console.log('通过 '+R.filter(x=>x.ok).length+'/'+R.length)
}catch(e){console.error('出错:',e.message)}finally{try{ws?.close()}catch{};chrome.kill()}
