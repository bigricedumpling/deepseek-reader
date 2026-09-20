import fs from 'node:fs'
import { launchChrome, freePort, sleep } from '../../eval/server/browser.js'
const port = await freePort(); const dir = fs.mkdtempSync('/tmp/diag2-')
const chrome = launchChrome({ port, userDataDir: dir, size: { w: 1440, h: 900 } })
let target = null
for (let i = 0; i < 30 && !target; i++) { try { const l = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); target = l.find(t => t.type === 'page') } catch {}; if (!target) await sleep(500) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) })
let id = 0; const pending = new Map()
ws.onmessage = e => { const q = JSON.parse(e.data); if (q.id && pending.has(q.id)) { const p = pending.get(q.id); pending.delete(q.id); q.error ? p.rej(new Error(q.error.message)) : p.res(q.result) } }
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.log('  求值错: ' + (r.exceptionDetails.exception?.description||'').slice(0,120)); return null } return r.result.value }
await send('Page.enable'); await send('Runtime.enable')
const TOKEN = 'b6829fe6692f9cc05d4e3f0f8923073e'
await send('Page.navigate', { url: 'https://zangqucheng.site/deepseek/demo/edit?token=' + TOKEN + '#' }); await sleep(9000)
console.log('  点 PDF: ' + await ev("(function(){ var e=[...document.querySelectorAll('.pdf-title')].find(x=>x.innerText.indexOf('产品白皮书')>=0); if(!e) return 'no'; e.click(); return 'ok' })()"))
await sleep(7000)
console.log('  iframe src: ' + await ev("(document.querySelector('.pdf-frame')||{}).src || '（无 iframe）'"))
console.log('  iframe 内容前 80 字: ' + await ev("(function(){ try { var d=document.querySelector('.pdf-frame').contentDocument; return d ? (d.body ? d.body.innerText.slice(0,80) : '(无 body)') : '(拿不到 contentDocument)'; } catch(e) { return 'ERR ' + e.message } })()"))
ws.close(); chrome.kill()
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) } catch {}