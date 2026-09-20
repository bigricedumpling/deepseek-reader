import fs from 'node:fs'
import { launchChrome, freePort, sleep } from '../../eval/server/browser.js'
const port = await freePort(); const dir = fs.mkdtempSync('/tmp/net-')
const chrome = launchChrome({ port, userDataDir: dir, size: { w: 1440, h: 900 } })
let target = null
for (let i = 0; i < 30 && !target; i++) { try { const l = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); target = l.find(t => t.type === 'page') } catch {}; if (!target) await sleep(500) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) })
let id = 0; const pending = new Map(); const reqs = []
ws.onmessage = e => { const q = JSON.parse(e.data);
  if (q.id && pending.has(q.id)) { const p = pending.get(q.id); pending.delete(q.id); q.error ? p.rej(new Error(q.error.message)) : p.res(q.result); return }
  if (q.method === 'Network.responseReceived') { const r = q.params.response; if (r.url.includes('/api/') || r.url.includes('.json')) reqs.push({ url: r.url.replace('https://zangqucheng.site',''), status: r.status, mime: r.mimeType }) }
  if (q.method === 'Network.loadingFailed') reqs.push({ url: q.params.requestId, status: 'FAILED', mime: q.params.errorText })
}
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return null; return r.result.value }
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
await send('Page.navigate', { url: 'https://zangqucheng.site/deepseek/demo/edit?token=5e551f8164575a7c3b289bb5bef7bbae' }); await sleep(9000)
console.log('  请求记录:')
for (const r of reqs) console.log('    ' + String(r.status).padEnd(7) + (r.mime||'').padEnd(28) + r.url.slice(0, 80))
const attrs = await ev("JSON.stringify({ brand: localStorage.getItem('reader.brand'), logo: localStorage.getItem('reader.logo'), err: (document.querySelector('.text-\\[\\#c0392b\\]')||{}).innerText || '无' })")
console.log('  页面状态: ' + attrs)
ws.close(); chrome.kill()
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) } catch {}