import fs from 'node:fs'
import { launchChrome, freePort, sleep } from '../../eval/server/browser.js'
const OUT = '/tmp/final-check2'
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })
const port = await freePort(); const dir = fs.mkdtempSync('/tmp/fc2-')
const chrome = launchChrome({ port, userDataDir: dir, size: { w: 1440, h: 900 } })
let target = null
for (let i = 0; i < 30 && !target; i++) { try { const l = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); target = l.find(t => t.type === 'page') } catch {}; if (!target) await sleep(500) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) })
let id = 0; const pending = new Map()
ws.onmessage = e => { const q = JSON.parse(e.data); if (q.id && pending.has(q.id)) { const p = pending.get(q.id); pending.delete(q.id); q.error ? p.rej(new Error(q.error.message)) : p.res(q.result) } }
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return null; return r.result.value }
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + '/' + n + '.png', Buffer.from(r.data, 'base64')); console.log('  已存 ' + n + '.png') }
const waitFor = async (expr, secs = 30) => { for (let i = 0; i < secs * 2; i++) { const v = await ev(expr); if (v) return v; await sleep(500) } return null }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
console.log('一、报告（找链接）')
await send('Page.navigate', { url: 'https://zangqucheng.site/deepseek/reader/onlyread/' + ['笔试题','笔试题交付：题目一'].map(encodeURIComponent).join('/') }); await sleep(8000)
await waitFor("document.body.innerText.length > 2000", 40)
const link = await ev("(function(){ var a=[...document.querySelectorAll('a')].find(x=>x.innerText.indexOf('示例知识库')>=0); return a ? a.getAttribute('href') : '（没找到）' })()")
console.log('  链接: ' + link)
console.log('  报告字数: ' + await ev('document.body.innerText.length'))
/* 点那个链接 */
if (link && link !== '（没找到）') {
  await send('Page.navigate', { url: link }); await sleep(9000)
  await waitFor("document.body.innerText.length > 200", 40)
  await sleep(2000)
  console.log('  跳过去之后的标题: ' + await ev('document.title'))
  console.log('  侧栏: ' + JSON.stringify(await ev("[...document.querySelectorAll('.doc-title, .pdf-title')].map(x=>x.innerText.trim()).filter(Boolean)")))
  await shot('从报告进来')
}
ws.close(); chrome.kill()
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) } catch {}