/**
 * 真实浏览器回归。无头 Chrome 跑一遍编辑链路，验证数据不会丢。
 *
 * 起因：审查发现新建文档、保存失败、删除文档三条路径都会静默丢改动，
 * 外加写清单会触发 Vite 整页刷新。这些都不是编译期能发现的。
 *
 * 用法：npm run regression
 * 它会自建一个临时沙箱，只动沙箱里的文件，不碰真实内容。
 */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { verifyShareHandoff } from './e2e/share-handoff.mjs'
import { verifyFind } from './e2e/find.mjs'
import { verifyFormulaReading } from './e2e/formula-reading.mjs'
import { verifySurfaceMotion } from './e2e/surface-motion.mjs'
import { runFormulaEditor } from './e2e/formula-editor.mjs'
import { verifyEditorClipboard } from './e2e/editor-clipboard.mjs'
import { verifyTabResume } from './e2e/tab-resume.mjs'
import { verifyReferences } from './e2e/references.mjs'
import { verifyNavigationMotion } from './e2e/navigation-motion.mjs'
import { verifyTabMotion } from './e2e/tab-motion.mjs'
import { verifyWorkspaceChrome } from './e2e/workspace-chrome.mjs'
import { verifyConcurrentEdits } from './e2e/concurrent-edits.mjs'
import { verifyEditorStartupRecovery } from './e2e/editor-startup.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'typocket-regression-')))
const SB = path.join(temporary, 'documents')
const profile = path.join(temporary, 'browser')
const appRoot = path.join(temporary, 'app')
process.env.DOCS_ROOT = SB
process.env.READER_RUNTIME_DIR = path.join(temporary, 'runtime')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

for (const [file, body] of [
  ['内容/文档一.md', '# 文档一\n\n正文 a\n'],
  ['参考/文档一.md', '# 文档一\n\n跨知识库样本文档\n'],
  ['参考/node_modules/不属于知识库.md', '# 依赖文档\n'],
  ['内容/分类甲/文档二.md', '# 文档二\n\n正文 b\n'],
  ['内容/分类乙/文档三.md', '# 文档三\n\n正文 c\n']
]) {
  const destination = path.join(SB, file)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, body)
}

