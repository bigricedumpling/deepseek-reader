import fs from 'node:fs'
import { launchChrome, freePort, sleep } from '../../eval/server/browser.js'
const port = await freePort(); const dir = fs.mkdtempSync('/tmp/err-')
const chrome = launchChrome({ port, userDataDir: dir, size: { w: 1440, h: 900 } })
let target = null
for (let i = 0; i < 30 && !target; i++) { try { const l = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); target = l.find(t => t.type === 'page') } catch {}; if (!target) await sleep(500) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) })
let id = 0; const pending = new Map()
ws.onmessage = e => { const q = JSON.parse(e.data); if (q.id && pending.has(q.id)) { const p = pending.get(q.id); pending.delete(q.id); q.error ? p.rej(new Error(q.error.message)) : p.res(q.result) } }
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.log('  求值错: ' + (r.exceptionDetails.exception?.description||'').slice(0,100)); return null } return r.result.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: 'https://zangqucheng.site/deepseek/demo/edit?token=5e551f8164575a7c3b289bb5bef7bbae' }); await sleep(9000)
console.log('  顶部是否红字提示: ' + await ev("!!document.querySelector('.text-\\[\\#c0392b\\]')"))
console.log('  页面里含 Unexpected 的文本: ' + await ev("[...document.querySelectorAll('*')].filter(x=>x.children.length===0&&x.innerText&&x.innerText.indexOf('Unexpected')>=0).map(x=>x.innerText).slice(0,2).join(' | ') || '（没有）'"))
console.log('  brand: ' + await ev("localStorage.getItem('reader.brand')"))
console.log('  logo: ' + await ev("localStorage.getItem('reader.logo')"))
console.log('  正文头部: ' + await ev("(document.querySelector('.md-body, .crepe-host')||{}).innerText ? document.querySelector('.md-body, .crepe-host').innerText.replace(/\\s+/g,' ').slice(0,60) : '（无正文）'"))
/* 手动打一次文档接口，看返回什么 */
console.log('  /api/doc 返回前 80 字: ' + await ev("fetch('/deepseek/demo/api/doc?path=README.md',{headers:{'x-reader-mode':'owner','x-reader-token':'5e551f8164575a7c3b289bb5bef7bbae'}}).then(r=>r.text()).then(t=>t.slice(0,80))"))
ws.close(); chrome.kill()
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) } catch {}