/*
 * 每篇文档过一遍编辑器再还原，逐字节比对原文；<br> 一个都不能少
 *
 * 用法：先起服务（npm run dev），再 `node scripts/e2e/roundtrip.mjs`
 * 换端口：`APP_PORT=8103 node scripts/e2e/roundtrip.mjs`
 * 需要无头 Chrome 能连上 CDP；端口自动挑，冲突时用 CDP_PORT 指定。
 */
import { spawn } from 'node:child_process'
import { diffLines } from '../../src/utils/markdown-normalize.js'
const APP_PORT = process.env.APP_PORT || 8090
const PORT=Number(process.env.CDP_PORT||0) || (9500 + Math.floor(Math.random()*400))
const APP=`http://127.0.0.1:${APP_PORT}/`
/** --write：把对不上的文档按编辑器规范重写回磁盘（默认只报告，不动文件） */
const WRITE = process.argv.includes('--write')
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--window-size=1440,900',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/rt-'+Date.now(),APP],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map()
const send=(m,p={},ms=40000)=>{const i=++id;return new Promise((res,rej)=>{const t=setTimeout(()=>{pending.delete(i);rej(new Error('timeout '+m))},ms);pending.set(i,{res:v=>{clearTimeout(t);res(v)},rej:e=>{clearTimeout(t);rej(e)}});ws.send(JSON.stringify({id:i,method:m,params:p}))})}
const ev=async(e,ms=40000)=>{const r=await send('Runtime.evaluate',{expression:`(async () => { ${e} })()`,awaitPromise:true,returnByValue:true},ms);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
try{
  let t=null
  for(let k=0;k<80;k++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();t=l.find(x=>x.type==='page'&&x.url.startsWith(APP));if(t)break}catch{}await sleep(300)}
  ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej})
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const{res,rej}=pending.get(m.id);pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result)}}
  await send('Runtime.enable')
  for(let k=0;k<80;k++){if(await ev(`return document.querySelectorAll('button.doc-title').length`))break;await sleep(300)}
  /*
   * 按侧栏顺序逐篇点开，不按标题找。
   * 标题是用户随时能改的（真机上就改过好几次），写死标题会让测试点不中，
   * 于是连着几轮报同一篇的数字，看着全绿其实什么都没验。
   */
  const titles = await ev(`return [...document.querySelectorAll('button.doc-title')].map(function(b){return b.textContent.trim()})`)
  console.log('侧栏文档：' + titles.join(' / '))
  for (let i = 0; i < titles.length; i++) {
    await ev(`const b=[...document.querySelectorAll('button.doc-title')][${i}]; if(b)b.click(); return !!b;`)
    for(let k=0;k<60;k++){const ok=await ev(`return !!(window.__crepe && window.__baseline)`); if(ok)break; await sleep(400)}
    await sleep(2200)
    const r=await ev(`const base=String(window.__baseline),raw=window.__crepe.getMarkdown(),out=window.__normalize(raw,base);
      return {title:(document.querySelector('button.doc-title.is-on')||{}).textContent||'',
        b:base.length,o:out.length,bi:(base.match(/<br>/g)||[]).length,bo:(out.match(/<br>/g)||[]).length,
        same:out===base,lossy:!!document.querySelector('.lossy-note')};`)
    console.log(`${r.same&&!r.lossy?'✅':'❌'} ${String(titles[i]).trim().padEnd(14)} ${r.b}→${r.o}  br ${r.bi}→${r.bo}  lossy=${r.lossy}`)
    /*
     * 不一样就把两侧原文取回来，做一次行级 diff 打出来。
     * 否则每次都得再跑一轮去猜是哪一行，一轮就是一分多钟。
     */
    if (!r.same) {
      // 差异算法跟界面共用一份（markdown-normalize.js 的 diffLines），别再写第二遍
      const pair = await ev('return { base: String(window.__baseline), out: window.__normalize(window.__crepe.getMarkdown(), window.__baseline) }')
      for (const x of diffLines(pair.base, pair.out, 6)) {
        console.log('     第 ' + x.line + ' 行')
        console.log('       - ' + JSON.stringify(x.original === null ? '<没有这一行>' : x.original))
        console.log('       + ' + JSON.stringify(x.out === null ? '<编辑器会删掉>' : x.out))
      }
      if (WRITE) {
        // 把这一篇按编辑器规范重写回磁盘：模型刚写进来的文档跑一次，之后就能富文本编辑
        const payload = JSON.stringify(await ev('return window.__normalize(window.__crepe.getMarkdown(), window.__baseline)'))
        const saved = await ev('const r = await fetch("/api/doc", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: window.__reader.currentPath, content: ' + payload + ' }) }); return r.ok')
        console.log('     ' + (saved ? '✍ 已按编辑器规范重写这篇' : '✍ 重写失败'))
      }
    }
  }
}catch(e){console.error('出错:',e.message)}finally{try{ws?.close()}catch{};chrome.kill()}
