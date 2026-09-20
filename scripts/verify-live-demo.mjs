import fs from 'node:fs'
import { launchChrome, freePort, sleep } from '../../eval/server/browser.js'
const OUT = '/tmp/final-check'
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })
const port = await freePort(); const dir = fs.mkdtempSync('/tmp/fc-')
const chrome = launchChrome({ port, userDataDir: dir, size: { w: 1440, h: 900 } })
let target = null
for (let i = 0; i < 30 && !target; i++) { try { const l = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); target = l.find(t => t.type === 'page') } catch {}; if (!target) await sleep(500) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) })
let id = 0; const pending = new Map(); const cons = []
ws.onmessage = e => { const q = JSON.parse(e.data); if (q.id && pending.has(q.id)) { const p = pending.get(q.id); pending.delete(q.id); q.error ? p.rej(new Error(q.error.message)) : p.res(q.result); return } if (q.method === 'Runtime.exceptionThrown') cons.push((q.params.exceptionDetails?.exception?.description||'').slice(0,150)) }
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.log('  求值出错: ' + (r.exceptionDetails.exception?.description||'').slice(0,120)); return null } return r.result.value }
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + '/' + n + '.png', Buffer.from(r.data, 'base64')); console.log('  已存 ' + n + '.png') }
const waitFor = async (expr, secs = 30) => { for (let i = 0; i < secs * 2; i++) { const v = await ev(expr); if (v) return v; await sleep(500) } return null }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
const B = 'https://zangqucheng.site/deepseek/reader/onlyread/'
/* 逐段编码：整段 encodeURIComponent 会把斜杠也编码掉，路由就匹配不上了 */
const enc = p => p.split('/').map(encodeURIComponent).join('/')

console.log('一、报告（看链接在不在）')
await send('Page.navigate', { url: B + enc('笔试题/笔试题交付：题目一') }); await sleep(6000)
await waitFor("document.body.innerText.length > 2000", 30)
const rep = await ev("(function(){ var a=[...document.querySelectorAll('a')].find(x=>x.innerText.indexOf('想试编辑功能')>=0||x.innerText.indexOf('示例知识库')>=0); return { len: document.body.innerText.length, link: a ? a.getAttribute('href') : '(没找到链接)', lossy: !!document.querySelector('.lossy-note') } })()")
console.log('  ' + JSON.stringify(rep))
await shot('报告-含示例库入口')

console.log('二、示例库 README')
await send('Page.navigate', { url: B + enc('示例库/README') }); await sleep(5000)
await waitFor("document.body.innerText.length > 500", 30)
const demo = await ev("(function(){ return { h1: (document.querySelector('h1')||{}).innerText||'-', len: document.body.innerText.length, tables: document.querySelectorAll('table').length, lossy: !!document.querySelector('.lossy-note'), editor: !!document.querySelector('.crepe-host .ProseMirror') } })()")
console.log('  ' + JSON.stringify(demo))
await shot('示例库-README')

console.log('三、示例库长文（看右侧目录）')
await send('Page.navigate', { url: B + enc('示例库/06-长文与目录') }); await sleep(5000)
await waitFor("document.body.innerText.length > 500", 30)
const toc = await ev("(function(){ return { len: document.body.innerText.length, tocItems: document.querySelectorAll('.toc a, .toc-item, aside a').length, lossy: !!document.querySelector('.lossy-note') } })()")
console.log('  ' + JSON.stringify(toc))
await shot('示例库-长文与目录')
console.log('控制台异常: ' + (cons.length ? JSON.stringify(cons.slice(0,3)) : '无'))
ws.close(); chrome.kill()
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) } catch {}