// 表格行里"竖线前紧贴、不空格"的写法（真实文档里出现过：URL 后面跟中文括号）。
// 还原时若重建这一行会平白多一个空格，整篇就被判成有损，这里钉住它。
fs.writeFileSync(path.join(SB, '内容/表格文档.md'), [
  '# 表格文档',
  '',
  '| 来源 | 说明 |',
  '|---|---|',
  '| PresentBench | https://ai.cnmo.com/news/814237.html （媒体报道，非一手来源）|',
  '| 甲 | 乙 |',
  ''
].join('\n'))
// 同一篇同时使用引用定义、脚注、无边框表格和缩进代码。
fs.writeFileSync(path.join(SB, '内容/有损文档.md'), [
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
// 下面 5 篇都在同一个知识库「内容」下：根目录一篇、分类甲/分类乙各一篇、根目录两篇特殊格式。

const chromeBinary = process.env.CHROME_BIN || ({
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  win32: path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
  linux: 'google-chrome'
})[process.platform]

let vite, server, chrome
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
  // Both servers request their own ephemeral port. Vite's cache and the browser
  // profile belong to this run, including when another test is already running.
  fs.mkdirSync(appRoot)
  for (const name of ['src', 'server', 'public', 'preview', 'index.html', 'package.json', 'vite.config.js', 'brand.mjs']) {
    fs.cpSync(path.join(ROOT, name), path.join(appRoot, name), { recursive: true })
  }
  const shareModule = 'plugins/reader-workspace/scripts/share-prompt.mjs'
  fs.mkdirSync(path.dirname(path.join(appRoot, shareModule)), { recursive:true })
  fs.copyFileSync(path.join(ROOT, shareModule), path.join(appRoot, shareModule))
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(appRoot, 'node_modules'), 'junction')
  server = http.createServer((req, res) => vite.middlewares(req, res))
  vite = await createServer({
    root: appRoot,
    cacheDir: path.join(temporary, 'vite-cache'),
    envDir: false,
    logLevel: 'warn',
    optimizeDeps: { entries: ['index.html', 'preview/index.html'] },
    server: { middlewareMode: true, hmr: { server }, watch: null, fs: { allow: [path.join(ROOT, 'node_modules'), temporary] } }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const appUrl = `http://127.0.0.1:${server.address().port}/`
  chrome = spawn(chromeBinary, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    // CI has no physical mouse. Start with the desktop input device exercised below;
    // the phone checks explicitly enable touch emulation on the same browser.
    '--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2',
    '--window-size=1440,900', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' })
  await once(chrome, 'spawn')
  let target
  for (let i = 0; i < 100; i++) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited (${chrome.exitCode})`)
    try {
      const [port] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = list.find(item => item.type === 'page' && item.url === 'about:blank')
      if (target) break
    } catch {}
    await sleep(200)
  }
  if (!target) throw new Error('无法连接到测试浏览器')
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
  await send('Page.navigate', { url: new URL('doc/内容/文档一?lib=内容', appUrl).href })

  for (let i = 0; i < 60; i++) {
    if (await ev('return !!(window.__reader && window.__reader.currentPath)')) break
    await sleep(500)
  }
  if (!(await ev('return !!window.__reader'))) {
    const info = await ev(`return {
      body: document.body?.innerText?.slice(0, 300) || '',
      overlay: document.querySelector('vite-error-overlay')?.shadowRoot?.textContent?.slice(0, 500) || ''
    }`)
    throw new Error('页面没有启动: ' + (consoleErrors.slice(0, 3).join(' | ') || info.overlay || info.body || '没有控制台错误'))
  }

  const boot = await ev(`return { path: window.__reader.currentPath, docs: window.__reader.allDocs.length,
    loaded: Object.keys(window.__reader.rawMap).length, err: window.__reader.error }`)
  check('启动并读到 5 篇文档（当前篇正文已加载）', boot.docs === 5 && boot.loaded >= 1 && !boot.err, boot.err || `树 ${boot.docs} 篇，正文 ${boot.loaded} 篇`)

  await verifyFormulaReading(ev)
  check('公式在静态阅读、窄屏、历史快照和 DSH 预览中保持完整', true)

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

  const stableTitle = await ev(`const editor = document.querySelector('.milkdown .ProseMirror')
    const title = editor.querySelector('h1'), text = editor.querySelector('p').firstChild
    const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const measure = () => [getComputedStyle(title).fontSize, getComputedStyle(title).fontWeight, title.offsetHeight].join('/')
    const before = measure()
    editor.focus()
    const selection = getSelection()
    selection.collapse(text, 0)
    await nextFrame()
    const caret = measure()
    selection.setBaseAndExtent(text, 0, text, text.length)
    await nextFrame()
    const selected = measure()
    selection.collapseToEnd()
    await nextFrame()
    const after = measure()
    editor.blur()
    return [before, caret, selected, after]`)
  check('正文选区和光标切换时，主标题字号、字重和高度稳定', new Set(stableTitle).size === 1, stableTitle.join(' → '))

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
    const anchors = ['.doc-tab.is-active', '.doc-quick', '.doc-reading']
    function positions() {
      return anchors.flatMap(selector => {
        const rect = document.querySelector(selector).getBoundingClientRect()
        return [rect.left, rect.width]
      })
    }
    const original = positions()
    const before = s.savedMap[path] || ''
    s.updateContent(before + '\\n自动保存测试行\\n')
    await new Promise(requestAnimationFrame)
    const pending = positions()
    await new Promise(r => setTimeout(r, 2400))
    const settled = positions()
    const movement = Math.max(...original.map((v, i) => Math.max(Math.abs(pending[i] - v), Math.abs(settled[i] - v))))
    const res = await fetch('/api/doc?path=' + encodeURIComponent(path))
    const j = await res.json()
    return { wrote: j.ok && j.data.content.includes('自动保存测试行'), dirty: s.isDirty, err: s.error, movement }`)
  check('改完自动落盘', auto.wrote && !auto.dirty, auto.err || (auto.wrote ? '磁盘已更新' : '磁盘没变'))

  check('自动保存期间标签和工具按钮保持原位', auto.movement < 0.75, auto.movement + ' px')

  // 有自动保存之后，只有写不进去改动才会挂着未保存，所以先让写入失败
  await ev(`window.__of = window.fetch; window.fetch = (u,o) => (String(u).includes('/api/doc') && o && o.method==='PUT')
    ? Promise.resolve(new Response(JSON.stringify({ok:false,error:'模拟写入失败'}),{status:200,headers:{'Content-Type':'application/json'}}))
    : window.__of(u,o); return true`)
  await ev(`window.__reader.updateContent('# 文档一\\n\\n改过没保存\\n'); return true`)
  await sleep(1500)

  let r = await ev(`return { dirty: window.__reader.isDirty, err: window.__reader.error }`)
  check('P0-2 写入失败时保持未保存并报错', r.dirty && /模拟写入失败/.test(r.err), r.err)

  await ev(`const b=document.querySelector('.create-action[aria-label="新建文档"]'); b.click(); return true`)
  await sleep(400)
  r = await ev(`return { input: !!document.querySelector('.tree-create-input'), path: window.__reader.currentPath, dirty: window.__reader.isDirty }`)
  check('P0-1 新建文档先进入命名，不离开当前文档', r.input && r.path === boot.path && r.dirty, r.input ? '已进入命名，当前文档没动' : '没有出现命名输入')

  await ev(`const inp=document.querySelector('.tree-create-input')
    const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
    set.call(inp,'保存失败新建测试'); inp.dispatchEvent(new Event('input',{bubbles:true}))
    inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))
    return true`)
  await sleep(1000)
  r = await ev(`return { path: window.__reader.currentPath, dirty: window.__reader.isDirty, input: !!document.querySelector('.tree-create-input') }`)
  check('P0-2 保存失败时不切走也不丢改动', r.path === boot.path && r.dirty, r.dirty ? '仍停在原文档' : '改动丢了')
  await ev(`window.fetch = window.__of; return true`)

  // 放行写入，让自动保存把改动落盘，后面的用例从干净状态开始
  await sleep(1600)
  r = await ev(`const s = window.__reader; if (s.isDirty) await s.save(); s.clearError(); return { dirty: s.isDirty }`)
  check('恢复写入后能存上', r.dirty === false)


  r = await ev(`window.__reader.setError('测试错误信息','load'); await new Promise(x=>setTimeout(x,400))
    const toast = document.querySelector('.doc-notice')
    return { seen: !!toast && toast.textContent.includes('测试错误信息'),
             btn: !!toast && [...toast.querySelectorAll('button')].some(b=>b.textContent.includes('重新读取')) }`)
  check('P0-4 错误显示在界面上', r.seen && r.btn)
  await ev(`window.__reader.clearError(); return true`)

  r = await ev(`const s=window.__reader; const k=s.rawMap[s.currentPath]; delete s.rawMap[s.currentPath]
    const ret = await s.save(); const err = s.error; s.rawMap[s.currentPath]=k; s.clearError(); return {ret, err}`)
  check('P0-4b 没读到内容拒绝保存', r.ret === false && /拒绝保存/.test(r.err), r.err)

  r = await ev(`const s=window.__reader
    const path = s.currentPath
    s.updateContent('# 正文标题随便改\\n\\n正文 a\\n')
    const ok = await s.save()
    await new Promise(x=>setTimeout(x,700))
    const j = await (await fetch('/api/doc?path=' + encodeURIComponent(path))).json()
    return { ok, path, disk: j.ok ? j.data.content.split('\\n')[0] : ('读失败 ' + j.error),
             name: (s.allDocs.find(d=>d.file===path)||{}).name,
             bar: [...document.querySelectorAll('.doc-title')].some(e=>e.textContent.trim()===path.split('/').pop().replace(/\\.md$/, '')) }
  `)
  check('P2-10 改正文一级标题不动文件名和侧栏名', r.ok && r.disk === '# 正文标题随便改' && r.name === r.path.split('/').pop().replace(/\.md$/, '') && r.bar,
        'disk=' + JSON.stringify(r.disk) + ' 侧栏名=' + r.name + ' 文件=' + r.path)

  /*
   * 改名从弹窗改成了原位编辑，所以不再有「先拦一下」这一步。
   * 但它原本保护的东西还在：改完名不能把未保存的改动弄丢。
   * 这条直接验证那个不变量——store.renameDoc 会把缓存键搬到新路径，dirty 应当保持。
   */
  const renameFolder = 'document.querySelector(\'.cat-row[data-path="内容/分类甲"] .folder-toggle\')'
  if (await ev('return ' + renameFolder + '.ariaExpanded === "false"')) await ev(renameFolder + '.click()')
  await waitForPage("document.querySelector('.doc-row[data-file=\"内容/分类甲/文档二.md\"]')")
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

  /*
   * 查找是「当前文档内」的。上一步停在改名后的文档二，正文里没有“正文”这个词，
   * 先回到文档一再查，否则测的是上一条用例的残留状态。
   */
  await ev(`await window.__reader.select('内容/文档一.md'); return true`)
  await sleep(600)

  r = await ev(`const s=window.__reader
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',metaKey:true,bubbles:true,cancelable:true}))
    await new Promise(x=>setTimeout(x,300))
    const inp=document.querySelector('input[placeholder="查找当前文档"]')
    if(!inp) return { err:'没有查找输入框' }
    const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
    set.call(inp,'又改了'); inp.dispatchEvent(new Event('input',{bubbles:true}))
    await new Promise(x=>setTimeout(x,500))
    const hits=[...document.querySelectorAll('.search-hit')]
    if(!hits.length) return { err:'没有搜索结果', hadDrop:false }
    hits[0].click(); await new Promise(x=>setTimeout(x,400))
    return { hadDrop:true, stillOpen: !!document.querySelector('.doc-search-panel'), err:'' }`)
  check('P2-11 点搜索结果后搜索面板收起', !r.err && r.hadDrop && !r.stillOpen, r.err || (r.stillOpen ? '还开着' : '已收起'))
  await sleep(400)

  r = await ev(`const s = window.__reader
    const row = [...document.querySelectorAll('.doc-row')].find(item => item.dataset.file === s.currentPath)
    row.querySelector('.acts-btn').click()
    await new Promise(resolve => setTimeout(resolve, 100))
    const actions = [...document.querySelectorAll('.tree-menu-item')]
    const del = actions.find(button => button.textContent.trim() === '移入回收站')
    if (!del) return { error: '删除菜单未出现：' + actions.map(item => item.textContent).join(' / ') }
    s.updateContent(s.currentRaw + '\\n未保存的删除测试\\n')
    del.click()
    await new Promise(resolve => setTimeout(resolve, 100))
    const box = document.querySelector('.app-dialog')
    return { warned: !!box && /丢弃尚未保存的修改/.test(box.textContent), detail: box?.textContent || '未打开确认框' }`)
  check('P0-3 删除当前未保存文档会提示改动丢失', r.warned, r.error || r.detail)
  if (r.warned) {
    await clickText('取消')
    await sleep(300)
  }
  await ev(`window.__reader.discard(); return true`)

  r = await ev(`const s=window.__reader; await s.deleteCategory('内容/分类乙'); await new Promise(x=>setTimeout(x,700))
    const alive = new Set(s.allDocs.map(d=>d.file))
    return { stale: Object.keys(s.rawMap).filter(k=>!alive.has(k)), n: s.allDocs.length }`)
  check('P1-5 删分类后无残留缓存', r.stale.length === 0, r.stale.length ? JSON.stringify(r.stale) : `剩 ${r.n} 篇`)

  await sleep(400)
  /* ---------- 表格行整行照抄：竖线前的空格不能凭空多出来 ---------- */
  await ev(`await window.__reader.select('内容/表格文档.md')`)
  await sleep(2500)
  const tbl = await ev(`const base = String(window.__baseline)
    const out = window.__normalize(window.__crepe.getMarkdown(), base)
    return { same: out === base, note: !!document.querySelector('.lossy-note'), b: base.length, o: out.length }`)
  check('表格行逐字节还原（竖线前不加空格）', tbl.same && !tbl.note, `${tbl.b}→${tbl.o} lossy=${tbl.note}`)

  async function editAndReopen(file, needle, marker, required = []) {
    const onDisk = () => fs.readFileSync(path.join(SB, file), 'utf8')
    const original = onDisk()
    const ready = (text, focus) => ev(`
      const needle = ${JSON.stringify(text)}
      for (let i = 0; i < 100; i++) {
        const editor = window.__fold?.view()?.dom
        const target = [...(editor?.querySelectorAll('p, h1') || [])].find(p => p.textContent === needle)
        if (!window.beforeDocumentReload && window.__reader?.currentPath === ${JSON.stringify(file)} &&
            editor?.checkVisibility() && editor.isContentEditable && target) {
          if (!${JSON.stringify(required)}.every(selector => editor.querySelector(selector))) {
            throw Error('Missing rendered structure in ' + ${JSON.stringify(file)})
          }
          if (${focus}) {
            editor.focus()
            const range = document.createRange()
            range.selectNodeContents(target)
            range.collapse(false)
            const selection = getSelection()
            selection.removeAllRanges()
            selection.addRange(range)
          }
          return true
        }
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return false
    `)
    await ev(`await window.__reader.select(${JSON.stringify(file)})`)
    if (!await ready(needle, true)) throw Error(file + ' 未进入可见的富文本编辑器')
    check(file + ' 打开时呈现富文本并保留原文件', onDisk() === original)
    await send('Input.insertText', { text: marker })
    const expected = original.replace(needle, needle + marker)
    for (let i = 0; i < 100 && !onDisk().includes(marker); i++) await sleep(100)
    check(file + ' 实际输入只改变目标文字', onDisk() === expected)
    await ev('window.beforeDocumentReload = true')
    await send('Page.reload', { ignoreCache: true })
    // Chrome can acknowledge reload before destroying the old JS context.
    for (let i = 0; i < 100; i++) {
      try {
        if (await ev('return !window.beforeDocumentReload && !!window.__reader?.currentLoaded')) break
      } catch (error) {
        if (!/navigated|context.*destroyed|Cannot find context/i.test(error.message)) throw error
      }
      await sleep(100)
    }
    check(file + ' 刷新后富文本显示保存的修改', await ready(needle + marker, false))
  }
  await editAndReopen('内容/表格文档.md', '表格文档', '编辑器实测', ['table'])
  await editAndReopen('内容/有损文档.md', '下面几种写法编辑器大多吐不回原样：', '复杂格式实测', ['a[href="https://example.com/x"]', 'table', '.milkdown-code-block'])
  const formulaFile = '内容/公式与混排.md'
  const mixedFormula = [
    '# 混合排版', '', '> 公式后的内容仍然可以编辑。', '',
    '$$', 'f(x) = \\sqrt{x^2+1} + \\frac{1}{2}', '$$', '',
    '## 下一节', '', '一段文字里带有 **粗体** 和 *斜体*，还有 $a+b$ 以及 [来源](https://example.com/)。', '',
    '修改这一段。', '', '| 样本 | 结果 |', '|---|---|', '| 甲 | $x^2$ |', ''
  ].join('\n')
  fs.writeFileSync(path.join(SB, formulaFile), mixedFormula)
  await ev('await window.__reader.loadTree()')
  await editAndReopen(formulaFile, '修改这一段。', '已改', ['h1', 'h2', 'blockquote', 'strong', 'em', '.katex', 'table'])
  await verifyEditorStartupRecovery({ ev, root: SB, file: formulaFile, sleep })
  check('编辑器启动失败仍展示排版正文，点击重试恢复可编辑且未改写文档', true)

  // Definitions with no rendered text and original line endings must survive
  // editing their neighbor. A visual comparison by itself cannot detect this loss.
  const refFile = '内容/链接定义.md'
  fs.writeFileSync(path.join(SB, refFile), [
    '\uFEFF# 链接定义', '', '编辑这句话。', '', '', '使用 [资料][guide]。', '',
    '[guide]: https://example.com/guide "手册"', '[unused]: https://example.com/later', '', ''
  ].join('\r\n'))
  await ev('await window.__reader.loadTree()')
  await editAndReopen(refFile, '编辑这句话。', '已改', ['h1', 'a[href="https://example.com/guide"]'])

  // A closed folder accepts quick drops immediately. Dwelling reveals its next level.
  const dragSample = '内容/临时拖放样本.md'
  const dragBody = '# 拖放测试\n'
  fs.writeFileSync(path.join(SB, dragSample), dragBody)
  await ev('await window.__reader.loadTree()')
  const dragResult = await ev(`
    const target = document.querySelector('.cat-row[data-path="内容/分类甲"]')
    const button = target.querySelector('.folder-toggle')
    const sample = document.querySelector('.doc-row[data-file="内容/临时拖放样本.md"]')
    const dt = new DataTransfer()
    function drag(type, row, relatedTarget = null) {
      const r = row.getBoundingClientRect()
      row.dispatchEvent(new DragEvent(type, { bubbles:true, cancelable:true, dataTransfer:dt,
        clientX:r.left + r.width/2, clientY:r.top + r.height/2, relatedTarget }))
    }
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
    if (button.getAttribute('aria-expanded') === 'true') button.click()
    await pause(300)
    drag('dragstart', sample)
    const internalOnly = dt.types.includes('application/x-typocket-tree-item') &&
      !dt.types.some(type => type.startsWith('text/'))
    drag('dragover', target)
    await new Promise(requestAnimationFrame)
    const acceptsImmediately = target.classList.contains('is-drop') && button.getAttribute('aria-expanded') === 'false'
    drag('dragleave', target, document.body)
    await pause(550)
    const cancelled = button.getAttribute('aria-expanded') === 'false' && !target.classList.contains('is-drop')
    drag('dragover', target)
    await pause(550)
    const expanded = button.getAttribute('aria-expanded') === 'true'
    drag('dragover', sample)
    drag('drop', sample)
    await pause(300)
    return { internalOnly, acceptsImmediately, cancelled, expanded, legal: !target.classList.contains('is-drop') }
  `)
  check('树内拖放不会把文件路径作为文本交给编辑器', dragResult.internalOnly)
  check('文件夹可立即接收，移出取消，停留才展开', dragResult.acceptsImmediately && dragResult.cancelled && dragResult.expanded)
  check('拖回原条目不会误用上一个落点', dragResult.legal && fs.existsSync(path.join(SB, dragSample)))
  await ev(`
    const source = document.querySelector('.doc-row[data-file="内容/临时拖放样本.md"]')
    const target = document.querySelector('.cat-row[data-path="内容/分类甲"]')
    const button = target.querySelector('.folder-toggle')
    if (button.getAttribute('aria-expanded') === 'true') button.click()
    await new Promise(resolve => setTimeout(resolve, 300))
    const dt = new DataTransfer()
    for (const [type,row] of [['dragstart',source],['dragover',target],['drop',target]]) {
      const r = row.getBoundingClientRect()
      row.dispatchEvent(new DragEvent(type, { bubbles:true, cancelable:true, dataTransfer:dt,
        clientX:r.left+r.width/2, clientY:r.top+r.height/2 }))
    }
  `)
  const movedSample = '内容/分类甲/临时拖放样本.md'
  await waitForPage("window.__reader.allDocs.some(doc => doc.file === '内容/分类甲/临时拖放样本.md')")
  check('快速松手只移动样本文档一次并保留原文', !fs.existsSync(path.join(SB, dragSample)) && fs.readFileSync(path.join(SB, movedSample), 'utf8') === dragBody)

  // Tabs belong to the workspace. Two drawers deliberately use the same document name.
  const firstFile = '内容/文档一.md', secondFile = '参考/文档一.md'
  async function waitForPage(expression) {
    for (let i = 0; i < 100; i++) {
      if (await ev('return Boolean(' + expression + ')')) return
      await sleep(80)
    }
    throw new Error('页面状态未就绪：' + expression)
  }
  // Hover and keyboard focus move the native title into the accessible tooltip.
  const tabSelector = file => '.doc-tab-main:is([title="' + file + '"],[data-tooltip="' + file + '"])'
  async function clickTab(file, close = false) {
    const selector = JSON.stringify(tabSelector(file))
    await ev('const button=document.querySelector(' + selector + ');' +
      (close ? "button.closest('.doc-tab').querySelector('.doc-tab-x')" : 'button') + '.click()')
  }
  await ev(`document.querySelector('.doc-row[data-file="内容/文档一.md"] .doc-title').click()`)
  await waitForPage("window.__reader.currentPath === '内容/文档一.md'")
  await ev("document.querySelector('.kb-list-btn').click()")
  await waitForPage("document.querySelector('.lib-row[title=\"参考\"]')")
  await ev("document.querySelector('.lib-row[title=\"参考\"]').click()")
  await waitForPage("window.__reader.currentPath === '参考/文档一.md' && window.__reader.currentLoaded")
  const labels = await ev("return [...document.querySelectorAll('.doc-tab.has-context .doc-tab-main')].map(button => button.getAttribute('aria-label'))")
  check('跨知识库保留两个同名标签，显示所属知识库', labels.some(s => s.includes('内容')) && labels.some(s => s.includes('参考')))


  // Browsing drawers must not change the open document until a file is chosen.
  async function clickShelf(selector) {
    const el = 'document.querySelector(' + JSON.stringify(selector) + ')'
    await waitForPage(el)
    await ev(el + '.click()')
  }
  const entering = '.lib-panel-head .lib-overview-trigger'
  const drawer = '.drawer-card-main[data-path="内容"]'
  const folder = '.drawer-entry[data-path="内容/分类甲"]'
  const article = '.drawer-entry[data-path="内容/分类甲/临时拖放样本.md"]'
  check('文档总览入口位于知识库标题旁，列表滚动时仍可访问', await ev(`
    const button = document.querySelector(${JSON.stringify(entering)})
    const title = button.nextElementSibling, panel = button.closest('.lib-panel')
    const entry = button.getBoundingClientRect(), label = title.getBoundingClientRect()
    return panel.querySelectorAll('[aria-controls="drawer-gallery-page"]').length === 1 &&
      button.getAttribute('aria-label') === '文档总览' && entry.right <= label.left + 1 &&
      Math.abs(entry.y + entry.height / 2 - label.y - label.height / 2) < 1 &&
      entry.bottom <= panel.querySelector('.lib-panel-list').getBoundingClientRect().top + 1`))
  await ev(`document.querySelector(${JSON.stringify(entering)}).focus()`)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  await waitForPage("document.activeElement.matches('.drawer-heading')")
  await waitForPage("document.querySelector('.drawer-card-main[data-path=参考] .drawer-card-preview')?.textContent === '文档一'")
  check('知识库预览和计数都只包含实际可浏览的文档', await ev("return document.querySelector('.drawer-card-main[data-path=参考] .drawer-card-meta').textContent.trim() === '1 篇'"))
  check('总览沿用文档名称，卡片前盖保留连续描边', await ev(`const lip = getComputedStyle(document.querySelector('.drawer-card-main .pocket-lip'))
    return document.querySelector('.drawer-toolbar h1')?.textContent === '文档' &&
      lip.maskImage === 'none' && lip.borderTopStyle === 'solid' && parseFloat(lip.borderTopWidth) >= 1`))
  const shelfCard = '.drawer-card-main[data-path="参考"]'
  const cardGeometry = () => ev(`
    const card = document.querySelector(${JSON.stringify(shelfCard)})
    await document.fonts.ready
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const ancestors = []
    for (let el = card.parentElement; el; el = el.parentElement) ancestors.push(el)
    const animations = [
      ...card.getAnimations({subtree:true}),
      ...ancestors.flatMap(el => el.getAnimations()),
      ...document.querySelector('.lib-panel').getAnimations()
    ]
    await Promise.allSettled(animations.map(animation => animation.finished))
    const rect = el => { const r=el.getBoundingClientRect(); return [r.x,r.y,r.width,r.height] }
    return { card:rect(card), label:rect(card.querySelector('.drawer-card-label')),
      lip:rect(card.querySelector('.pocket-lip')), paper:rect(card.querySelector('.leaf-first')) }`)
  const steady = (a,b) => a.every((v,i) => Math.abs(v-b[i]) < .5)
  const movePointer = (x,y) => send('Input.dispatchMouseEvent', {type:'mouseMoved',x,y})
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
  await ev('document.activeElement?.blur()')
  await movePointer(1,1)
  const closedPocket = await cardGeometry()
  const [cardX,cardY,cardWidth,cardHeight] = closedPocket.card
  const hasMouse = await ev("return matchMedia('(hover:hover) and (pointer:fine)').matches")
  await movePointer(cardX+cardWidth/2, cardY+cardHeight/2)
  if (hasMouse) await waitForPage(`document.querySelector(${JSON.stringify(shelfCard)}).matches(':hover')`)
  const hoveredPocket = await cardGeometry()
  function opened(pose) {
    return pose.lip[2] > closedPocket.lip[2]+1 && pose.paper[1] < closedPocket.paper[1]-3 &&
      steady(pose.card,closedPocket.card) && steady(pose.label,closedPocket.label)
  }
  check('文件夹悬停反馈遵循设备指针能力，名称和按钮保持原位', hasMouse ? opened(hoveredPocket) :
    steady(hoveredPocket.lip, closedPocket.lip) && steady(hoveredPocket.paper, closedPocket.paper),
    JSON.stringify({hasMouse,closed:closedPocket,hovered:hoveredPocket}))
  await movePointer(1,1)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  await ev(`document.querySelector(${JSON.stringify(shelfCard)}).focus({preventScroll:true})`)
  await waitForPage(`document.querySelector(${JSON.stringify(shelfCard)}).matches(':focus-visible')`)
  const focusedPocket = await cardGeometry()
  check('键盘聚焦也张开文件夹前盖并抬起纸张', opened(focusedPocket), JSON.stringify(focusedPocket))
  await ev('document.activeElement?.blur()')
  await send('Emulation.setEmulatedMedia', {features:[]})

  check('四格入口在主区域显示真实文稿，桌面保留快捷知识库栏', await ev(`return document.querySelector('#workspace-gallery-slot .drawer-browser')?.checkVisibility() &&
    document.querySelector('.workspace-reader').inert && document.querySelector('.lib-panel').checkVisibility() &&
    document.querySelector('.drawer-card-main[data-path=参考] .paper-block').textContent.includes('跨知识库样本')`))
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', modifiers: 2 })
  check('画廊中搜索快捷键只作用于可见页面', await ev("return document.activeElement === document.querySelector('.drawer-search input')"))
  // Hold the actual tree response. Every DOM update must still present one complete location.
  await ev(`const page = document.querySelector('.drawer-browser'), original = window.fetch
    const grid = page.querySelector('.drawer-grid')
    let coherent = true
    const observer = new MutationObserver(() => {
      const heading = page.querySelector('.drawer-heading')?.textContent
      const atRoot = heading === '文档' && grid.isConnected && !page.querySelector('.drawer-breadcrumbs')
      const inLibrary = page.querySelector('.drawer-breadcrumbs .drawer-heading')?.textContent === '内容'
        && !grid.isConnected && page.querySelector(${JSON.stringify(folder)})
      if (!atRoot && !inLibrary) coherent = false
    })
    observer.observe(page, { subtree: true, childList: true, characterData: true })
    window.finishShelfCheck = () => { observer.disconnect(); return coherent }
    window.fetch = (...args) => {
      const url = new URL(args[0], location.href)
      if (url.pathname !== '/api/tree' || url.searchParams.get('lib') !== '内容') return original(...args)
      window.fetch = original
      return new Promise(resolve => { window.releaseShelfTree = () => resolve(original(...args)) })
    }`)
  await clickShelf(drawer)
  await waitForPage('typeof window.releaseShelfTree === "function"')
  const keptGrid = await ev(`return document.querySelector('.drawer-grid')?.checkVisibility() &&
    document.querySelector('.drawer-heading')?.textContent === '文档' && !document.querySelector('.drawer-breadcrumbs')`)
  await ev('window.releaseShelfTree()')
  await waitForPage('document.querySelector(' + JSON.stringify(folder) + ')')
  const arrivedTogether = await ev(`return window.finishShelfCheck() &&
    document.querySelector('.drawer-breadcrumbs .drawer-heading')?.textContent === '内容'`)
  check('知识库慢读取时保留原网格，面包屑和文件列表一同切换', keptGrid && arrivedTogether)
  await clickShelf(folder)
  await waitForPage('document.querySelector(' + JSON.stringify(article) + ')')
  check('浏览其他知识库和文件夹保留原文档、地址与标签', await ev("return window.__reader.currentPath === '参考/文档一.md' && new URL(location.href).searchParams.get('lib') === '参考' && !window.__reader.tabs.includes('内容/分类甲/临时拖放样本.md')"))
  await clickShelf('.drawer-close')
  await waitForPage("!document.querySelector('.drawer-browser')")
  check('退出文档总览后焦点回到知识库标题旁的入口', await ev('return document.activeElement.matches(' + JSON.stringify(entering) + ')'))
  await clickShelf(entering)
  await clickShelf(drawer)
  await clickShelf(folder)
  await clickShelf(article)
  await waitForPage("window.__reader.currentPath === '内容/分类甲/临时拖放样本.md' && window.__reader.currentLoaded && !document.querySelector('.drawer-browser')")
  check('打开知识库中的嵌套文档后同步正文、标签和地址', await ev(`
    const activeTab = document.querySelector('.doc-tab.is-active .doc-tab-main')
    return new URL(location.href).searchParams.get('lib') === '内容' &&
      window.__reader.tabs.includes(window.__reader.currentPath) && activeTab?.matches(${JSON.stringify(tabSelector(movedSample))})`))
  await clickTab('内容/分类甲/临时拖放样本.md', true)
  await clickTab(secondFile)
  await waitForPage("window.__reader.currentPath === '参考/文档一.md' && window.__reader.currentLoaded")

  // Keep the input in Milkdown's pending update window when the tab is selected.
  await waitForPage("document.querySelector('.ProseMirror p')?.textContent.includes('跨知识库')")
  await ev(`const p = document.querySelector('.ProseMirror p')
    p.closest('[contenteditable]').focus()
    const range = document.createRange()
    range.selectNodeContents(p); range.collapse(false)
    getSelection().removeAllRanges(); getSelection().addRange(range)`)
  await ev(`const original = window.fetch
    window.fetch = (...args) => args[1]?.method === 'PUT' && new URL(args[0], location.href).pathname.endsWith('/api/doc')
      ? Promise.resolve(new Response(JSON.stringify({ok:false,error:'模拟写入失败'})))
      : original(...args)
    window.restoreFailedWrite = () => { window.fetch = original }`)
  await send('Input.insertText', { text: '切换前的编辑' })
  await clickTab(firstFile)
  await waitForPage("window.__reader.error.includes('模拟写入失败') && !window.__reader.switchingLibrary")
  check('跨知识库写入失败时保留原编辑器、标签与地址', await ev("return window.__reader.isDirty && window.__reader.currentPath === '参考/文档一.md' && document.querySelectorAll('.doc-tab-main').length >= 2 && new URL(location.href).searchParams.get('lib') === '参考'"))
  await ev("window.restoreFailedWrite()")
  await clickTab(firstFile)
  await waitForPage("window.__reader.currentPath === '内容/文档一.md' && window.__reader.currentLoaded")
  check('点旧标签时保存上一知识库并同步侧栏和地址',
    fs.readFileSync(path.join(SB, secondFile), 'utf8').includes('切换前的编辑') &&
    await ev("return new URL(location.href).searchParams.get('lib') === '内容' && document.querySelector('.kb-title').value === '内容'"))

  await ev(`const original = window.fetch
    window.fetch = async (...args) => {
      if (new URL(args[0], location.href).searchParams.get('lib') === '参考') {
        await new Promise(resolve => { window.releaseTabRequest = resolve })
      }
      return original(...args)
    }
    window.restoreTabFetch = () => { window.fetch = original }`)
  await clickTab(secondFile)
  await waitForPage('window.releaseTabRequest')
  await clickTab(firstFile)
  await ev("window.releaseTabRequest();window.restoreTabFetch()")
  await sleep(200)
  check('快速往返后较慢的知识库响应不会覆盖最后选择', await ev("return window.__reader.activeLibrary === '内容' && window.__reader.currentPath === '内容/文档一.md'"))

  // The old per-drawer settings reopen without pulling an owner's tabs into a public view.
  await ev(`localStorage.removeItem('typocket.open-tabs::owner')
    localStorage.setItem('reader.tabs:内容', JSON.stringify(['内容/文档一.md']))
    localStorage.setItem('reader.tabs:参考', JSON.stringify(['参考/文档一.md']))`)
  const delayRestore = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const oldFetch = window.fetch
    window.fetch = async (...args) => {
      const url = new URL(args[0], location.href)
      if (url.pathname.endsWith('/api/resolve') && url.searchParams.get('path') === '参考/文档一.md') {
        await new Promise(resolve => { window.finishTabRestore = resolve })
      }
      return oldFetch(...args)
    }
  ` })
  await send('Page.reload', { ignoreCache: true })
  await waitForPage("window.__reader?.currentLoaded && window.finishTabRestore && document.querySelectorAll('.doc-tab-main').length === 1")
  check('恢复旧标签期间当前文档可先读写', await ev(`return document.querySelector('.doc-tab-main')?.matches(${JSON.stringify(tabSelector(firstFile))})`))
  await ev("window.finishTabRestore()")
  await send('Page.removeScriptToEvaluateOnNewDocument', {identifier: delayRestore.identifier})
  await waitForPage("document.querySelectorAll('.doc-tab-main').length === 2")
  check('升级时恢复两个知识库原有标签', await ev("return window.__reader.tabs.join('|').includes('参考/文档一.md')"))
  await clickTab(firstFile, true)
  await waitForPage("window.__reader.tabs.length === 1 && window.__reader.currentPath === '参考/文档一.md'")
  check('关闭当前标签直接回到其他知识库的邻居', await ev("return window.__reader.activeLibrary === '参考' && new URL(location.href).searchParams.get('lib') === '参考'"))

  async function openRecentMenu() {
    await ev("document.querySelector('.doc-quick').click()")
    await waitForPage("document.querySelector('.quick-open-doc')")
    return ev("return [...document.querySelectorAll('.quick-open-doc')].map(row => [row.querySelector('.quick-open-name').textContent,row.querySelector('small').textContent])")
  }
  let recentRows = await openRecentMenu()
  const twins = recentRows.filter(([name]) => name === '文档一').map(([,folder]) => folder)
  check('加号列出其他知识库中已经关闭的同名文档，并标明来源', recentRows.length <= 6 && twins.includes('内容') && twins.includes('参考'))
  await ev("document.querySelectorAll('.quick-open-doc').forEach(row => { if(row.querySelector('small').textContent==='内容' && row.querySelector('.quick-open-name').textContent==='文档一') row.click() })")
  await waitForPage("window.__reader.currentPath === '内容/文档一.md' && window.__reader.currentLoaded")
  check('从加号重新打开跨知识库文档后同步标签、侧栏与地址', await ev("return window.__reader.tabs.includes('内容/文档一.md') && document.querySelector('.kb-title').value === '内容' && new URL(location.href).searchParams.get('lib') === '内容'"))

  // Rename from another client, then reuse the old filename for a different document.
  await clickTab(firstFile, true)
  await waitForPage("window.__reader.currentPath === '参考/文档一.md'")
  for (const [method, payload] of [['PATCH',{path:firstFile,name:'改名后的文档'}],['POST',{dir:'内容',name:'文档一'}]]) {
    const response = await fetch(new URL('api/doc', appUrl), {method, headers:{'content-type':'application/json'}, body:JSON.stringify(payload)})
    if (!(await response.json()).ok) throw Error('临时改名样本未就绪')
  }
  recentRows = await openRecentMenu()
  check('其他窗口改名后最近文档跟随原文档，即使旧文件名已被重新使用', recentRows.some(([name,folder]) => name==='改名后的文档' && folder==='内容') && !recentRows.some(([name,folder])=>name==='文档一' && folder==='内容'))

  await ev(`window.beforeRecentMigration = true
    localStorage.removeItem('typocket.recent-docs::owner')
    localStorage.setItem('reader.recent-docs',JSON.stringify([
      {file:'内容/已删除的文档.md',at:Date.now()-1000},
      {file:'内容/表格文档.md',at:Date.now()-2000}
    ]))`)
  await send('Page.reload', {ignoreCache:true})
  await waitForPage("!window.beforeRecentMigration && window.__reader?.currentLoaded && window.__reader.tabs.length === 1")
  recentRows = await openRecentMenu()
  check('本机升级后能找回已关闭的旧记录，并跳过失效路径', recentRows.some(([name,folder]) => name==='表格文档' && folder==='内容') && !recentRows.some(([name])=>name==='已删除的文档'))

  const share = await fetch(new URL('api/access', appUrl), {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({path: '内容', shared: true})
  })
  if (!(await share.json()).ok) throw Error('无法准备公开阅读样本')
  await ev("localStorage.setItem('typocket.open-tabs::guest', JSON.stringify(['参考/文档一.md','内容/文档一.md']))")
  await ev(`localStorage.setItem('typocket.recent-docs::guest',JSON.stringify([{file:'参考/文档一.md',at:Date.now()}]))
    localStorage.setItem('typocket.recent-docs:/other:guest',JSON.stringify([{file:'内容/表格文档.md',at:Date.now()}]))`)
  await send('Page.navigate', {url: new URL('onlyread/内容/文档一?lib=内容', appUrl).href})
  await waitForPage('window.__reader?.isGuest && window.__reader.currentLoaded && !window.__reader.tabs.includes("参考/文档一.md")')
  check('访客刷新只恢复仍可见的文档', await ev("return [...document.querySelectorAll('.doc-tab-main')].every(button => (button.title || button.dataset.tooltip || '').startsWith('内容/'))"))

  const guestLibraries = await ev("return (await fetch('/api/libs?preview=1').then(res => res.json())).data.libs")
  check('公开视角不会收到知识库内容预览', guestLibraries.length > 0 && guestLibraries.every(lib => !('previewName' in lib)))

  recentRows = await openRecentMenu()
  check('访客加号不显示已撤权、其他实例和管理者的最近文档', recentRows.length === 1 && recentRows[0][0] === '文档一' && recentRows[0][1] === '内容')

  // Use an actual long library name so both the collapsed label and the editable input render normally.
  const longLibrary = '城市公共空间中的影像观察与叙事研究'
  fs.mkdirSync(path.join(SB, longLibrary))
  fs.writeFileSync(path.join(SB, longLibrary, '观察记录.md'), '# 观察记录\n\n## 街道\n')
  await ev("localStorage.setItem('reader.navW','180');localStorage.setItem('reader.nav','0')")
  await send('Page.navigate', { url: new URL('doc/' + longLibrary + '/观察记录?lib=' + longLibrary, appUrl).href })
  await waitForPage("document.querySelector('.kb-title')?.value === " + JSON.stringify(longLibrary))
  if (await ev("return document.querySelector('.sidebar-toggle').getAttribute('aria-expanded') === 'false'")) await clickShelf('.sidebar-toggle')
  await waitForPage("!document.querySelector('.side-header.is-expanding')")
  check('窄侧栏中的长知识库名为操作按钮留出间距', await ev(`const title = document.querySelector('.kb-title'), actions = document.querySelector('.sidebar-actions')
    return title.scrollWidth > title.clientWidth && title.getBoundingClientRect().right + 4 <= actions.getBoundingClientRect().left`))
  check('侧栏开合全程只绘制一层知识库标题', await ev(`
    const name = document.querySelector('.kb-title-text')
    const label = name.closest('button'), input = document.querySelector('.kb-title')
    const toggle = document.querySelector('.sidebar-toggle')
    for (let i = 0; i < 2; i++) {
      toggle.click()
      const start = performance.now()
      do {
        await new Promise(requestAnimationFrame)
        const labelStyle = getComputedStyle(label), inputStyle = getComputedStyle(input)
        if (!name.isConnected || !name.getBoundingClientRect().width ||
            labelStyle.opacity !== '1' || labelStyle.visibility !== 'visible' ||
            (inputStyle.opacity !== '0' && inputStyle.display !== 'none')) return false
      } while (performance.now() - start < 400)
    }
    return true`))
  await send('Emulation.setTouchEmulationEnabled', { enabled:true })
  await send('Emulation.setDeviceMetricsOverride', { width:320, height:700, deviceScaleFactor:1, mobile:true })
  await waitForPage("document.querySelector('.sidebar-toggle').getAttribute('aria-expanded') === 'false'")
  await clickShelf('.sidebar-toggle')
  await waitForPage("document.querySelector('.sidebar-body').getBoundingClientRect().width >= 319")
  await clickShelf('.tree-sort-control > button')
  await clickShelf('.batch-start')
  await waitForPage("document.activeElement.matches('.batch-check')")
  await clickShelf('.batch-check')
  check('触屏可直接进入多选，操作按钮有足够点按空间', await ev(`const bar = document.querySelector('.batch-bar')
    return bar.querySelector('[role=status]').textContent.includes('1') && [...bar.querySelectorAll('button')].every(button => button.getBoundingClientRect().height >= 44)`))
  await clickShelf('.batch-bar button')
  await waitForPage("document.activeElement === document.querySelector('.tree-sort-control > button')")
  await clickShelf('.doc-row .doc-title')
  await waitForPage("document.querySelector('.sidebar-toggle').getAttribute('aria-expanded') === 'false'")
  check('手机选择文档后恢复阅读，标签和操作入口都在视窗内', await ev(`const tabs = document.querySelector('.doc-tabs').getBoundingClientRect(), more = document.querySelector('.doc-more > button').getBoundingClientRect()
    return tabs.width > 0 && more.left >= tabs.right && more.right <= innerWidth && document.documentElement.scrollWidth === innerWidth`))

  await send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await send('Emulation.clearDeviceMetricsOverride')
  await runFormulaEditor({ send, ev, root: SB, appUrl, sleep })
  check('公式编辑、撤销、保存和重开保持原文', true)

  await verifySurfaceMotion({ send, ev, root: SB, appUrl, sleep })
  check('浮层在最终位置淡入，PDF 开关查找时正文保持原位', true)

  await verifyEditorClipboard({ send, ev, root: SB, appUrl, sleep })
  check('正文剪贴保留结构，选段可交接给 Agent，拒绝读取或写入时保护原文', true)

  await verifyTabResume({ send, ev, root: SB, appUrl, sleep })
  check('长文标签恢复阅读和编辑位置，后台修改及同路径重建可见', true)

  await verifyFind({ send, ev, root: SB, appUrl, sleep })
  check('正文逐处查找与跨库搜索精确定位，覆盖未打开的知识库', true)

  await verifyNavigationMotion({ send, ev, root: SB, appUrl, sleep })
  check('知识库排序和文件夹收合时高亮跟随行，长文目录只测量可见导航所需位置', true)

  await verifyConcurrentEdits({ send, ev, root: SB, appUrl, sleep })
  check('并发编辑自动合并、手动草稿、采用最新磁盘版本和重开', true)

  await verifyReferences({ send, ev, root: SB, appUrl, sleep })
  check('跨库引用恢复章节、PDF 页码和索引的阅读位置', true)

  await verifyWorkspaceChrome({ send, ev, root: SB, appUrl, sleep })
  check('跨库标签、知识库名称和阅读设置在布局变化时各自保持对齐', true)

  await verifyTabMotion({ send, ev, root: SB, appUrl, sleep })
  check('标签背景平滑变宽、反向续接、跟随关闭和滚动，减少动态时立即对齐', true)

  await verifyShareHandoff({ send, ev, root: SB, appUrl, sleep })
  check('分享提示词只携带所选目标，支持拒绝剪贴板后的手动复制', true)

  const real = consoleErrors.filter(e => !/favicon|DevTools|Download the Vue/i.test(e))
  check('运行期无控制台报错', real.length === 0, real.slice(0, 2).join(' | '))
} catch (e) {
  console.log('中断:', e.message)
  results.push({ name: 'harness', pass: false })
} finally {
  try { ws?.close() } catch {}
  if (chrome?.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const stopped = once(chrome, 'exit')
    chrome.kill()
    await stopped
  }
  if (server?.listening) {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
  await vite?.close()
  fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 })
}

const pass = results.filter((r) => r.pass).length
console.log(`\n通过 ${pass}/${results.length}`)

process.exit(pass === results.length ? 0 : 1)
