import fs from 'node:fs'
import { launchChrome, freePort, sleep } from '../../eval/server/browser.js'
const OUT = '/tmp/demo-check'
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })
const port = await freePort(); const dir = fs.mkdtempSync('/tmp/dc3-')
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
const waitFor = async (expr, secs = 25) => { for (let i = 0; i < secs * 2; i++) { const v = await ev(expr); if (v) return v; await sleep(500) } return null }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
const pages = [
  ['/onlyread/知识库/交付/笔试题/笔试题交付：题目一', '报告-题目一'],
  ['/onlyread/知识库/示例库/01-编辑入门', '01-编辑入门'],
  ['/onlyread/知识库/交付/笔试题/笔试题交付：题目一', '报告-题目一'],
  ['/onlyread/知识库/示例库/01-编辑入门', '01-编辑入门'],
  ['/onlyread/知识库/示例库/06-长文与目录', '06-长文与目录'],
]
for (const [path, name] of pages) {
  await send('Page.navigate', { url: 'http://127.0.0.1:8090' + encodeURI(path) }); await sleep(3500)
  await waitFor("document.body.innerText.length > 300", 20)
  await sleep(1200)
  const info = await ev("(function(){ var b=document.querySelector('.md-body')||document.body; return { h1: (b.querySelector('h1')||{}).innerText||'-', len: b.innerText.length, table: b.querySelectorAll('table').length, katex: b.querySelectorAll('.katex').length, fn: b.querySelectorAll('.footnotes li').length, box: b.querySelectorAll('input[type=checkbox]').length } })()")
  console.log('  ' + name + ': ' + JSON.stringify(info))
  await shot(name)
}
console.log('控制台异常: ' + (cons.length ? JSON.stringify(cons.slice(0,3)) : '无'))
ws.close(); chrome.kill()
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) } catch {}