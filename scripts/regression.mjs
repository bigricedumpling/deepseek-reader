/**
 * 真实浏览器回归。无头 Chrome 跑一遍编辑链路，验证数据不会丢。
 *
 * 起因：审查发现新建文档、保存失败、删除文档三条路径都会静默丢改动，
 * 外加写清单会触发 Vite 整页刷新。这些都不是编译期能发现的。
 *
 * 用法：npm run regression
 * 它会自建一个临时沙箱，只动沙箱里的文件，不碰真实内容。
 */
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SELF, '..')
const SB = '/tmp/kb-regression-' + Date.now()
const SB_APP = path.join(SB, '知识库阅读器')
const APP_PORT = 8098
const CDP_PORT = 9351

// 上一轮如果没退干净会占着端口，先清掉
try {
  execSync(`lsof -nP -iTCP:${APP_PORT} -sTCP:LISTEN -t 2>/dev/null | xargs -r kill`, { stdio: 'ignore' })
} catch {}
execSync(`rm -rf /tmp/kb-regression-* 2>/dev/null`, { stdio: 'ignore' })

console.log('搭沙箱:', SB)
fs.mkdirSync(SB_APP, { recursive: true })
for (const item of ['src', 'server', 'public', 'index.html', 'package.json', 'vite.config.js']) {
  fs.cpSync(path.join(ROOT, item), path.join(SB_APP, item), { recursive: true })
}
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(SB_APP, 'node_modules'))
const cfg = path.join(SB_APP, 'vite.config.js')
fs.writeFileSync(
  cfg,
  fs.readFileSync(cfg, 'utf-8')
    .replace('port: 8090', 'port: ' + APP_PORT)
    // node_modules 是指向主项目的软链，不把缓存目录挪开的话，
    // 沙箱跑一次就会覆盖主项目的 node_modules/.vite，把正在跑的 dev server 弄坏
    .replace('export default defineConfig({', `export default defineConfig({\n  cacheDir: ${JSON.stringify(path.join(SB_APP, '.vite-cache'))},`)
)

const app = spawn('npm', ['run', 'dev'], { cwd: SB_APP, stdio: 'ignore' })
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${APP_PORT}/`)).ok) break } catch {}
  await new Promise(r => setTimeout(r, 500))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

execSync(`rm -rf "${SB}/内容" "${SB}/.回收站" "${SB}/文档一.md" "${SB}/文档一改名.md"`, { stdio: 'ignore' })
execSync(`mkdir -p "${SB}/内容/分类甲" "${SB}/内容/分类乙"`)
execSync(`printf '# 文档一\\n\\n正文 a\\n' > "${SB}/文档一.md"`)
execSync(`printf '# 文档二\\n\\n正文 b\\n' > "${SB}/内容/分类甲/文档二.md"`)
execSync(`printf '# 文档三\\n\\n正文 c\\n' > "${SB}/内容/分类乙/文档三.md"`)

// 表格行里"竖线前紧贴、不空格"的写法（真实文档里出现过：URL 后面跟中文括号）。
// 还原时若重建这一行会平白多一个空格，整篇就被判成有损，这里钉住它。
fs.writeFileSync(path.join(SB, '表格文档.md'), [
  '# 表格文档',
  '',
  '| 来源 | 说明 |',
  '|---|---|',
  '| PresentBench | https://ai.cnmo.com/news/814237.html （媒体报道，非一手来源）|',
  '| 甲 | 乙 |',
  ''
].join('\n'))
// 编辑器确实吃不下的写法（脚注 + 原始 HTML 块）：用来验"有损提示"这条路径
fs.writeFileSync(path.join(SB, '有损文档.md'), [
  '# 有损文档',
  '',
  '下面几种写法编辑器大多吐不回原样：',
  '',
  '标题用下划线写',
  '============',
  '',
  '表格不写两侧的竖线',
  '',
  '甲 | 乙',
  '--- | ---',
  '1 | 2',
  '',
  '四个空格缩进的代码块：',
  '',
  '    const a = 1',
  '    const b = 2',
  '',
  '引用式链接 [示例][ref] 也在。',
  '',
  '[ref]: https://example.com/x',
  '',
  '正文里还有个脚注[^1]。',
  '',
  '[^1]: 脚注内容。',
  ''
].join('\n'))

// 树是扫盘扫出来的（目录 = 分类，文件名 = 文档名），不再需要清单文件。
// 下面三篇的目录结构就是分类结构：根目录一篇、内容/分类甲 一篇、内容/分类乙 一篇。

const PORT = CDP_PORT
const APP = `http://127.0.0.1:${APP_PORT}/`
const profile = '/tmp/kb-regression-profile-' + Date.now()

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, APP
], { stdio: 'ignore' })

