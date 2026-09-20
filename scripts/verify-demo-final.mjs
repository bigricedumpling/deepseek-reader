import fs from 'node:fs'
import { launchChrome, freePort, sleep } from '../../eval/server/browser.js'
const OUT = '/tmp/demo-final'
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })
const port = await freePort(); const dir = fs.mkdtempSync('/tmp/df2-')
const chrome = launchChrome({ port, userDataDir: dir, size: { w: 1440, h: 900 } })
let target = null
for (let i = 0; i < 30 && !target; i++) { try { const l = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); target = l.find(t => t.type === 'page') } catch {}; if (!target) await sleep(500) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) })
let id = 0; const pending = new Map(); const cons = []
ws.onmessage = e => { const q = JSON.parse(e.data); if (q.id && pending.has(q.id)) { const p = pending.get(q.id); pending.delete(q.id); q.error ? p.rej(new Error(q.error.message)) : p.res(q.result); return } if (q.method === 'Runtime.exceptionThrown') cons.push((q.params.exceptionDetails?.exception?.description||'').slice(0,140)) }
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return null; return r.result.value }
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + '/' + n + '.png', Buffer.from(r.data, 'base64')); console.log('  已存 ' + n + '.png') }
const waitFor = async (expr, secs = 30) => { for (let i = 0; i < secs * 2; i++) { const v = await ev(expr); if (v) return v; await sleep(500) } return null }
const foot = () => ev("(document.querySelector('.reader-bottombar')||{}).innerText || '-'" )
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
const B = 'https://zangqucheng.site/deepseek/demo/edit?token=b6829fe6692f9cc05d4e3f0f8923073e'
await send('Page.navigate', { url: B }); await sleep(8000)
await waitFor("document.body.innerText.length > 300", 40)
await sleep(2500)
console.log('  标题: ' + await ev('document.title'))
console.log('  侧栏: ' + JSON.stringify(await ev("[...document.querySelectorAll('.doc-title, .pdf-title')].map(x=>x.innerText.trim()).filter(Boolean)")))
await shot('目录')
console.log('  点 产品白皮书: ' + await ev("(function(){ var e=[...document.querySelectorAll('.pdf-title')].find(x=>x.innerText.indexOf('产品白皮书')>=0); if(!e) return 'no'; e.click(); return 'ok' })()"))
await sleep(7000)
console.log('    iframe: ' + await ev("!!document.querySelector('.pdf-frame')") + '  页脚: ' + await foot())
await shot('PDF')
console.log('  点 检索控制台: ' + await ev("(function(){ var e=[...document.querySelectorAll('.pdf-title')].find(x=>x.innerText.indexOf('检索控制台')>=0); if(!e) return 'no'; e.click(); return 'ok' })()"))
await sleep(8000)
console.log('    iframe: ' + await ev("!!document.querySelector('.pdf-frame')") + '  页脚: ' + await foot())
await shot('H5')
console.log('异常: ' + (cons.length ? JSON.stringify(cons.slice(0,2)) : '无'))
ws.close(); chrome.kill()
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) } catch {}