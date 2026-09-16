/*
 * 侧栏：品牌持久化、图标入口、原位改名落盘、拖拽排序、收起动画
 *
 * ★ 这个脚本会真的改名、挪文件，必须对着沙箱副本跑（路径写死了 /tmp/kb-ui），不能打真实库。
 * 用法：沙箱起好服务后 `app_port@ 例：APP_PORT=8103 node scripts/e2e/sidebar.mjs`
 * 换端口：`APP_PORT=8103 node scripts/e2e/sidebar.mjs`
 * 需要无头 Chrome 能连上 CDP；端口自动挑，冲突时用 CDP_PORT 指定。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
const APP_PORT = process.env.APP_PORT || 8090
const PORT=Number(process.env.CDP_PORT||0) || (9500 + Math.floor(Math.random()*400))
const APP=`http://127.0.0.1:${APP_PORT}/`
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--window-size=1440,900',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/sb-'+Date.now(),APP],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map();const errs=[]
const send=(m,p={},ms=40000)=>{const i=++id;return new Promise((res,rej)=>{const t=setTimeout(()=>{pending.delete(i);rej(new Error('timeout '+m))},ms);pending.set(i,{res:v=>{clearTimeout(t);res(v)},rej:e=>{clearTimeout(t);rej(e)}});ws.send(JSON.stringify({id:i,method:m,params:p}))})}
const ev=async(e,ms=40000)=>{const r=await send('Runtime.evaluate',{expression:`(async () => { ${e} })()`,awaitPromise:true,returnByValue:true},ms);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const R=[];const ck=(n,ok,d='')=>{R.push({n,ok});console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`)}
try{
  let t=null
  for(let k=0;k<80;k++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();t=l.find(x=>x.type==='page'&&x.url.startsWith(APP));if(t)break}catch{}await sleep(300)}
  ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej})
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const{res,rej}=pending.get(m.id);pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result)}else if(m.method==='Runtime.exceptionThrown'){errs.push(m.params.exceptionDetails.exception?.description||'exception')}else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error'){errs.push(m.params.args.map(a=>a.value||a.description).join(' '))}}
  await send('Runtime.enable')
  for(let k=0;k<80;k++){if(await ev(`return document.querySelectorAll('button.doc-title').length>=4`))break;await sleep(300)}
  await sleep(1200)

  // 1) 品牌标题可编辑
  const brandInputs=await ev(`return document.querySelectorAll('.brand-input').length`)
  ck('品牌标题是两个可编辑输入框', brandInputs===2, String(brandInputs))
  await ev(`
    const i=document.querySelectorAll('.brand-input')[0];
    const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    set.call(i,'测试标题'); i.dispatchEvent(new Event('input',{bubbles:true})); i.blur(); return true`)
  await sleep(400)
  ck('改完存进 localStorage', JSON.parse(await ev(`return localStorage.getItem('reader.brand')`))[0]==='测试标题', await ev(`return localStorage.getItem('reader.brand')`))
  await ev(`
    const i=document.querySelectorAll('.brand-input')[0];
    const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    set.call(i,'DeepSeek 面试'); i.dispatchEvent(new Event('input',{bubbles:true})); i.blur(); return true`)

  // 2) 图标可换
  ck('图标是个可点的按钮', await ev(`return !!document.querySelector('.brand-logo')`))
  ck('有隐藏的 file input', await ev(`return !!document.querySelector('input[type=file][accept="image/*"]')`))

  // 3) 原位改名，不弹窗
  await ev(`
    const row=[...document.querySelectorAll('.doc-row')].find(function(r){return r.textContent.includes('面试准备')});
    row.querySelector('button[title^="重命名"]').click(); return true`)
  await sleep(400)
  ck('点重命名后原地出现输入框', await ev(`return !!document.querySelector('.doc-edit')`))
  ck('没有弹窗', await ev(`return !document.querySelector('.app-dialog, [class*=dialog]')`))
  await ev(`
    const i=document.querySelector('.doc-edit');
    const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    set.call(i,'面试准备-改名'); i.dispatchEvent(new Event('input',{bubbles:true}));
    i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    i.blur(); return true`)
  await sleep(1600)
  const titles=await ev(`return [...document.querySelectorAll('.doc-title')].map(function(b){return b.textContent.trim()}).join('|')`)
  ck('改名落到侧栏', titles.includes('面试准备-改名'), titles)
  // 名字的真源就是文件名，没有第二份清单要同步
  ck('磁盘上的文件名跟着改了', fs.existsSync('/tmp/kb-ui/面试准备-改名.md') && !fs.existsSync('/tmp/kb-ui/面试准备.md'), fs.readdirSync('/tmp/kb-ui').join(','))
  // 回车后紧接的 blur 不应造成第二次提交
  ck('没有重复提交导致的报错', !errs.some(function(e){return e.includes('清单里没有这篇文档')}), errs.slice(0,1).join(''))
  // 改回去
  await ev(`
    const i=document.querySelector('.doc-edit');
    if(i){const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    set.call(i,'面试准备'); i.dispatchEvent(new Event('input',{bubbles:true}));
    i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); i.blur();}
    return true`)
  await sleep(1600)

  // 4) 拖拽 = 挪进某个目录（顺序由文件名决定，不再手动排序）
  ck('文档行可拖拽', await ev(`return document.querySelectorAll('.doc-row[draggable="true"]').length>=4`))
  const moved = await ev(`
    const rows=[...document.querySelectorAll('.doc-row')];
    const from=rows.find(function(r){return r.textContent.includes('数据调研')});
    const target=[...document.querySelectorAll('.cat-row')].find(function(c){return c.textContent.trim()==='附录'});
    if(!from||!target) return '找不到行';
    const dt=new DataTransfer();
    from.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));
    target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));
    window.__dt=dt; window.__from=from; window.__to=target;
    return 'ok';
  `)
  await sleep(150)
  ck('拖到目录上会高亮落点', await ev(`return !!document.querySelector('.cat-row.is-drop')`))
  await ev(`
    const dt=window.__dt, from=window.__from, to=window.__to;
    to.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
    from.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}));
    return true`)
  await sleep(1800)
  ck('文件真的挪进了那个目录', fs.existsSync('/tmp/kb-ui/附录/数据调研.md') && !fs.existsSync('/tmp/kb-ui/数据调研.md'), fs.readdirSync('/tmp/kb-ui/附录').join(','))
  await ev(`const s=window.__reader; await s.moveDoc('附录/数据调研.md',''); return true`)
  await sleep(1200)
  ck('再挪回根目录', fs.existsSync('/tmp/kb-ui/数据调研.md'))

  // 5) 收起有动画
  ck('aside 有宽度过渡', (await ev(`return getComputedStyle(document.querySelector('aside')).transitionProperty`)).includes('width'), await ev(`return getComputedStyle(document.querySelector('aside')).transition`))
  const w0=await ev(`return Math.round(document.querySelector('aside').getBoundingClientRect().width)`)
  await ev(`const b=[...document.querySelectorAll('button[title="收起侧栏"]')][0]; b.click(); return true`)
  await sleep(60)
  const wMid=await ev(`return Math.round(document.querySelector('aside').getBoundingClientRect().width)`)
  await sleep(500)
  const w1=await ev(`return Math.round(document.querySelector('aside').getBoundingClientRect().width)`)
  ck('收起是渐变不是硬跳', wMid<w0 && wMid>w1, `${w0} → ${wMid} → ${w1}`)

  console.log('\n运行时错误:',errs.length?errs.slice(0,3):'无')
  console.log('通过 '+R.filter(x=>x.ok).length+'/'+R.length)
}catch(e){console.error('出错:',e.message)}finally{try{ws?.close()}catch{};chrome.kill()}
