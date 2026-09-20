import fs from 'node:fs'
import { launchChrome, freePort, sleep } from '../../eval/server/browser.js'
const OUT = '/tmp/demo-final'
const port = await freePort(); const dir = fs.mkdtempSync('/tmp/h5-')
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
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
const T = 'b6829fe6692f9cc05d4e3f0f8923073e'
await send('Page.navigate', { url: 'https://zangqucheng.site/deepseek/demo/edit?token=' + T }); await sleep(9000)
console.log('  点 检索控制台: ' + await ev("(function(){ var e=[...document.querySelectorAll('.pdf-title')].find(x=>x.innerText.indexOf('检索控制台')>=0); if(!e) return 'no'; e.click(); return 'ok' })()"))
await sleep(9000)
console.log('  iframe src: ' + await ev("(document.querySelector('.pdf-frame')||{}).src || '无'"))
console.log('  iframe 里渲染出的文字: ' + await ev("(function(){ try { var d=document.querySelector('.pdf-frame').contentDocument; if(!d||!d.body) return '(拿不到)'; return d.body.innerText.replace(/\\s+/g,' ').slice(0,120); } catch(e){ return 'ERR ' + e.message } })()"))
await shot('H5-单独')
ws.close(); chrome.kill()
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) } catch {}