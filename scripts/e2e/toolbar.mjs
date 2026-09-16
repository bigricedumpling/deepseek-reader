/*
 * 浮动工具条的按钮尺寸与图标颜色（不能被 --c-line 冲淡成禁用脸）
 *
 * 用法：先起服务（npm run dev），再 `node scripts/e2e/toolbar.mjs`
 * 换端口：`APP_PORT=8103 node scripts/e2e/toolbar.mjs`
 * 需要无头 Chrome 能连上 CDP；端口自动挑，冲突时用 CDP_PORT 指定。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
const APP_PORT = process.env.APP_PORT || 8090
const PORT=Number(process.env.CDP_PORT||0) || (9500 + Math.floor(Math.random()*400))
const APP=`http://127.0.0.1:${APP_PORT}/`
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--force-device-scale-factor=3','--window-size=1440,900',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/tb-'+Date.now(),APP],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map()
const send=(m,p={},ms=40000)=>{const i=++id;return new Promise((res,rej)=>{const t=setTimeout(()=>{pending.delete(i);rej(new Error('timeout '+m))},ms);pending.set(i,{res:v=>{clearTimeout(t);res(v)},rej:e=>{clearTimeout(t);rej(e)}});ws.send(JSON.stringify({id:i,method:m,params:p}))})}
const ev=async(e,ms=40000)=>{const r=await send('Runtime.evaluate',{expression:`(async () => { ${e} })()`,awaitPromise:true,returnByValue:true},ms);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
try{
  let t=null
  for(let k=0;k<80;k++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();t=l.find(x=>x.type==='page'&&x.url.startsWith(APP));if(t)break}catch{}await sleep(300)}
  ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej})
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const{res,rej}=pending.get(m.id);pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result)}}
  await send('Runtime.enable');await send('Page.enable')
  for(let k=0;k<80;k++){if(await ev(`return !!window.__crepe`))break;await sleep(300)}
  await sleep(2500)
  // 选中一段正文，让浮动工具条出现
  const g=await ev(`
    const pm=document.querySelector('.crepe-host .ProseMirror');
    const p=[...pm.querySelectorAll(':scope > p')].find(function(x){return x.textContent.length>30});
    if(!p) return null;
    const r=document.createRange(); r.selectNodeContents(p);
    const s=getSelection(); s.removeAllRanges(); s.addRange(r);
    pm.focus();
    return {文字:p.textContent.slice(0,10)};
  `)
  await sleep(1200)
  console.log('工具条是否出现:', await ev(`const t=document.querySelector('.milkdown-toolbar'); return t? getComputedStyle(t).display : '没有这个元素'`))
  console.log(await ev(`
    const t=document.querySelector('.milkdown-toolbar');
    if(!t) return '工具条没出现';
    const item=t.querySelector('.toolbar-item');
    const svg=item?item.querySelector('svg'):null;
    const cs=item?getComputedStyle(item):null;
    const sc=svg?getComputedStyle(svg):null;
    return JSON.stringify({
      工具条圆角: getComputedStyle(t).borderRadius,
      按钮: cs?cs.width+'x'+cs.height+' 外边距'+cs.margin+' 圆角'+cs.borderRadius:'无',
      图标: sc?sc.width+'x'+sc.height:'无',
      图标颜色: sc?sc.color:'无',
      按钮数: t.querySelectorAll('.toolbar-item').length,
      整条尺寸: Math.round(t.getBoundingClientRect().width)+'x'+Math.round(t.getBoundingClientRect().height)
    },null,1);
  `))
  const clip=await ev(`const t=document.querySelector('.milkdown-toolbar'); if(!t)return null; const r=t.getBoundingClientRect();
    return {x:Math.max(0,Math.round(r.x-14)),y:Math.max(0,Math.round(r.y-14)),width:Math.round(r.width+28),height:Math.round(r.height+28)};`)
  if(clip){ const im=await send('Page.captureScreenshot',{format:'png',clip:{...clip,scale:3}}); fs.writeFileSync('/tmp/kbtests/toolbar.png',Buffer.from(im.data,'base64')); console.log('存图',JSON.stringify(clip)) }
}catch(e){console.error('出错:',e.message)}finally{try{ws?.close()}catch{};chrome.kill()}
