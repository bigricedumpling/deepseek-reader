import fs from 'node:fs'
import { launchChrome, freePort, sleep } from '../../eval/server/browser.js'
const OUT = '/tmp/demo-site'
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })
const port = await freePort(); const dir = fs.mkdtempSync('/tmp/ds-')
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
const URL = 'https://zangqucheng.site/deepseek/demo/edit?token=5e551f8164575a7c3b289bb5bef7bbae'
await send('Page.navigate', { url: URL }); await sleep(7000)
await waitFor("document.body.innerText.length > 400", 40)
await sleep(3000)
const info = await ev("(function(){ return { title: document.title, h1: (document.querySelector('h1')||{}).innerText||'-', len: document.body.innerText.length, editable: !!document.querySelector('.crepe-host .ProseMirror'), sidebar: [...document.querySelectorAll('nav a, aside a, .tree a, .doc-item')].map(x=>x.innerText.trim()).filter(Boolean).slice(0,12), logo: (document.querySelector('.brand, header img, .logo')||{}).tagName||'-', lossy: !!document.querySelector('.lossy-note') } })()")
console.log('  标题: ' + info.title)
console.log('  h1: ' + info.h1)
console.log('  可编辑: ' + info.editable + '  降级: ' + info.lossy)
console.log('  侧栏: ' + JSON.stringify(info.sidebar))
await shot('示例库-编辑模式')
console.log('控制台异常: ' + (cons.length ? JSON.stringify(cons.slice(0,3)) : '无'))
ws.close(); chrome.kill()
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) } catch {}