/*
 * 工具条 28 项控件逐个点过并量计算样式，确认每一档真的改变了什么
 *
 * 用法：先起服务（npm run dev），再 `node scripts/e2e/controls.mjs`
 * 换端口：`APP_PORT=8103 node scripts/e2e/controls.mjs`
 * 需要无头 Chrome 能连上 CDP；端口自动挑，冲突时用 CDP_PORT 指定。
 */
import { spawn } from 'node:child_process'
const APP_PORT = process.env.APP_PORT || 8090
const PORT=Number(process.env.CDP_PORT||0) || (9500 + Math.floor(Math.random()*400))
const APP=`http://127.0.0.1:${APP_PORT}/`
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--window-size=1440,900',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/a3-'+Date.now(),APP],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map();const errs=[]
const send=(m,p={},ms=30000)=>{const i=++id;return new Promise((res,rej)=>{const t=setTimeout(()=>{pending.delete(i);rej(new Error('timeout '+m))},ms);pending.set(i,{res:v=>{clearTimeout(t);res(v)},rej:e=>{clearTimeout(t);rej(e)}});ws.send(JSON.stringify({id:i,method:m,params:p}))})}
const ev=async(e,ms=30000)=>{const r=await send('Runtime.evaluate',{expression:`(async () => { ${e} })()`,awaitPromise:true,returnByValue:true},ms);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const R=[];const ck=(n,ok,d='')=>{R.push({n,ok});console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`)}
try{
  let t=null
  for(let i=0;i<80;i++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();t=l.find(x=>x.type==='page'&&x.url.startsWith(APP));if(t)break}catch{}await sleep(300)}
  ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej})
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const{res,rej}=pending.get(m.id);pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result)}else if(m.method==='Runtime.exceptionThrown'){errs.push(m.params.exceptionDetails.exception?.description||'exception')}}
  await send('Runtime.enable')
  for(let i=0;i<80;i++){if(await ev(`return document.querySelectorAll('button.doc-title').length`)>=4)break;await sleep(300)}
  await ev(`[...document.querySelectorAll('button.doc-title')].find(x=>x.textContent.trim()==='评测调研').click(); return true;`)
  for(let i=0;i<80;i++){if(await ev(`return !!(window.__crepe && document.querySelector('.crepe-host .ProseMirror strong'))`))break;await sleep(400)}
  await sleep(2500)
  const md0 = await ev(`return window.__crepe.getMarkdown().length`)

  const openMenu=async(title,marker)=>{ if(await ev(`const p=document.querySelector('.pop-menu'); return !!(p&&p.textContent.includes(${JSON.stringify(marker)}))`))return true
    const r=await ev(`const b=[...document.querySelectorAll('button.btn-icon')].find(x=>x.title===${JSON.stringify(title)}); if(!b)return '缺按钮'; b.click(); return 'ok'`); await sleep(400); return r==='ok' }
  const chip=async(sec,txt)=>{ const menu=(sec==='主题'||sec==='缩放')?'外观':'排版'; await openMenu(menu,sec); const r=await ev(`
      const p=document.querySelector('.pop-menu'); if(!p)return '没菜单';
      const lab=[...p.querySelectorAll('.type-label')].find(l=>l.textContent.trim().startsWith(${JSON.stringify(sec)}));
      if(!lab)return '没分区 '+${JSON.stringify(sec)};
      let el=lab.nextElementSibling; while(el&&!el.classList.contains('type-row'))el=el.nextElementSibling;
      if(!el)return '没选项行';
      const b=[...el.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(txt)});
      if(!b)return '没选项 '+${JSON.stringify(txt)};
      b.click(); return 'ok';`); await sleep(430); return r }
  const P=()=>ev(`
    const sc=document.getElementById('main-scroll-container');
    const pm=document.querySelector('.crepe-host .ProseMirror');
    const ps=[...pm.querySelectorAll(':scope > p')]; const p=ps.find(x=>!/^H[1-6]$/.test(x.previousElementSibling?.tagName||''))||ps[0]; const cs=getComputedStyle(p);
    const st=pm.querySelector('strong');
    const td=pm.querySelector('td,th');
    // 合成一个 em 量规则，量完立刻摘掉，不留在文档里
    const em=document.createElement('em'); em.textContent='x'; p.appendChild(em);
    const emFam=getComputedStyle(em).fontFamily, emSty=getComputedStyle(em).fontStyle; em.remove();
    return { dataFont:document.body.dataset.font, dataTheme:document.body.dataset.theme, lsTheme:(()=>{try{return localStorage.getItem('reader.theme')}catch(e){return '?'}})(),
      dataPara:document.body.dataset.para, dataTable:document.body.dataset.table, dataAlign:document.body.dataset.tableAlign,
      size:sc.style.getPropertyValue('--reading-size'), measure:sc.style.getPropertyValue('--measure'),
      pSize:cs.fontSize, pIndent:cs.textIndent, pGap:cs.marginBottom, pTrack:cs.letterSpacing, pAlign:cs.textAlign,
      emFam:emFam.split(',')[0], emSty, stW:st?getComputedStyle(st).fontWeight:'无',
      tdAlign:td?getComputedStyle(td).textAlign:'', tocW:Math.round((document.querySelector('.toc-panel')||document.body).getBoundingClientRect().width) };
  `)

  console.log('=== 正文宽度 ===')
  {
    const w={}
    for(const l of ['窄','中','宽']){ const r=await chip('正文宽度',l); await sleep(500); w[l]=await ev(`return Math.round(document.querySelector('.crepe-host .ProseMirror > p').getBoundingClientRect().width)`); if(r!=='ok') console.log('   点击失败:',r) }
    ck('三档宽度递增且互不相同', w['窄']<w['中'] && w['中']<w['宽'], `窄=${w['窄']} 中=${w['中']} 宽=${w['宽']}`)
  }
  console.log('=== 正文字号 ===')
  for(const [l,e] of [['小','14px'],['特大','18.5px'],['大','17px'],['中','15.5px']]){const r=await chip('正文字号',l);const p=await P();ck(`字号 ${l}`,p.pSize===e,`${r==='ok'?'':r} ${p.pSize} 期望 ${e}`)}
  console.log('=== 正文字体 ===')
  for(const [l,e] of [['无衬线','sans'],['楷体','kai'],['苹方','ping'],['衬线','serif']]){const r=await chip('正文字体',l);const p=await P();ck(`字体 ${l}`,p.dataFont===e,`${r==='ok'?'':r} dataFont=${p.dataFont} 期望 ${e}`)}
  console.log('=== 中文加粗 ===')
  for(const [l,e] of [['加粗','600'],['特黑','900']]){const r=await chip('中文加粗',l);const p=await P();ck(`加粗 ${l}`,p.stW===e,`${r==='ok'?'':r} ${p.stW} 期望 ${e}`)}
  console.log('=== 中文斜体 ===')
  for(const [l,e] of [['不替换','inherit'],['楷体','ChillKai']]){const r=await chip('中文斜体',l);const p=await P();ck(`斜体 ${l}`,p.emFam.includes(e)||(e==='inherit'&&!p.emFam.includes('ChillKai')),`${r==='ok'?'':r} ${p.emFam}/${p.emSty}`)}
  console.log('=== 段落 ===')
  for(const [l,ei] of [['缩进式','31px'],['段距式','0px']]){const r=await chip('段落',l);const p=await P();ck(`段落 ${l}`,p.pIndent===ei,`${r==='ok'?'':r} indent=${p.pIndent} 期望 ${ei}`)}
  console.log('=== 字间距 ===')
  const s0=(await P()).pTrack
  await openMenu('排版','字间距')
  await ev(`const p=document.querySelector('.pop-menu'); const i=p.querySelector('input[type=range]'); const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(i,'0.06'); i.dispatchEvent(new Event('input',{bubbles:true})); return true`)
  await sleep(450)
  const s1=(await P()).pTrack
  ck('字间距可调', s0!==s1, `${s0} → ${s1}`)
  await openMenu('排版','字间距')
  await ev(`const p=document.querySelector('.pop-menu'); const i=p.querySelector('input[type=range]'); const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(i,'0'); i.dispatchEvent(new Event('input',{bubbles:true})); return true`)
  await sleep(300)
  console.log('=== 表格 ===')
  for(const [l,e] of [['同正文','measure'],['铺满','full']]){const r=await chip('表格宽度',l);const p=await P();ck(`表格宽 ${l}`,p.dataTable===e,`${r==='ok'?'':r} ${p.dataTable} 期望 ${e}`)}
  for(const [l,e] of [['中','center'],['右','right'],['左','left']]){const r=await chip('表格对齐',l);const p=await P();ck(`表格对齐 ${l}`,p.tdAlign===e,`${r==='ok'?'':r} ${p.tdAlign} 期望 ${e}`)}
  console.log('=== 外观 ===')
  for(const [l,e,de] of [['深色','dark','dark'],['浅色','light','light'],['跟随系统','auto','light']]){const r=await chip('主题',l);const p=await P();ck(`主题 ${l}`,p.lsTheme===e&&p.dataTheme===de,`${r==='ok'?'':r} ls=${p.lsTheme}/${e} 解析=${p.dataTheme}/${de}`)}
  await openMenu('外观','缩放')
  {
    // --measure 现在是 min(绝对, 比例)，断绝对值没意义，直接看正文实测宽度
    const m={}
    for(const l of ['80','100','150']){ const r=await chip('缩放',l); await sleep(500); m[l]={w:await ev(`return Math.round(document.querySelector('.crepe-host .ProseMirror > p').getBoundingClientRect().width)`), fs:await ev(`return getComputedStyle(document.querySelector('.crepe-host .ProseMirror > p')).fontSize`)}; if(r!=='ok') console.log('   点击失败:',r) }
    console.log('   实测:', JSON.stringify(m))
    ck('缩放等比改变字号与行宽', parseFloat(m['80'].fs)<parseFloat(m['100'].fs) && parseFloat(m['100'].fs)<parseFloat(m['150'].fs) && m['80'].w<=m['100'].w && m['100'].w<=m['150'].w, `80=${m['80'].fs}/${m['80'].w} 100=${m['100'].fs}/${m['100'].w} 150=${m['150'].fs}/${m['150'].w}`)
  }
  console.log('=== 排版细节 ===')
  const p=await P()
  ck('两端对齐',p.pAlign==='justify',p.pAlign)
  console.log('=== 目录 ===')
  const w0=await ev(`const a=document.querySelector('.toc-panel'); return a?Math.round(a.getBoundingClientRect().width):-1`)
  const tog=await ev(`const b=[...document.querySelectorAll('button.btn-icon')].find(x=>x.title==='目录'); if(!b)return '缺按钮'; b.click(); return 'ok'`)
  await sleep(700)
  const w1=await ev(`const a=document.querySelector('.toc-panel'); return a?Math.round(a.getBoundingClientRect().width):-1`)
  ck('目录可开关',tog==='ok'&&w0>100&&w1<10,`目录面板宽 ${w0} → ${w1}`)
  await ev(`const b=[...document.querySelectorAll('button.btn-icon')].find(x=>x.title==='目录'); b.click(); return true`)
  await sleep(500)
  const md1=await ev(`return window.__crepe.getMarkdown().length`)
  ck('合成 em 未污染文档', md0===md1, `${md0} → ${md1}`)
  console.log('\n运行时错误:',errs.length?errs.slice(0,3):'无')
  console.log('通过 '+R.filter(x=>x.ok).length+'/'+R.length)
  const bad=R.filter(x=>!x.ok).map(x=>x.n); if(bad.length)console.log('未生效: '+bad.join('、'))
}catch(e){console.error('出错:',e.message)}finally{try{ws?.close()}catch{};chrome.kill()}