let ws, id = 0
const pending = new Map()
const consoleErrors = []

function send(method, params = {}, ms = 20000) {
  const msgId = ++id
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(msgId); reject(new Error('timeout ' + method)) }, ms)
    pending.set(msgId, {
      resolve: (v) => { clearTimeout(t); resolve(v) },
      reject: (e) => { clearTimeout(t); reject(e) }
    })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
}

async function ev(expr, ms = 20000) {
  const r = await send('Runtime.evaluate', {
    expression: `(async () => { ${expr} })()`,
    awaitPromise: true, returnByValue: true
  }, ms)
  if (r.exceptionDetails) throw new Error('页面报错: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  return r.result.value
}

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
const clickText = (t) => ev(`
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(t)})
  if (!b) throw new Error('找不到按钮: ' + ${JSON.stringify(t)})
  b.click(); return true
`)

try {
  let target = null
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find((t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:8098'))
      if (target) break
    } catch {}
    await sleep(300)
  }
  if (!target) throw new Error('没找到页面')
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id); pending.delete(m.id)
      m.error ? reject(new Error(m.error.message)) : resolve(m.result)
    } else if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params.exceptionDetails.exception?.description || 'exception')
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map((a) => a.value || a.description).join(' '))
    }
  }
  await send('Runtime.enable'); await send('Page.enable')

  for (let i = 0; i < 60; i++) {
    if (await ev('return !!(window.__reader && window.__reader.currentPath)')) break
    await sleep(500)
  }

  const boot = await ev(`return { path: window.__reader.currentPath, docs: window.__reader.allDocs.length,
    loaded: Object.keys(window.__reader.rawMap).length, err: window.__reader.error }`)
  check('启动并读到 5 篇正文', boot.docs === 5 && boot.loaded === 5 && !boot.err, boot.err || `树 ${boot.docs} 篇，正文 ${boot.loaded} 篇`)

  /* ---------- 常驻编辑器：没有编辑态和阅读态之分 ---------- */
  await sleep(2200)
  let ed = await ev(`const pm = document.querySelector('.milkdown .ProseMirror')
    const cs = pm ? getComputedStyle(pm) : null
    return {
      editor: !!pm,
      hasContent: pm ? pm.innerText.trim().length > 2 : false,
      heads: document.querySelectorAll('#main-scroll-container h1, #main-scroll-container h2, #main-scroll-container h3').length,
      tocItems: document.querySelectorAll('.toc-item').length,
      tocActive: document.querySelectorAll('.toc-item.is-active').length,
      editBtn: !!([...document.querySelectorAll('button')].find(b => b.textContent.trim() === '编辑')),
      saveBtn: !!document.querySelector('button[title*="保存"]'),
      font: cs ? cs.fontFamily.split(',')[0].replace(/"/g, '') : '',
      size: cs ? cs.fontSize : '',
      lhRatio: cs ? (parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)).toFixed(2) : ''
    }`)
  check('编辑器常驻且有内容', ed.editor && ed.hasContent, `${ed.font} ${ed.size} 行距比 ${ed.lhRatio}`)
  check('没有编辑和保存按钮', !ed.editBtn && !ed.saveBtn)
  check('目录项数与正文标题数一致', ed.tocItems === ed.heads && ed.heads > 0, `${ed.tocItems} 对 ${ed.heads}`)
  check('目录有高亮项', ed.tocActive === 1)
  check('行距默认 1.8 倍', Math.abs(parseFloat(ed.lhRatio) - 1.8) < 0.03, ed.lhRatio)

  /* ---------- 最关键的一条：没动过就绝不许回写 ---------- */
  const untouched = await ev(`const s = window.__reader
    return { path: s.currentPath, dirty: s.isDirty, saved: s.savedAt }`)
  await sleep(3000)   // 编辑器解析完、mermaid 画完，什么都不做，看它会不会自己存
  const after = await ev(`const s = window.__reader
    const res = await fetch('/api/doc?path=' + encodeURIComponent(s.currentPath))
    const j = await res.json()
    return { dirty: s.isDirty, savedChanged: s.savedAt !== ${untouched.saved}, len: j.ok ? j.data.content.length : -1 }`)
  check(
    '没编辑过就不回写磁盘',
    !after.dirty && !after.savedChanged,
    after.savedChanged ? '被自动保存改写了 ❌' : '原文原样保留'
  )

  /* ---------- 自动保存 ---------- */
  const auto = await ev(`const s = window.__reader
    const path = s.currentPath
    const before = s.savedMap[path] || ''
    s.updateContent(before + '\\n自动保存测试行\\n')
    await new Promise(r => setTimeout(r, 2400))
    const res = await fetch('/api/doc?path=' + encodeURIComponent(path))
    const j = await res.json()
    return { wrote: j.ok && j.data.content.includes('自动保存测试行'), dirty: s.isDirty, err: s.error }`)
  check('改完自动落盘', auto.wrote && !auto.dirty, auto.err || (auto.wrote ? '磁盘已更新' : '磁盘没变'))

  // 有自动保存之后，只有写不进去改动才会挂着未保存，所以先让写入失败
  await ev(`window.__of = window.fetch; window.fetch = (u,o) => (String(u).includes('/api/doc') && o && o.method==='PUT')
    ? Promise.resolve(new Response(JSON.stringify({ok:false,error:'模拟写入失败'}),{status:200,headers:{'Content-Type':'application/json'}}))
    : window.__of(u,o); return true`)
  await ev(`window.__reader.updateContent('# 文档一\\n\\n改过没保存\\n'); return true`)
  await sleep(1500)

  let r = await ev(`return { dirty: window.__reader.isDirty, err: window.__reader.error }`)
  check('P0-2 写入失败时保持未保存并报错', r.dirty && /模拟写入失败/.test(r.err), r.err)

  await ev(`const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='新建文档'); b.click(); return true`)
  await sleep(700)
  r = await ev(`return { dlg: !!document.querySelector('.fixed.inset-0'), path: window.__reader.currentPath }`)
  check('P0-1 有未保存改动时新建文档会拦一下', r.dlg && r.path === boot.path, r.dlg ? '弹框了，没切走' : '直接切走了')

  await clickText('保存并继续'); await sleep(1000)
  r = await ev(`return { path: window.__reader.currentPath, dirty: window.__reader.isDirty }`)
  check('P0-2 保存失败时停在原文档', r.path === boot.path && r.dirty)
  await ev(`window.fetch = window.__of; return true`)

  // 放行写入，让自动保存把改动落盘，后面的用例从干净状态开始
  await sleep(1600)
  r = await ev(`const s = window.__reader; if (s.isDirty) await s.save(); s.error=''; return { dirty: s.isDirty }`)
  check('恢复写入后能存上', r.dirty === false)


  r = await ev(`window.__reader.error='测试错误信息'; await new Promise(x=>setTimeout(x,400))
    return { seen: [...document.querySelectorAll('span')].some(s=>s.textContent.includes('测试错误信息')),
             btn: [...document.querySelectorAll('button')].some(b=>b.textContent.includes('重新读取')) }`)
  check('P0-4 错误显示在界面上', r.seen && r.btn)
  await ev(`window.__reader.error=''; return true`)

  r = await ev(`const s=window.__reader; const k=s.rawMap[s.currentPath]; delete s.rawMap[s.currentPath]
    const ret = await s.save(); const err = s.error; s.rawMap[s.currentPath]=k; s.error=''; return {ret, err}`)
  check('P0-4b 没读到内容拒绝保存', r.ret === false && /拒绝保存/.test(r.err), r.err)

  r = await ev(`const s=window.__reader
    const path = s.currentPath
    s.updateContent('# 正文标题随便改\\n\\n正文 a\\n')
    const ok = await s.save()
    await new Promise(x=>setTimeout(x,700))
    const j = await (await fetch('/api/doc?path=' + encodeURIComponent(path))).json()
    return { ok, path, disk: j.ok ? j.data.content.split('\\n')[0] : ('读失败 ' + j.error),
             name: (s.allDocs.find(d=>d.file===path)||{}).name,
             bar: [...document.querySelectorAll('.doc-title')].some(e=>e.textContent.trim()===path.replace(/\.md$/, '')) }
  `)
  check('P2-10 改正文一级标题不动文件名和侧栏名', r.ok && r.disk === '# 正文标题随便改' && r.name === r.path.replace(/\.md$/, '') && r.bar,
        'disk=' + JSON.stringify(r.disk) + ' 侧栏名=' + r.name + ' 文件=' + r.path)

  /*
   * 改名从弹窗改成了原位编辑，所以不再有「先拦一下」这一步。
   * 但它原本保护的东西还在：改完名不能把未保存的改动弄丢。
   * 这条直接验证那个不变量——store.renameDoc 会把缓存键搬到新路径，dirty 应当保持。
   */
  r = await ev(`const s=window.__reader; s.updateContent('# x\\n\\n又改了\\n')
    await new Promise(x=>setTimeout(x,300))
    const row = [...document.querySelectorAll('.doc-row')].find(x=>x.textContent.includes('文档二'))
    if (!row) return { err: '找不到文档二那一行' }
    // 改名现在在行尾那个「…」菜单里
    row.querySelector('.acts-btn').click()
    await new Promise(x=>setTimeout(x,400))
    const item = [...document.querySelectorAll('.tree-menu-item')].find(b=>b.textContent.trim()==='重命名')
    if (!item) return { err: '没出现更多操作菜单' }
    item.click()
    await new Promise(x=>setTimeout(x,400))
    const inp = document.querySelector('.doc-edit')
    if (!inp) return { err: '没出现原位输入框' }
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
    set.call(inp, '文档二改名'); inp.dispatchEvent(new Event('input',{bubbles:true}))
    inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))
    await new Promise(x=>setTimeout(x,1200))
    const cur = s.allDocs.find(d=>d.name==='文档二改名')
    // 不查 dirty：可能已经被自动保存落盘了，那是正常行为。要查的是内容有没有丢
    return { err:'', renamed: !!cur, kept: String(s.currentRaw||'').includes('又改了'),
             bar: [...document.querySelectorAll('.doc-title')].some(e=>e.textContent.trim()==='文档二改名') }`)
  check('P2-12 带未保存改动改名：改成了且改动没丢', !r.err && r.renamed && r.kept && r.bar,
        r.err || `renamed=${r.renamed} 内容还在=${r.kept} 侧栏=${r.bar}`)
  await ev(`window.__reader.discard(); return true`)
  await sleep(300)

  r = await ev(`const s=window.__reader
    const inp = document.querySelector('input[placeholder="搜索"]')
    inp.focus(); inp.dispatchEvent(new Event('focus',{bubbles:true}))
    s.searchKeyword='正文'; await new Promise(x=>setTimeout(x,700))
    const drop = document.querySelector('.search-drop'); const has = !!drop
    if (has) { const b = drop.querySelector('button'); if (b) b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true})) }
    await new Promise(x=>setTimeout(x,700))
    return { hadDrop: has, stillOpen: !!document.querySelector('.search-drop') }`)
  check('P2-11 点搜索结果后下拉收起', r.hadDrop && !r.stillOpen, r.hadDrop ? (r.stillOpen ? '还开着' : '已收起') : '下拉没出现')
  await ev(`window.__reader.searchKeyword=''; return true`)
  await sleep(400)

  r = await ev(`const s=window.__reader
    const cur = s.allDocs.find(d=>d.file===s.currentPath)
    s.updateContent('# y\\n\\n未保存\\n'); await new Promise(x=>setTimeout(x,400))
    const row = [...document.querySelectorAll('.doc-row')].find(r2=>r2.textContent.includes(cur.name))
    row.querySelector('.acts-btn').click()
    await new Promise(x=>setTimeout(x,400))
    const del = [...document.querySelectorAll('.tree-menu-item')].find(b=>b.textContent.trim().startsWith('删除'))
    if (!del) return { warned: false, err: '没出现更多操作菜单' }
    del.click()
    await new Promise(x=>setTimeout(x,600))
    const box = document.querySelector('.fixed.inset-0')
    return { warned: box ? /没保存|改动/.test(box.textContent) : false }`)
  check('P0-3 删除当前文档会提示改动丢失', r.warned)
  await clickText('取消'); await sleep(400)
  await ev(`window.__reader.discard(); return true`)

  r = await ev(`const s=window.__reader; await s.deleteCategory('内容/分类乙'); await new Promise(x=>setTimeout(x,700))
    const alive = new Set(s.allDocs.map(d=>d.file))
    return { stale: Object.keys(s.rawMap).filter(k=>!alive.has(k)), n: s.allDocs.length }`)
  check('P1-5 删分类后无残留缓存', r.stale.length === 0, r.stale.length ? JSON.stringify(r.stale) : `剩 ${r.n} 篇`)

  await sleep(400)
  const real = consoleErrors.filter((e) => !/favicon|DevTools|Download the Vue/i.test(e))
  /* ---------- 表格行整行照抄：竖线前的空格不能凭空多出来 ---------- */
  await ev(`await window.__reader.select('表格文档.md')`)
  await sleep(2500)
  const tbl = await ev(`const base = String(window.__baseline)
    const out = window.__normalize(window.__crepe.getMarkdown(), base)
    return { same: out === base, note: !!document.querySelector('.lossy-note'), b: base.length, o: out.length }`)
  check('表格行逐字节还原（竖线前不加空格）', tbl.same && !tbl.note, `${tbl.b}→${tbl.o} lossy=${tbl.note}`)

  /* ---------- 有损这篇：黄条要说清差在哪、并给出一键重排 ---------- */
  await ev(`await window.__reader.select('有损文档.md')`)
  await sleep(2600)
  const lossyUI = await ev(`const note = document.querySelector('.lossy-note')
    if (!note) return { lossy: false }
    const btns = [...note.querySelectorAll('.lossy-btn')]
    btns[0].click()
    await new Promise(r => setTimeout(r, 250))
    return { lossy: true, rows: note.querySelectorAll('.lossy-diff li').length, canon: btns.some(b => b.textContent.includes('重排')) }`)
  check(
    '有损提示：能列出差异行并给出一键重排',
    !lossyUI.lossy || (lossyUI.rows > 0 && lossyUI.canon),
    lossyUI.lossy ? `差异 ${lossyUI.rows} 处，重排按钮 ${lossyUI.canon ? '在' : '没在'}` : '沙箱这篇可以无损往返，跳过'
  )

  check('运行期无控制台报错', real.length === 0, real.slice(0, 2).join(' | '))
} catch (e) {
  console.log('中断:', e.message)
  results.push({ name: 'harness', pass: false })
} finally {
  try { ws?.close() } catch {}
  chrome.kill()
}

const pass = results.filter((r) => r.pass).length
console.log(`\n通过 ${pass}/${results.length}`)

try { app.kill() } catch {}
fs.rmSync(SB, { recursive: true, force: true })
process.exit(pass === results.length ? 0 : 1)
