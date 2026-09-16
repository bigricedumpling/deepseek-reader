/*
 * 块手柄（加号 + 六点）在三种阅读宽度下都不越界压到侧栏
 *
 * 用法：先起服务（npm run dev），再 `node scripts/e2e/blockhandle.mjs`
 * 换端口：`APP_PORT=8103 node scripts/e2e/blockhandle.mjs`
 * 需要无头 Chrome 能连上 CDP；端口自动挑，冲突时用 CDP_PORT 指定。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
const APP_PORT = process.env.APP_PORT || 8090
const PORT=Number(process.env.CDP_PORT||0) || (9500 + Math.floor(Math.random()*400))
const APP=`http://127.0.0.1:${APP_PORT}/`
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--force-device-scale-factor=2','--window-size=1440,900',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/hd-'+Date.now(),APP],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map()
const send=(m,p={},ms=40000)=>{const i=++id;return new Promise((res,rej)=>{const t=setTimeout(()=>{pending.delete(i);rej(new Error('timeout '+m))},ms);pending.set(i,{res:v=>{clearTimeout(t);res(v)},rej:e=>{clearTimeout(t);rej(e)}});ws.send(JSON.stringify({id:i,method:m,params:p}))})}
const ev=async(e,ms=40000)=>{const r=await send('Runtime.evaluate',{expression:`(async () => { ${e} })()`,awaitPromise:true,returnByValue:true},ms);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const R=[];const ck=(n,ok,d='')=>{R.push({n,ok});console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`)}
try{
  let t=null
  for(let k=0;k<80;k++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();t=l.find(x=>x.type==='page'&&x.url.startsWith(APP));if(t)break}catch{}await sleep(300)}
  ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej})
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const{res,rej}=pending.get(m.id);pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result)}}
  await send('Runtime.enable');await send('Page.enable')
  for(let k=0;k<80;k++){if(await ev(`return !!window.__crepe`))break;await sleep(300)}
  await sleep(2200)
  for (const w of ['宽','中','窄']) {
    // 选宽度
    await ev(`const b=[...document.querySelectorAll('button.btn-icon')].find(function(x){return x.title==='排版'}); if(!document.querySelector('.pop-menu'))b.click(); return true`); await sleep(400)
    await ev(`const p=document.querySelector('.pop-menu'); const lab=[...p.querySelectorAll('.type-label')].find(function(l){return l.textContent.trim().startsWith('正文宽度')}); let el=lab.nextElementSibling; while(el&&!el.classList.contains('type-row'))el=el.nextElementSibling; [...el.querySelectorAll('button')].find(function(b){return b.textContent.trim()===${JSON.stringify('X')}.replace('X','')||b.textContent.trim()==='${w}'}).click(); return true`)
    await sleep(700)
    await ev(`document.body.click(); return true`); await sleep(300)
    // 悬停到一个标题上，块手柄才会出现
    const pos=await ev(`const pm=document.querySelector('.crepe-host .ProseMirror');
      const h=[...pm.querySelectorAll(':scope > h2, :scope > h1')][1]||pm.querySelector(':scope > h2');
      if(!h) return null; h.scrollIntoView({block:'center'}); await new Promise(function(r){setTimeout(r,500)});
      const b=h.getBoundingClientRect(); return {x:Math.round(b.left+80),y:Math.round(b.top+b.height/2)};`)
    if(pos){ await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pos.x-200,y:pos.y-140,buttons:0}); await sleep(250)
             await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pos.x,y:pos.y,buttons:0}); await sleep(800) }
    const m=await ev(`
      const pm=document.querySelector('.crepe-host .ProseMirror');
      const sc=document.querySelector('.editor-shell');
      const aside=document.querySelector('aside');
      // 找可见的块手柄
      const hs=[...document.querySelectorAll('.milkdown-block-handle')].filter(function(h){return parseFloat(getComputedStyle(h).opacity)>0.05 && h.getBoundingClientRect().width>5});
      const h=hs[0];
      return {编辑器左:Math.round(pm.getBoundingClientRect().left), 侧栏右:Math.round(aside.getBoundingClientRect().right),
        手柄数:hs.length, 手柄左:h?Math.round(h.getBoundingClientRect().left):null, 手柄宽:h?Math.round(h.getBoundingClientRect().width):null};
    `)
    const ok = m.手柄数===0 || m.手柄左 >= m.侧栏右
    ck(`宽度「${w}」：手柄没压到侧栏`, ok, `侧栏右=${m.侧栏右} 编辑器左=${m.编辑器左} 手柄左=${m.手柄左} 宽=${m.手柄宽} 可见手柄=${m.手柄数}`)
  }
  const clip=await ev(`const h=[...document.querySelectorAll('.milkdown-block-handle')].find(function(x){return parseFloat(getComputedStyle(x).opacity)>0.05&&x.getBoundingClientRect().width>5}); if(!h)return null; const r=h.getBoundingClientRect(); return {x:Math.max(0,Math.round(r.x-20)),y:Math.max(0,Math.round(r.y-20)),width:Math.round(r.width+40),height:Math.round(r.height+40)};`)
  if(clip){const im=await send('Page.captureScreenshot',{format:'png',clip:{...clip,scale:3}});fs.writeFileSync('/tmp/kbtests/handle.png',Buffer.from(im.data,'base64'));console.log('存图')}
  console.log('通过 '+R.filter(x=>x.ok).length+'/'+R.length)
}catch(e){console.error('出错:',e.message)}finally{try{ws?.close()}catch{};chrome.kill()}
